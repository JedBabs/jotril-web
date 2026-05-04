'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserCog, Mail, Calendar, LogOut, CheckCircle, Plus, Undo2, RotateCcw, ChevronDown, ChevronRight, Save, Zap, Upload, Play, Check, Trash2, BarChart3, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
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
    const [stats, setStats] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isTierModalOpen, setIsTierModalOpen] = useState(false);
    const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            fetchUsers();
        }
    }, [status, router, session]);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data.users || []);
            setStats(data.stats || null);
        } catch (err) {
            showToast('Unable to load users. Are you an admin?', 'error');
            router.push('/dashboard');
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
    // Security check occurs at the API route level; if fetchUsers succeeds, they are admin.
    if (!session) return null;
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

                {/* Platform Analytics Cards */}
                {stats && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
                    >
                        <div className="glass-card !rounded-2xl p-6 relative overflow-hidden group">
                            <h3 className="text-[10px] font-bold text-ash uppercase tracking-[0.15em] mb-2">Total Users</h3>
                            <p className="text-3xl font-black text-navy">{stats.totalUsers.toLocaleString()}</p>
                            <div className="mt-3 flex gap-2">
                                <span className="text-[10px] font-bold text-ash px-2 py-0.5 rounded-full border border-silver">PRO: {stats.tierBreakdown?.PRO || 0}</span>
                                <span className="text-[10px] font-bold text-accent-purple px-2 py-0.5 rounded-full border border-accent-purple/20 bg-accent-purple/5">ULT: {stats.tierBreakdown?.ULTRA || 0}</span>
                            </div>
                        </div>

                        <div className="glass-card !rounded-2xl p-6 relative overflow-hidden group">
                            <h3 className="text-[10px] font-bold text-ash uppercase tracking-[0.15em] mb-2">Scans Today</h3>
                            <p className="text-3xl font-black text-navy">{stats.scansToday.toLocaleString()}</p>
                            <p className="text-xs text-ash font-medium mt-3">All-time: {stats.scansAllTime.toLocaleString()}</p>
                        </div>

                        <div className="glass-card !rounded-2xl p-6 relative overflow-hidden group">
                            <h3 className="text-[10px] font-bold text-ash uppercase tracking-[0.15em] mb-2">Points Burned (24h)</h3>
                            <p className="text-3xl font-black text-score-human">{stats.pointsToday.toLocaleString()}</p>
                            <p className="text-xs text-ash font-medium mt-3">All-time: {stats.pointsAllTime.toLocaleString()}</p>
                        </div>

                        <div className="glass-card !rounded-2xl p-6 bg-gradient-to-br from-navy to-navy/90 text-white relative overflow-hidden group flex flex-col justify-center items-center cursor-pointer hover:shadow-xl transition-shadow" onClick={() => document.getElementById('engine-tuning')?.scrollIntoView({ behavior: 'smooth' })}>
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-2">
                                <svg className="w-5 h-5 text-accent-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <span className="text-sm font-bold tracking-widest uppercase text-accent-cyan group-hover:text-white transition-colors">Tune Engine</span>
                        </div>
                    </motion.div>
                )}

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

                {/* ═══ Engine Tuning Panel ═══ */}
                <EngineTuningPanel />

                {/* ═══ Auto-Tune Panel ═══ */}
                <AutoTunePanel />

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

// ═══════════════════════════════════════════════════════════════════════
// ENGINE TUNING PANEL
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
    signalWeights: { direct: 0.30, differential: 0.43, anchor: 0.27 },
    windowConfidence: { 'window-1': 0.15, 'window-2': 0.50, 'window-3': 0.85, 'window-4': 0.95, 'window-5': 0.98, 'leave-one-out': 0.99, 'paragraph': 1.00 },
    anchorThreshold: 0.85,
    classification: { humanMax: 62, mixedMax: 75 },
    smoothing: { maxNudge: 25 },
    burstiness: { lowThreshold: 7, highThreshold: 12, lowNudge: 5, highNudge: 10 }
};

function TuningSlider({ label, value, onChange, min, max, step = 0.01, unit = '' }) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-ash uppercase tracking-widest">{label}</span>
                <span className="font-mono text-sm font-black text-navy">{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}{unit}</span>
            </div>
            <div className="flex items-center gap-3">
                <input
                    type="range" min={min} max={max} step={step} value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 appearance-none rounded-full bg-silver cursor-pointer accent-accent-blue"
                />
                <input
                    type="number" min={min} max={max} step={step} value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    className="w-20 text-center font-mono text-xs border border-silver rounded-lg py-1.5 bg-white/50 focus:outline-none focus:border-accent-blue text-navy font-bold"
                />
            </div>
        </div>
    );
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-silver/50 rounded-2xl overflow-hidden">
            <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 bg-surface/30 hover:bg-surface/50 transition-colors text-left">
                <span className="font-black text-sm text-navy">{title}</span>
                {open ? <ChevronDown className="w-4 h-4 text-ash" /> : <ChevronRight className="w-4 h-4 text-ash" />}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="p-5 space-y-5 border-t border-silver/30">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function EngineTuningPanel() {
    const [config, setConfig] = useState(null);
    const [canUndo, setCanUndo] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        fetch('/api/admin/config')
            .then(r => r.json())
            .then(data => {
                setConfig(data.config || DEFAULT_CONFIG);
                setCanUndo(data.canUndo || false);
            })
            .catch(() => setConfig(DEFAULT_CONFIG));
    }, []);

    if (!config) return null;

    const updateField = (path, value) => {
        setConfig(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const keys = path.split('.');
            let obj = next;
            for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
            obj[keys[keys.length - 1]] = value;
            return next;
        });
        setIsDirty(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/admin/config', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Engine config saved!', 'success');
                setCanUndo(data.canUndo);
                setIsDirty(false);
            } else {
                showToast(data.error || 'Failed to save', 'error');
            }
        } catch {
            showToast('Network error saving config', 'error');
        }
        setIsSaving(false);
    };

    const handleUndo = async () => {
        try {
            const res = await fetch('/api/admin/config', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setConfig(data.config);
                setCanUndo(data.canUndo);
                setIsDirty(false);
                showToast('Rolled back to previous config!', 'success');
            } else {
                showToast(data.error || 'Undo failed', 'error');
            }
        } catch {
            showToast('Network error during undo', 'error');
        }
    };

    const handleReset = () => {
        setConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
        setIsDirty(true);
        showToast('Reset to factory defaults (save to apply)', 'info');
    };

    // Calculate the normalized weight display
    const totalW = (config.signalWeights?.direct || 0) + (config.signalWeights?.differential || 0) + (config.signalWeights?.anchor || 0);

    return (
        <motion.div
            id="engine-tuning"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10"
        >
            <div className="glass-card rounded-[32px] overflow-hidden">
                {/* Header */}
                <div className="p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-silver/40">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-accent-blue to-accent-cyan rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-black text-navy">Engine Tuning</h2>
                        </div>
                        <p className="text-sm text-ash font-medium">Fine-tune post-model signal processing, classification thresholds, and smoothing behavior.</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {canUndo && (
                            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleUndo}
                                className="flex items-center gap-2 text-xs font-bold text-ash hover:text-accent-purple glass-card !rounded-full px-4 py-2.5 transition-colors">
                                <Undo2 className="w-3.5 h-3.5" /> Undo Last
                            </motion.button>
                        )}
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleReset}
                            className="flex items-center gap-2 text-xs font-bold text-ash hover:text-score-ai glass-card !rounded-full px-4 py-2.5 transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" /> Reset
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={!isDirty || isSaving}
                            className="flex items-center gap-2 text-xs font-bold text-white bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-40 !rounded-full px-5 py-2.5 shadow-lg transition-all">
                            <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : 'Save Config'}
                        </motion.button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-8 space-y-6">

                    <CollapsibleSection title="Signal Blend Weights" defaultOpen={true}>
                        <p className="text-[11px] text-ash mb-4 leading-relaxed">
                            These weights control how much each analysis signal contributes to the final score.
                            They are normalized automatically (sum: <span className="font-mono font-bold text-navy">{totalW.toFixed(2)}</span>).
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <TuningSlider label="Direct" value={config.signalWeights?.direct ?? 0.30} onChange={v => updateField('signalWeights.direct', v)} min={0} max={1} step={0.01} />
                            <TuningSlider label="Differential" value={config.signalWeights?.differential ?? 0.43} onChange={v => updateField('signalWeights.differential', v)} min={0} max={1} step={0.01} />
                            <TuningSlider label="Anchor" value={config.signalWeights?.anchor ?? 0.27} onChange={v => updateField('signalWeights.anchor', v)} min={0} max={1} step={0.01} />
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Window Confidence Matrix">
                        <p className="text-[11px] text-ash mb-4 leading-relaxed">
                            Each window type's confidence reflects how much we trust its score given the model's training data distribution.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Object.entries(config.windowConfidence || {}).map(([key, val]) => (
                                <TuningSlider key={key} label={key} value={val} onChange={v => updateField(`windowConfidence.${key}`, v)} min={0} max={1} step={0.01} />
                            ))}
                        </div>
                        <TuningSlider label="Anchor Threshold" value={config.anchorThreshold ?? 0.85} onChange={v => updateField('anchorThreshold', v)} min={0} max={1} step={0.01} />
                    </CollapsibleSection>

                    <CollapsibleSection title="Classification Boundaries">
                        <p className="text-[11px] text-ash mb-4 leading-relaxed">
                            Scores ≤ <b>Human Max</b> = Human, scores ≤ <b>Mixed Max</b> = Mixed, above = AI.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <TuningSlider label="Human Max" value={config.classification?.humanMax ?? 62} onChange={v => updateField('classification.humanMax', v)} min={0} max={100} step={1} />
                            <TuningSlider label="Mixed Max" value={config.classification?.mixedMax ?? 75} onChange={v => updateField('classification.mixedMax', v)} min={0} max={100} step={1} />
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Smoothing & Burstiness">
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xs font-black text-navy mb-3 uppercase tracking-widest">Contextual Smoothing</h4>
                                <TuningSlider label="Max Nudge" value={config.smoothing?.maxNudge ?? 25} onChange={v => updateField('smoothing.maxNudge', v)} min={0} max={50} step={1} unit=" pts" />
                            </div>
                            <hr className="border-silver/30" />
                            <div>
                                <h4 className="text-xs font-black text-navy mb-3 uppercase tracking-widest">Burstiness Detection</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <TuningSlider label="Low StdDev Threshold" value={config.burstiness?.lowThreshold ?? 7} onChange={v => updateField('burstiness.lowThreshold', v)} min={0} max={30} step={1} />
                                    <TuningSlider label="High StdDev Threshold" value={config.burstiness?.highThreshold ?? 12} onChange={v => updateField('burstiness.highThreshold', v)} min={0} max={30} step={1} />
                                    <TuningSlider label="Low Nudge" value={config.burstiness?.lowNudge ?? 5} onChange={v => updateField('burstiness.lowNudge', v)} min={0} max={20} step={1} unit=" pts" />
                                    <TuningSlider label="High Nudge" value={config.burstiness?.highNudge ?? 10} onChange={v => updateField('burstiness.highNudge', v)} min={0} max={20} step={1} unit=" pts" />
                                </div>
                            </div>
                        </div>
                    </CollapsibleSection>
                </div>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// AUTO-TUNE PANEL
// ═══════════════════════════════════════════════════════════════════════

function AutoTunePanel() {
    const [datasets, setDatasets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [activeRunId, setActiveRunId] = useState(null);
    const [runProgress, setRunProgress] = useState(null);
    const [isApplying, setIsApplying] = useState(null); // stores dataset ID being applied
    const [isDeleting, setIsDeleting] = useState(null); // stores dataset ID being deleted
    const [hasLocalDataset, setHasLocalDataset] = useState(false);
    const [debugPath, setDebugPath] = useState('');
    const [visibleFiles, setVisibleFiles] = useState([]);
    const [isInitializingMaster, setIsInitializingMaster] = useState(false);

    useEffect(() => {
        fetchDatasets();
    }, []);

    useEffect(() => {
        const activeRun = datasets.find(ds => ds.latestRun && ['PENDING', 'CACHING', 'TUNING'].includes(ds.latestRun.status));
        if (activeRun && !activeRunId) {
            connectToRun(activeRun.id);
        }
    }, [datasets]);

    const fetchDatasets = async () => {
        try {
            const res = await fetch('/api/admin/auto-tune');
            const data = await res.json();
            setDatasets(data.datasets || []);
            setHasLocalDataset(data.hasLocalDataset || false);
            setDebugPath(data.debugPath || '');
            setVisibleFiles(data.visibleFiles || []);
            setIsLoading(false);
        } catch (err) {
            console.error('Failed to load datasets:', err);
            setIsLoading(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                const res = await fetch('/api/admin/auto-tune', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: file.name.replace('.json', ''), samples: json })
                });

                const data = await res.json();
                if (data.success) {
                    showToast('Dataset uploaded successfully', 'success');
                    fetchDatasets();
                } else {
                    showToast(data.error || 'Upload failed', 'error');
                }
            } catch (err) {
                showToast('Invalid JSON file', 'error');
            } finally {
                setIsUploading(false);
                e.target.value = '';
            }
        };

        reader.readAsText(file);
    };

    // Handle seeding from the public /test_dataset.json file natively
    const handleLoadInternalDataset = async () => {
        try {
            setIsUploading(true);

            const res = await fetch('/test_dataset.json');
            if (!res.ok) throw new Error('Could not fetch test_dataset.json from public directory.');

            const data = await res.json();

            const uploadRes = await fetch('/api/admin/auto-tune', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Internal Baseline Dataset',
                    samples: data
                })
            });

            if (!uploadRes.ok) {
                const errData = await uploadRes.json();
                throw new Error(errData.error || 'Failed to upload internal dataset');
            }

            showToast('Internal dataset loaded successfully.', 'success');
            fetchDatasets();
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleInitializeMaster = async () => {
        setIsInitializingMaster(true);
        try {
            const res = await fetch('/api/admin/auto-tune', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'local', name: 'Master Dataset' })
            });

            const data = await res.json();
            if (data.success) {
                showToast('Master Dataset initialized successfully!', 'success');
                fetchDatasets();
            } else {
                showToast(data.error || 'Initialization failed', 'error');
            }
        } catch (err) {
            showToast('Network error initializing dataset', 'error');
        } finally {
            setIsInitializingMaster(false);
        }
    };

    const cancelRun = async (runId) => {
        try {
            setRunProgress(prev => prev ? { ...prev, message: 'Cancelling run...' } : null);
            const res = await fetch(`/api/admin/auto-tune/${runId}/cancel`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to cancel run');
            showToast('Run cancelled successfully.', 'success');
            setRunProgress(null);
            setActiveRunId(null);
            fetchDatasets();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this dataset?')) return;
        setIsDeleting(id);
        try {
            const res = await fetch(`/api/admin/auto-tune?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Dataset deleted', 'success');
                fetchDatasets();
            } else {
                showToast('Delete failed', 'error');
            }
        } catch (err) {
            showToast('Delete failed', 'error');
        } finally {
            setIsDeleting(null);
        }
    };

    const startTuning = async (id) => {
        try {
            const res = await fetch(`/api/admin/auto-tune/${id}/run`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Tuning run started in background!', 'info');
                connectToRun(id);
            } else {
                showToast(data.error || 'Startup failed', 'error');
            }
        } catch (err) {
            showToast('Network error starting run', 'error');
        }
    };

    const connectToRun = (id, retryCount = 0) => {
        setActiveRunId(id);
        setRunProgress({ status: 'STARTING', progress: 0, message: 'Attaching to run...' });

        const eventSource = new EventSource(`/api/admin/auto-tune/${id}/run`);

        eventSource.onmessage = (e) => {
            const data = JSON.parse(e.data);

            if (data.error) {
                showToast(data.error, 'error');
                eventSource.close();
                setActiveRunId(null);
                setRunProgress(null);
                return;
            }

            setRunProgress({
                status: data.status,
                progress: data.progress,
                trialsRun: data.trialCount,
                bestAccuracy: data.bestAccuracy,
                bestMcc: data.bestMcc,
                topTrials: data.log || [],
                message: data.message || (data.status === 'CACHING' ? 'Building model score cache...' :
                    data.status === 'TUNING' ? 'Running exhaustive grid search...' :
                        data.status === 'COMPLETE' ? 'Tuning Complete!' : data.status)
            });

            if (data.status === 'COMPLETE' || data.status === 'FAILED') {
                eventSource.close();
                setTimeout(() => {
                    setRunProgress(null);
                    setActiveRunId(null);
                    fetchDatasets();
                }, 3000);
            }
        };

        eventSource.onerror = (e) => {
            console.error('SSE Error:', e);
            eventSource.close();
            // Auto-reconnect with exponential backoff (max 3 retries)
            const MAX_RETRIES = 3;
            if (retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
                console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                setRunProgress(prev => prev ? { ...prev, message: `Connection lost. Reconnecting (${retryCount + 1}/${MAX_RETRIES})...` } : prev);
                setTimeout(() => connectToRun(id, retryCount + 1), delay);
            } else {
                showToast('Lost connection to tuning run. Refresh to check status.', 'error');
                setRunProgress(null);
                setActiveRunId(null);
                fetchDatasets(); // Refresh to see if it completed while disconnected
            }
        };
    };

    const applyConfig = async (id) => {
        setIsApplying(id);
        try {
            const res = await fetch(`/api/admin/auto-tune/${id}/apply`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Config applied to live engine!', 'success');
                // Refresh the page to reload the config in the upper panel
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast(data.error || 'Apply failed', 'error');
                setIsApplying(null);
            }
        } catch (err) {
            showToast('Network error applying config', 'error');
            setIsApplying(null);
        }
    };

    return (
        <motion.div
            id="auto-tune"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-10"
        >
            <div className="glass-card rounded-[32px] overflow-hidden border border-accent-purple/20">
                {/* Header */}
                <div className="p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-accent-purple/20 bg-gradient-to-r from-accent-purple/5 to-transparent">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-accent-purple to-accent-pink rounded-xl flex items-center justify-center shadow-[0_4px_20px_rgba(168,85,247,0.3)]">
                                <Zap className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-2xl font-black text-navy">Auto-Tuner</h2>
                        </div>
                        <p className="text-sm text-ash font-medium">Data-driven parameter optimization via grid search over 50,000+ combinations.</p>
                    </div>

                    <div className="flex gap-4 items-center">
                        <div className="relative">
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                disabled={isUploading}
                            />
                            <button className="flex items-center gap-2 text-sm font-bold text-white bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-40 !rounded-full px-5 py-2.5 shadow-lg transition-all pointer-events-none">
                                <Upload className="w-4 h-4" />
                                {isUploading ? 'Uploading...' : 'Upload Dataset (JSON)'}
                            </button>
                        </div>

                        <button
                            onClick={handleLoadInternalDataset}
                            disabled={isUploading}
                            className="flex items-center gap-2 text-sm font-bold text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20 hover:bg-accent-cyan/20 disabled:opacity-40 !rounded-full px-5 py-2.5 shadow-lg transition-all"
                        >
                            <Database className="w-4 h-4" />
                            Load Internal Dataset
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-8 space-y-6">
                    {/* Active Run Banner */}
                    <AnimatePresence>
                        {activeRunId && runProgress && (
                            <motion.div
                                initial={{ height: 0, opacity: 0, y: -20 }}
                                animate={{ height: 'auto', opacity: 1, y: 0 }}
                                exit={{ height: 0, opacity: 0, y: -20 }}
                                className="overflow-hidden"
                            >
                                <div className="bg-navy rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden mb-10 border border-white/10">
                                    {/* Animated background pulse */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/20 to-accent-cyan/10 opacity-30 animate-pulse" />

                                    {/* Progress Track */}
                                    <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-accent-purple via-accent-cyan to-accent-purple bg-[length:200%_100%] animate-shimmer"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${runProgress.progress || 0}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                        />
                                    </div>

                                    <div className="relative z-10">
                                        <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-6">
                                                    <div>
                                                        <h3 className="text-xl font-bold text-white mb-1">
                                                            {runProgress.status === 'STARTING' && 'Initializing Tune-Up'}
                                                            {runProgress.status === 'CACHING' && 'Building Score Cache'}
                                                            {runProgress.status === 'TUNING' && 'Exhaustive Search In Progress'}
                                                            {runProgress.status === 'COMPLETE' && 'Tuning Complete'}
                                                            {runProgress.status === 'FAILED' && 'Tuning Failed'}
                                                        </h3>
                                                        <p className="text-silver text-sm">{runProgress.message}</p>
                                                    </div>

                                                    {(runProgress.status === 'STARTING' || runProgress.status === 'CACHING' || runProgress.status === 'TUNING') && (
                                                        <button
                                                            onClick={() => cancelRun(activeRunId)}
                                                            className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg font-bold text-sm transition-colors border border-red-500/20"
                                                        >
                                                            Force Stop
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Mini Stepper */}
                                                <div className="flex items-center gap-4 mt-6">
                                                    {[
                                                        { id: 'CACHING', label: 'Caching' },
                                                        { id: 'TUNING', label: 'Optimization' },
                                                        { id: 'COMPLETE', label: 'Finish' }
                                                    ].map((step, idx) => {
                                                        const isDone = ['COMPLETE', 'FAILED'].includes(runProgress.status) || (runProgress.status === 'TUNING' && step.id === 'CACHING');
                                                        const isCurrent = runProgress.status === step.id;

                                                        return (
                                                            <div key={step.id} className="flex items-center gap-2">
                                                                <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${isDone ? 'bg-score-human' : isCurrent ? 'bg-accent-cyan shadow-[0_0_10px_rgba(34,211,238,0.5)] scale-110' : 'bg-white/10'}`} />
                                                                <span className={`text-[10px] uppercase tracking-widest font-bold ${isDone || isCurrent ? 'text-white' : 'text-white/30'}`}>{step.label}</span>
                                                                {idx < 2 && <div className="w-8 h-px bg-white/5" />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 lg:border-l lg:border-white/10 lg:pl-8">
                                                <div>
                                                    <div className="text-[10px] uppercase font-bold text-silver tracking-widest mb-1">Evaluated</div>
                                                    <div className="text-2xl font-mono font-black text-white">
                                                        {runProgress.trialsRun ? runProgress.trialsRun.toLocaleString() : '---'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] uppercase font-bold text-silver tracking-widest mb-1">Peak Acc</div>
                                                    <div className="text-2xl font-mono font-black text-score-human">
                                                        {runProgress.bestAccuracy ? `${runProgress.bestAccuracy}%` : '---'}
                                                    </div>
                                                </div>
                                                <div className="hidden sm:block">
                                                    <div className="text-[10px] uppercase font-bold text-silver tracking-widest mb-1">Peak MCC</div>
                                                    <div className="text-2xl font-mono font-black text-accent-purple">
                                                        {runProgress.bestMcc || '---'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* mini Live Log */}
                                        {runProgress.status === 'TUNING' && runProgress.topTrials?.length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-8 pt-6 border-t border-white/5"
                                            >
                                                <h4 className="text-[10px] font-bold text-silver uppercase tracking-[0.2em] mb-4">Live Discovery Feed</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                                    {runProgress.topTrials.slice(0, 5).map((trial, i) => (
                                                        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center group hover:bg-white/10 transition-colors">
                                                            <div className="text-[10px] font-mono font-bold text-accent-cyan mb-1">Trial {i + 1}</div>
                                                            <div className="text-lg font-black text-white">{trial.accuracy}%</div>
                                                            <div className="text-[9px] font-bold text-silver uppercase">MCC: {trial.mcc}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {isLoading ? (
                        <div className="text-center py-10 text-ash text-sm font-bold animate-pulse">Loading datasets...</div>
                    ) : datasets.length === 0 ? (
                        <div className="text-center py-16 border-2 border-dashed border-silver rounded-2xl flex flex-col items-center">
                            <Zap className="w-12 h-12 text-silver mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-navy mb-2">No Training Datasets</h3>
                            <p className="text-sm text-ash max-w-md mx-auto mb-8">
                                Upload a JSON dataset containing an array of objects with <code className="text-xs bg-surface px-1.5 py-0.5 rounded text-navy">text</code> and <code className="text-xs bg-surface px-1.5 py-0.5 rounded text-navy">label</code> ("human" or "ai").
                            </p>

                            {hasLocalDataset && (
                                <motion.button
                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                    onClick={handleInitializeMaster}
                                    disabled={isInitializingMaster}
                                    className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-accent-purple to-accent-pink text-white rounded-2xl font-black shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                                >
                                    {isInitializingMaster ? (
                                        <>
                                            <RotateCcw className="w-5 h-5 animate-spin" />
                                            Initializing Master Dataset...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className="w-5 h-5" />
                                            Initialize Master Dataset (from local JSON)
                                        </>
                                    )}
                                </motion.button>
                            )}
                            {!hasLocalDataset && (
                                <div className="mt-4 px-4 py-3 bg-surface/50 rounded-xl text-left w-full max-w-md border border-silver/10 overflow-hidden">
                                    <div className="text-[10px] text-ash font-bold uppercase tracking-widest mb-2">Diagnostic Scan</div>
                                    <div className="text-[10px] text-navy font-mono mb-2 truncate">PATH: {debugPath === 'None found' ? 'Dataset not detected.' : debugPath}</div>
                                    <div className="text-[10px] text-ash font-mono bg-white/50 p-2 rounded border border-silver/5 h-20 overflow-y-auto">
                                        <div className="font-bold mb-1">Files seen by Node.js:</div>
                                        {visibleFiles.map(f => <div key={f}>- {f}</div>)}
                                        {visibleFiles.length === 0 && <div>(No files visible)</div>}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6">
                            {datasets.map(ds => (
                                <div key={ds.id} className="border border-silver/50 rounded-2xl overflow-hidden hover:border-accent-purple/30 transition-colors">
                                    <div className="p-6 bg-surface/30">
                                        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6">
                                            {/* Dataset Info */}
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-silver flex items-center justify-center shrink-0">
                                                    <BarChart3 className="w-6 h-6 text-accent-purple" />
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-navy text-lg">{ds.name}</h3>
                                                    <div className="flex items-center gap-3 mt-2">
                                                        <span className="text-xs font-bold text-ash bg-white border border-silver px-2 py-1 rounded-full">
                                                            {ds.sampleCount} samples
                                                        </span>
                                                        <span className="text-xs font-bold text-score-human bg-score-human/10 px-2 py-1 rounded-full flex items-center gap-1">
                                                            <Check className="w-3 h-3" /> {ds.humanCount} human
                                                        </span>
                                                        <span className="text-xs font-bold text-score-ai bg-score-ai/10 px-2 py-1 rounded-full flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" /> {ds.aiCount} AI
                                                        </span>
                                                        {ds.hasCachedScores && (
                                                            <span className="text-xs font-bold text-accent-cyan bg-accent-cyan/10 px-2 py-1 rounded-full">
                                                                Scores Cached
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => handleDelete(ds.id)}
                                                    disabled={activeRunId === ds.id || isDeleting === ds.id}
                                                    className="p-2 text-ash hover:text-score-ai bg-white rounded-full border border-silver transition-colors disabled:opacity-30"
                                                    title="Delete Dataset"
                                                >
                                                    {isDeleting === ds.id ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>

                                                <button
                                                    onClick={() => startTuning(ds.id)}
                                                    disabled={activeRunId !== null || isDeleting !== null || isApplying !== null}
                                                    className="flex items-center gap-2 text-sm font-bold text-accent-purple bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/20 !rounded-full px-5 py-2.5 transition-all disabled:opacity-40"
                                                >
                                                    <Play className="w-4 h-4 fill-current" />
                                                    Run Optimization
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Latest Run Results */}
                                    {ds.latestRun && ds.latestRun.status === 'COMPLETE' && ds.latestRun.metrics && (
                                        <div className="p-6 border-t border-silver/50 bg-white">
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-ash">Latest Results ({new Date(ds.latestRun.completedAt).toLocaleDateString()})</h4>
                                                <span className="text-xs font-mono text-ash">{ds.latestRun.trialCount?.toLocaleString()} configs eval'd</span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                                <div className="p-4 border border-silver rounded-xl text-center">
                                                    <div className="text-[10px] uppercase font-bold text-ash mb-1">Accuracy</div>
                                                    <div className="text-2xl font-black text-navy">{ds.latestRun.bestAccuracy}%</div>
                                                </div>
                                                <div className="p-4 border border-accent-purple/20 bg-accent-purple/5 rounded-xl text-center shadow-[0_2px_10px_rgba(168,85,247,0.1)]">
                                                    <div className="text-[10px] uppercase font-bold text-accent-purple mb-1">MCC Score</div>
                                                    <div className="text-2xl font-black text-accent-purple">{ds.latestRun.bestMcc}</div>
                                                </div>
                                                {/* Before/After Comparison */}
                                                {ds.latestRun.metrics?.baseline && (
                                                    <div className="col-span-1 md:col-span-2 p-4 border border-score-human/20 bg-score-human/5 rounded-xl">
                                                        <div className="text-[10px] uppercase font-bold text-score-human mb-2">Improvement Over Baseline</div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="text-center">
                                                                <div className="text-[9px] text-ash font-bold">Accuracy</div>
                                                                <div className="text-sm font-mono font-bold text-navy">
                                                                    {ds.latestRun.metrics.baseline.accuracy}% → <span className="text-score-human">{ds.latestRun.bestAccuracy}%</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-[9px] text-ash font-bold">MCC</div>
                                                                <div className="text-sm font-mono font-bold text-navy">
                                                                    {ds.latestRun.metrics.baseline.mcc} → <span className="text-accent-purple">{ds.latestRun.bestMcc}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="col-span-1 md:col-span-2 p-4 border border-silver rounded-xl flex items-center justify-center gap-6">
                                                    {/* Confusion Matrix Mini-View */}
                                                    <div className="text-center">
                                                        <div className="text-xs font-bold text-score-ai">True AI</div>
                                                        <div className="text-xl font-mono font-black">{ds.latestRun.metrics.confusionMatrix.tp}</div>
                                                    </div>
                                                    <div className="text-center opacity-50">
                                                        <div className="text-[10px] font-bold text-navy uppercase">False Human</div>
                                                        <div className="text-sm font-mono font-bold">{ds.latestRun.metrics.confusionMatrix.fn}</div>
                                                    </div>
                                                    <div className="w-px h-8 bg-silver mx-2" />
                                                    <div className="text-center">
                                                        <div className="text-xs font-bold text-score-human">True Human</div>
                                                        <div className="text-xl font-mono font-black">{ds.latestRun.metrics.confusionMatrix.tn}</div>
                                                    </div>
                                                    <div className="text-center opacity-50">
                                                        <div className="text-[10px] font-bold text-navy uppercase">False AI</div>
                                                        <div className="text-sm font-mono font-bold">{ds.latestRun.metrics.confusionMatrix.fp}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => applyConfig(ds.id)}
                                                    disabled={isApplying !== null || activeRunId !== null}
                                                    className="flex items-center gap-2 text-sm font-bold text-white bg-navy hover:bg-navy/80 rounded-xl px-6 py-2.5 transition-colors shadow-md disabled:bg-ash/50"
                                                >
                                                    {isApplying === ds.id ? (
                                                        <>
                                                            <RotateCcw className="w-4 h-4 animate-spin" />
                                                            Applying Configuration...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Save className="w-4 h-4" />
                                                            Apply to Production Engine
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {ds.latestRun && ds.latestRun.status === 'FAILED' && (
                                        <div className="p-4 border-t text-sm font-bold text-score-ai bg-score-ai/5 flex items-center gap-2">
                                            <XCircle className="w-5 h-5" /> Tuning run failed: {ds.latestRun.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
