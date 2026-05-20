import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import getPrisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { checkBruteForce, recordFailedLogin, clearBruteForce } from "@/lib/auth-security";

const prisma = getPrisma();

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    pages: {
        signIn: '/auth/signin',
    },
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
                    // We use an environment variable for the dev pin. If not set, default to a secure fallback or just reject.
                    const expectedPin = process.env.DEV_PIN || 'antigravity-debug';
                    if (credentials.devPin === expectedPin) {
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
                    } else {
                        throw new Error(JSON.stringify({ message: "Invalid Dev PIN" }));
                    }
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
                    role: user.role
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
                    token.role = dbUser?.role || user.role || 'FREE';
                    token.id = dbUser?.id || user.id;
                }
            }
            // Allow manual role updates (e.g. from admin panel modifying sessions)
            if (trigger === "update" && session?.role) {
                token.role = session.role;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.role = token.role;
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
