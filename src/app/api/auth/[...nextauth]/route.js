import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import getPrisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { checkBruteForce, recordFailedLogin, clearBruteForce } from "@/lib/auth-security";
import { effectiveRole, grantBetaProIfEligible } from "@/lib/beta";
import { sendLifecycleEmails } from "@/lib/lifecycle-emails";

const prisma = getPrisma();

// Cross-subdomain auth. When COOKIE_DOMAIN is set (e.g. ".jotril.com"), NextAuth's
// cookies are scoped to the PARENT domain, so a session created on the main app is also
// recognized on sibling subdomains (admin.jotril.com → /admin via the vercel.json host
// rewrites). When UNSET we add no `cookies` config at all, so NextAuth uses its built-in
// host-only defaults — i.e. this is a guaranteed no-op until COOKIE_DOMAIN is configured.
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const useSecureCookies = process.env.NODE_ENV === 'production';
const securePrefix = useSecureCookies ? '__Secure-' : '';
const crossSubdomainCookies = cookieDomain ? {
    sessionToken: {
        name: `${securePrefix}next-auth.session-token`,
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies, domain: cookieDomain },
    },
    callbackUrl: {
        name: `${securePrefix}next-auth.callback-url`,
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies, domain: cookieDomain },
    },
    csrfToken: {
        // Drop the default __Host- prefix — it forbids a Domain attribute, so CSRF
        // couldn't be shared across subdomains otherwise.
        name: `${securePrefix}next-auth.csrf-token`,
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies, domain: cookieDomain },
    },
} : undefined;

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    pages: {
        signIn: '/auth/signin',
    },
    ...(crossSubdomainCookies ? { cookies: crossSubdomainCookies } : {}),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
        }),
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
                devPin: { label: "Dev PIN", type: "password" }
            },
            async authorize(credentials, req) {
                if (credentials?.devPin) {
                    // Dev-admin PIN login is a LOCAL-DEV-ONLY convenience. It is hard-disabled
                    // in production (no admin backdoor in the deployed app) and requires DEV_PIN
                    // to be set explicitly — there is deliberately no hardcoded fallback. The error
                    // message stays generic so the deployed app never confirms a dev path exists.
                    const devLoginEnabled = process.env.NODE_ENV !== 'production' && !!process.env.DEV_PIN;
                    if (!devLoginEnabled || credentials.devPin !== process.env.DEV_PIN) {
                        throw new Error(JSON.stringify({ message: "Invalid credentials" }));
                    }
                    // Ensure a real DB user exists for dev-admin so FK constraints work
                    const devPrisma = getPrisma();
                    await devPrisma.user.upsert({
                        where: { id: 'dev-admin-id' },
                        update: {},
                        create: {
                            id: 'dev-admin-id',
                            name: 'Dev Admin',
                            email: 'dev@antigravity.local',
                            role: 'ADMIN',
                            emailVerified: new Date(),
                        }
                    });
                    return {
                        id: 'dev-admin-id',
                        name: 'Dev Admin',
                        email: 'dev@antigravity.local',
                        role: 'ADMIN',
                        isDev: true
                    };
                }

                if (!credentials?.email || !credentials?.password) {
                    throw new Error(JSON.stringify({ message: "Email and password are required" }));
                }

                const email = credentials.email.toLowerCase();

                // 1. Check brute force status
                const bruteStatus = await checkBruteForce(email);
                if (!bruteStatus.allowed) {
                    const unlockTime = new Date(bruteStatus.lockedUntil).toLocaleTimeString();
                    throw new Error(JSON.stringify({
                        message: `Account temporarily locked due to too many failed attempts. Try again after ${unlockTime}.`
                    }));
                }

                // 2. Find User
                const prisma = getPrisma();
                const user = await prisma.user.findUnique({
                    where: { email }
                });

                if (!user || !user.password) {
                    // Record failed attempt even if user doesn't exist (prevents user enumeration)
                    const newStatus = await recordFailedLogin(email);
                    throw new Error(JSON.stringify({
                        message: `Invalid credentials. ${newStatus.remainingTries} tries left.`
                    }));
                }

                // 3. Verify Password
                const isValidPassword = await bcrypt.compare(credentials.password, user.password);

                if (!isValidPassword) {
                    const newStatus = await recordFailedLogin(email);
                    if (!newStatus.allowed) {
                        throw new Error(JSON.stringify({
                            message: `Account locked. Too many failed attempts.`
                        }));
                    }
                    throw new Error(JSON.stringify({
                        message: `Invalid credentials. ${newStatus.remainingTries} tries left.`
                    }));
                }

                // 4. Verify Email Status
                if (!user.emailVerified) {
                    throw new Error(JSON.stringify({
                        message: 'Please verify your email address before signing in.'
                    }));
                }

                // 5. Success! Clear brute force record
                await clearBruteForce(email);

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    roleExpiresAt: user.roleExpiresAt
                };
            }
        })
    ],
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            if (user) {
                if (user.id === 'dev-admin-id') {
                    token.role = user.role;
                    token.id = user.id;
                    token.isDev = true;
                } else {
                    // If OAuth user just got created/signed-in, they may not have a role in the object yet,
                    // but the Prisma schema defaults to 'FREE'. Let's ensure it's on the token.
                    const dbUser = await prisma.user.findUnique({ where: { email: token.email } });
                    let resolved = dbUser;
                    // Beta comp for OAuth (Google) CU students: they never hit /api/auth/verify-email
                    // (Google verifies the email), so grant here on sign-in. Idempotent — a credentials
                    // user already granted at verification returns `already_beta` and re-grants nothing.
                    if (dbUser) {
                        try {
                            const beta = await grantBetaProIfEligible(prisma, dbUser);
                            if (beta.granted) {
                                resolved = { ...dbUser, role: 'PRO', roleExpiresAt: beta.expiresAt };
                            }
                            // One-time welcome + Pro emails on sign-in. Cheap no-op once both
                            // flags are set, so it also backfills any existing user who never
                            // got them the first time they next log in. Best-effort.
                            await sendLifecycleEmails(prisma, resolved);
                        } catch (e) {
                            console.warn('[jwt] beta grant / lifecycle email failed', e);
                        }
                    }
                    token.role = resolved?.role || user.role || 'FREE';
                    token.roleExpiresAt = resolved?.roleExpiresAt || user.roleExpiresAt || null;
                    token.id = resolved?.id || user.id;
                }
            }
            // Allow manual role updates (e.g. from admin panel modifying sessions)
            if (trigger === "update" && session?.role) {
                token.role = session.role;
                token.roleExpiresAt = session.roleExpiresAt ?? token.roleExpiresAt ?? null;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                // effectiveRole() reverts a time-limited grant (e.g. 2-month beta Pro)
                // to FREE once roleExpiresAt has passed — enforced live, no cron/DB hit.
                session.user.role = effectiveRole({ role: token.role, roleExpiresAt: token.roleExpiresAt });
                session.user.roleExpiresAt = token.roleExpiresAt || null;
                session.user.id = token.id;
                if (token.isDev) {
                    session.user.isDev = true;
                }
            }
            return session;
        }
    }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
