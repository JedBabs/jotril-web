'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserCog, Mail, Calendar, LogOut, CheckCircle, Plus } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import ToastContainer, { showToast } from '@/components/Toast';
import { motion, AnimatePresence } from 'framer-motion';

const tierColors = {
    ADMIN: { bg: "bg-score-ai/10", text: "text-score-ai", border: "border-score-ai/20", gradient: "from-score-ai to-score-mixed" },
    ULTRA: { bg: "bg-accent-purple/10", text: "text-accent-purple", border: "border-accent-purple/20", gradient: "from-accent-purple to-accent-pink" },
    PRO: { bg: "bg-accent-blue/10", text: "text-accent-blue", border: "border-accent-blue/20", gradient: "from-accent-blue to-accent-cyan" },
    FREE: { bg: "bg-ash/10", text: "text-ash", border: "border-ash/20", gradient: "from-ash to-ash-light" },
};

export default function AdminDashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isTierModalOpen, setIsTierModalOpen] = useState(false);
    const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'ADMIN') router.push('/');
            else fetchUsers();
        }
    }, [status, router, session]);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data.users || []);
        } catch (err) {
            showToast('Unable to load users. Are you an admin?', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (status === 'loading' || isLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center aurora-bg">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-silver border-t-accent-blue animate-spin" />
                    <div className="absolute inset-3 rounded-full border-4 border-silver border-b-accent-cyan animate-[spin_2s_reverse_infinite]" />
                </div>
            </div>
        );
    }

    if (!session || session.user.role !== 'ADMIN') return null;

    const openTierModal = (user) => { setSelectedUser(user); setIsTierModalOpen(true); };
    const openPointsModal = (user) => { setSelectedUser(user); setIsPointsModalOpen(true); };

    const handleUpdateUser = async (updateData) => {
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedUser.id, ...updateData })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('User updated successfully', 'success');
                setIsTierModalOpen(false);
                setIsPointsModalOpen(false);
                fetchUsers();
            } else {
                showToast(data.error || 'Failed to update user', 'error');
            }
        } catch (error) {
            showToast('Network error updating user', 'error');
        }
    };

    return (
        <div className="min-h-screen bg-white text-navy font-sans aurora-bg relative">
            <div className="aurora-accent top-[5%] left-[60%]" />
            <div className="floating-orb w-3 h-3 bg-score-ai/15 top-[12%] left-[8%]" style={{ animationDelay: '2s' }} />
            <div className="floating-orb w-2 h-2 bg-accent-purple/15 bottom-[15%] right-[12%]" style={{ animationDelay: '5s' }} />

            <ToastContainer />

            <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-10">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-silver"
                >
                    <div className="flex items-center gap-4">
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200 }}
                            className="w-14 h-14 bg-gradient-to-tr from-score-ai to-score-mixed rounded-2xl flex items-center justify-center shadow-[0_4px_20px_rgba(239,68,68,0.2)]"
                        >
                            <ShieldCheck className="w-8 h-8 text-white" />
                        </motion.div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-navy">Admin Hub</h1>
                            <p className="text-ash text-sm mt-1 font-medium">System user management and provisioning</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => router.push('/')}
                            className="text-sm font-semibold text-ash hover:text-navy transition-colors glass-card !rounded-full px-4 py-2">
                            Home
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => fetchUsers()}
                            className="text-sm font-semibold text-ash hover:text-accent-blue transition-colors glass-card !rounded-full px-4 py-2">
                            Refresh
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => signOut()}
                            className="glass-card !rounded-full p-2.5 text-ash hover:text-score-ai transition-colors">
                            <LogOut className="w-4 h-4" />
                        </motion.button>
                    </div>
                </motion.div>

                {/* Users Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="glass-card rounded-2xl overflow-hidden"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-surface text-ash font-bold uppercase tracking-[0.15em] text-[11px] border-b border-silver">
                                <tr>
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4">Status & Tier</th>
                                    <th className="px-6 py-4 text-right">Activity Stats</th>
                                    <th className="px-6 py-4 text-center">Purchased Pts</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-silver/50">
                                {users.map((user, i) => {
                                    const tc = tierColors[user.role] || tierColors.FREE;
                                    return (
                                        <motion.tr
                                            key={user.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            className="hover:bg-surface/50 transition-colors group"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${tc.gradient} flex items-center justify-center text-white font-bold uppercase shrink-0 shadow-sm`}>
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-navy text-base">{user.name}</p>
                                                        <div className="flex items-center gap-1.5 text-xs text-ash mt-0.5">
                                                            <Mail className="w-3 h-3" /> {user.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-2 items-start">
                                                    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border ${tc.bg} ${tc.text} ${tc.border}`}>
                                                        {user.role}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 text-[11px] text-ash">
                                                        <Calendar className="w-3 h-3" /> Joined {new Date(user.createdAt).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-mono font-bold text-navy">{user.requestsMade} scans</span>
                                                    <span className="text-[11px] text-ash">{user.pointsSpent || 0} pts consumed</span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 text-center">
                                                <span className="font-mono font-bold text-score-human bg-score-human/10 border border-score-human/20 px-3 py-1 rounded-full text-sm">
                                                    {user.purchasedPoints || 0}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                        onClick={() => openPointsModal(user)}
                                                        className="bg-score-human/5 hover:bg-score-human/15 text-score-human text-xs font-bold py-1.5 px-3 rounded-lg border border-score-human/20 transition-colors flex items-center gap-1.5">
                                                        <Plus className="w-3 h-3" /> Points
                                                    </motion.button>
                                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                        onClick={() => openTierModal(user)}
                                                        className="bg-accent-blue/5 hover:bg-accent-blue/15 text-accent-blue text-xs font-bold py-1.5 px-3 rounded-lg border border-accent-blue/20 transition-colors flex items-center gap-1.5">
                                                        <UserCog className="w-3.5 h-3.5" /> Tier
                                                    </motion.button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-ash">No users found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                {/* Change Tier Modal */}
                <AnimatePresence>
                    {isTierModalOpen && selectedUser && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm"
                        >
                            <motion.div
                                initial={{ scale: 0.92, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 10 }}
                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                className="glass-card rounded-3xl p-8 max-w-sm w-full"
                            >
                                <h3 className="text-xl font-black text-navy mb-1">Upgrade Tier</h3>
                                <p className="text-xs text-ash mb-6 font-mono truncate">{selectedUser.email}</p>
                                <div className="space-y-3 mb-8">
                                    {['FREE', 'PRO', 'ULTRA', 'ADMIN'].map(r => {
                                        const tc = tierColors[r] || tierColors.FREE;
                                        return (
                                            <motion.button key={r} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                                onClick={() => handleUpdateUser({ newRole: r })}
                                                disabled={selectedUser.role === r}
                                                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${selectedUser.role === r
                                                    ? `${tc.bg} ${tc.border} ${tc.text} cursor-default`
                                                    : 'glass-card hover:border-accent-blue/30'
                                                    }`}>
                                                <span className="font-bold tracking-wide">{r}</span>
                                                {selectedUser.role === r && <CheckCircle className="w-5 h-5" />}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                                <button onClick={() => setIsTierModalOpen(false)}
                                    className="w-full py-3 text-sm font-bold text-ash hover:text-navy transition-colors">
                                    Cancel
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Add Points Modal */}
                <AnimatePresence>
                    {isPointsModalOpen && selectedUser && (
                        <PointsModal user={selectedUser} onClose={() => setIsPointsModalOpen(false)}
                            onAdd={(points) => handleUpdateUser({ addPurchasedPoints: points })} />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function PointsModal({ user, onClose, onAdd }) {
    const [amount, setAmount] = useState(100);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="glass-card rounded-3xl p-8 max-w-sm w-full"
            >
                <div className="w-12 h-12 bg-score-human/10 rounded-full flex items-center justify-center mb-5 border border-score-human/20">
                    <Plus className="w-6 h-6 text-score-human" />
                </div>
                <h3 className="text-xl font-black text-navy mb-1">Mint Points</h3>
                <p className="text-sm text-ash mb-6">Add purchased points to <span className="text-navy font-medium">{user.name}</span>.</p>

                <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full bg-white/50 border border-silver text-navy font-mono text-xl p-4 rounded-xl text-center mb-6 focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all" />

                <div className="grid grid-cols-3 gap-2 mb-8">
                    {[100, 500, 1000].map(val => (
                        <motion.button key={val} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            onClick={() => setAmount(val)}
                            className="glass-card !rounded-lg text-navy py-2 text-sm font-bold hover:border-accent-blue/30 transition-colors">
                            +{val}
                        </motion.button>
                    ))}
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 py-3 text-sm font-bold text-ash hover:text-navy rounded-xl transition-colors">
                        Cancel
                    </button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={() => onAdd(amount)}
                        className="flex-1 py-3 bg-score-human hover:bg-score-human/90 text-white font-black rounded-xl shadow-[0_2px_15px_rgba(16,185,129,0.3)] transition-all btn-shimmer">
                        Add Points
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}
