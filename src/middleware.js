import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function middleware(req) {
        const { pathname } = req.nextUrl;
        const { token } = req.nextauth;

        // Protect Admin Hub — server-side role enforcement.
        if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
            // If a token exists but the role is missing, it's likely a stale session.
            const errorReason = token ? "stale_session" : "unauthorized";
            return NextResponse.redirect(new URL(`/dashboard?error=${errorReason}`, req.url));
        }
    },
    {
        callbacks: {
            // All matched routes (dashboard, admin) require a token. The landing page "/"
            // is intentionally NOT matched — logged-in users can browse it (pricing/home);
            // first-login routing to /dashboard is handled by the sign-in flow itself.
            authorized: ({ token }) => !!token,
        },
    }
);

export const config = {
    matcher: ["/dashboard/:path*", "/admin/:path*"],
};
