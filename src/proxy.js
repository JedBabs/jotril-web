import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function middleware(req) {
        const { pathname } = req.nextUrl;
        const { token } = req.nextauth;

        // 1. Redirect logged-in users away from landing page
        if (token && pathname === "/") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }

        // 2. Protect Admin Hub — Server-side role enforcement
        if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
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
