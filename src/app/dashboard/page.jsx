"use client";
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import SignUpNudge from "@/components/SignUpNudge";

const tierGradients = {
    FREE: "from-accent-blue to-accent-cyan",
    PRO: "from-accent-purple to-accent-pink",
    ULTRA: "from-accent-pink to-score-mixed",
    ADMIN: "from-score-human to-accent-cyan",
};

export default function DeveloperDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [keys, setKeys] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [stats, setStats] = useState(null);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [copiedId, setCopiedId] = useState(null);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated') {
            Promise.all([
                fetch('/api/keys').then(r => r.json()),
                fetch('/api/dashboard').then(r => r.json())
            ])
                .then(([keysData, dashData]) => {
                    if (keysData.keys) setKeys(keysData.keys);
                    if (!dashData.error) setStats(dashData);
                    setIsDataLoaded(true);
                })
                .catch(console.error);
        }
    }, [status]);

    const handleCreateKey = async () => {
        setIsGenerating(true);
        const res = await fetch('/api/keys', { method: 'POST' });
        const data = await res.json();
        if (data.key) setKeys([...keys, data.key]);
        setIsGenerating(false);
    };

    const handleRevokeKey = async (id) => {
        await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
        setKeys(keys.filter(k => k.id !== id));
    };

    const handleCopyKey = (key, id) => {
        navigator.clipboard.writeText(key);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    if (status === 'loading' || !isDataLoaded) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center font-sans aurora-bg">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-silver border-t-accent-blue animate-spin" />
                    <div className="absolute inset-3 rounded-full border-4 border-silver border-b-accent-cyan animate-[spin_2s_reverse_infinite]" />
                </div>
            </div>
        );
    }

    const tier = stats?.tier || 'FREE';
    const totalRequests = stats?.totalRequests || 0;
    const spentPoints = stats?.totalPointsSpent || 0;

    let quotaMax = 100;
    if (tier === 'PRO') quotaMax = 500;
    if (tier === 'ULTRA') quotaMax = 5000;
    if (tier === 'UNAUTHENTICATED') quotaMax = 50;

    const fillRatio = Math.min((spentPoints / quotaMax) * 100, 100);
    const gradient = tierGradients[tier] || tierGradients.FREE;

    return (
        <div className="min-h-screen bg-white text-navy font-sans aurora-bg relative">
            <div className="aurora-accent top-[5%] right-[20%]" />
            <div className="floating-orb w-3 h-3 bg-accent-blue/15 top-[15%] left-[8%]" style={{ animationDelay: '1s' }} />
            <div className="floating-orb w-2 h-2 bg-accent-purple/15 bottom-[20%] right-[10%]" style={{ animationDelay: '4s' }} />

            <div className="relative z-10 max-w-6xl mx-auto p-6 md:p-10 space-y-10">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-8 border-b border-silver"
                >
                    <div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => router.push('/')}
                            className="inline-flex items-center gap-2 text-sm font-bold text-ash hover:text-navy transition-colors mb-4 glass-card !rounded-full px-4 py-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to Scanner
                        </motion.button>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-navy">Account Portal</h1>
                        <p className="text-ash mt-2 text-base font-medium">Manage your keys, monitor quotas, and track usage.</p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleCreateKey}
                        disabled={isGenerating}
                        className="btn-shimmer bg-accent-blue text-white font-bold py-3 px-7 rounded-full shadow-[0_4px_17px_rgba(37,99,235,0.3)] text-sm disabled:opacity-50 hover:bg-accent-blue-light transition-all"
                    >
                        {isGenerating ? "Generating..." : "+ Generate Secret Key"}
                    </motion.button>
                </motion.div>

                {/* Pro upgrade nudge for FREE users */}
                {tier === "FREE" && <SignUpNudge variant="free" />}

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-card rounded-2xl p-7 relative overflow-hidden hover-lift"
                    >
                        <div className="absolute -top-12 -right-12 w-36 h-36 bg-accent-blue/5 rounded-full blur-2xl pointer-events-none" />
                        <h3 className="text-ash uppercase tracking-[0.18em] text-[11px] font-bold mb-3">Total Requests</h3>
                        <p className="text-4xl font-black font-mono tracking-tighter text-navy">{totalRequests}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="glass-card rounded-2xl p-7 relative overflow-hidden hover-lift"
                    >
                        <div className="absolute -top-12 -right-12 w-36 h-36 bg-accent-purple/5 rounded-full blur-2xl pointer-events-none" />
                        <h3 className="text-ash uppercase tracking-[0.18em] text-[11px] font-bold mb-3">Current Tier</h3>
                        <p className={`text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r ${gradient}`}>{tier}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="relative glow-border rounded-2xl"
                    >
                        <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-7 relative overflow-hidden`}>
                            <h3 className="text-white/70 uppercase tracking-[0.18em] text-[11px] font-bold mb-4">Daily Usage Quota</h3>
                            <div className="w-full bg-white/20 rounded-full h-3">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${tier === 'ADMIN' ? 0 : fillRatio}%` }}
                                    transition={{ duration: 1.2, ease: "easeOut" }}
                                    className="bg-white h-3 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)]"
                                />
                            </div>
                            <p className="text-white/80 mt-3 text-sm font-medium">
                                {tier === 'ADMIN' ? '∞ Unlimited' : `${spentPoints} of ${quotaMax}`} points used today
                            </p>
                        </div>
                    </motion.div>
                </div>

                {/* API Keys Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="glass-card rounded-2xl overflow-hidden"
                >
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-surface text-ash text-[11px] tracking-[0.15em] uppercase border-b border-silver">
                                <th className="p-5 font-bold">Secret Key Token</th>
                                <th className="p-5 font-bold">Created</th>
                                <th className="p-5 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-silver/50">
                            {keys.length === 0 ? (
                                <tr>
                                    <td colSpan="3" className="p-10 text-center">
                                        <div className="flex flex-col items-center gap-3 text-ash">
                                            <svg className="w-10 h-10 text-silver-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                            </svg>
                                            <p className="text-sm font-medium">No API keys generated yet.</p>
                                            <p className="text-xs text-ash-light">Click "Generate Secret Key" to create one.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : keys.map((k, i) => (
                                <motion.tr
                                    key={k.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="hover:bg-surface/50 transition-colors group"
                                >
                                    <td className="p-5">
                                        <div className="flex items-center gap-2">
                                            <code className="font-mono text-sm text-navy font-bold tracking-wider">{k.key}</code>
                                            <motion.button
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => handleCopyKey(k.key, k.id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-ash hover:text-accent-blue p-1"
                                            >
                                                {copiedId === k.id ? (
                                                    <svg className="w-4 h-4 text-score-human" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                )}
                                            </motion.button>
                                        </div>
                                    </td>
                                    <td className="p-5 text-ash text-sm font-medium">
                                        {new Date(k.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="p-5 text-right">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleRevokeKey(k.id)}
                                            className="text-score-ai font-bold text-xs tracking-wide hover:text-red-700 opacity-40 group-hover:opacity-100 transition-all bg-score-ai/5 px-3 py-1.5 rounded-lg border border-score-ai/10"
                                        >
                                            REVOKE
                                        </motion.button>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </motion.div>
            </div>
        </div>
    );
}
