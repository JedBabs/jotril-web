import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function middleware(req) {
        const { pathname } = req.nextUrl;
        const { token } = req.nextauth;

        // If user is logged in and trying to access the landing page, redirect to dashboard
        if (token && pathname === "/") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
    },
    {
        callbacks: {
            authorized: ({ token }) => true, // Ensure we always run the middleware
        },
    }
);

export const config = {
    matcher: ["/"],
};
