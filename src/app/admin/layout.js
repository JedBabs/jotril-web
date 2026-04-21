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
        redirect('/dashboard?error=unauthorized');
    }

    return (
        <div className="admin-layout-wrapper">
            {children}
        </div>
    );
}
