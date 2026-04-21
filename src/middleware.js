import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function middleware(req) {
        const { pathname } = req.nextUrl;
        const { token } = req.nextauth;

        // DEBUG: Inspect token to see why check might fail
        console.log("Middleware Path:", pathname);
        console.log("Token Role:", token?.role);
        console.log("Full Token Keys:", Object.keys(token || {}));

        // 1. Redirect logged-in users away from landing page
        if (token && pathname === "/") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }

        // 2. Protect Admin Hub — Server-side role enforcement
        if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
            console.log("Blocking access to:", pathname, "Role found:", token?.role);
            // If token exists but role is missing, it's likely a stale session
            const errorReason = token ? "stale_session" : "unauthorized";
            return NextResponse.redirect(new URL(`/dashboard?error=${errorReason}`, req.url));
        }
    },
    {
        callbacks: {
            // authorized callback ensures the middleware always runs for these routes
            authorized: ({ token, req }) => {
                const { pathname } = req.nextUrl;
                // Landing page is public (but handled by middleware redirects above)
                if (pathname === "/") return true;
                // All other routes (dashboard, admin) require a token
                return !!token;
            },
        },
    }
);

export const config = {
    matcher: ["/", "/dashboard/:path*", "/admin/:path*"],
};
