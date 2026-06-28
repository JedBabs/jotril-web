export default function robots() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.jotril.com";

    return {
        rules: {
            userAgent: '*',
            allow: '/',
            // Explicitly prevent search engines from crawling private or sensitive routes
            disallow: [
                '/admin/',
                '/admin/*',
                '/dashboard/',
                '/dashboard/*',
                '/api/',
                '/api/*',
                '/auth/verify-email',
                '/auth/reset-password'
            ],
        },
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
