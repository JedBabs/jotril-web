import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export const metadata = {
    title: 'Jotril Admin Hub',
    description: 'Secure Jotril Platform Administration',
};

export default async function AdminLayout({ children }) {
    const session = await getServerSession(authOptions);

    if (!session || session?.user?.role !== 'ADMIN') {
        // Absolute redirect to the MAIN app. On the admin.* subdomain a relative
        // "/dashboard" gets caught by the vercel.json host rewrite and becomes
        // "/admin/dashboard" (404), so logged-out / non-admin visitors must be sent
        // to the main domain. Falls back to relative when no base URL is configured.
        const base = process.env.NEXT_PUBLIC_APP_URL || '';
        redirect(`${base}/dashboard?error=unauthorized`);
    }

    return (
        <div className="admin-layout-wrapper">
            {children}
        </div>
    );
}
