"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
    Key,
    ChevronLeft,
    Copy,
    Check,
    Trash2,
    Lock,
    TerminalSquare,
    BookOpen
} from 'lucide-react';
import GlitchLogo from "@/components/GlitchLogo";
import InteractiveBackground from "@/components/InteractiveBackground";
import ToastContainer, { showToast } from "@/components/Toast";

export default function ApiKeysPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [keys, setKeys] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [isDataLoaded, setIsDataLoaded] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        } else if (status === 'authenticated') {
            fetchKeys();
        }
    }, [status, router]);

    const fetchKeys = async () => {
        try {
            const res = await fetch('/api/keys');
            const data = await res.json();
            if (data.keys) setKeys(data.keys);
            setIsDataLoaded(true);
        } catch (err) {
            console.error("Key fetch failed:", err);
            setIsDataLoaded(true);
        }
    };

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

    if (!isDataLoaded) return null;

    return (
        <div className="min-h-screen bg-white text-navy font-sans relative overflow-hidden">
            <InteractiveBackground />

            <div className="aurora-accent top-[-10%] right-[15%] opacity-40 blur-[120px]" />
            <div className="aurora-accent bottom-[-20%] left-[5%] opacity-30 blur-[100px] !bg-accent-purple" />

            <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-12 space-y-12">

                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-8">
                        <GlitchLogo />
                        <div className="h-8 w-px bg-silver hidden md:block" />
                        <motion.button
                            whileHover={{ x: -2 }}
                            onClick={() => router.push('/dashboard')}
                            className="flex items-center gap-2 text-sm font-bold text-ash hover:text-navy transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to Dashboard
                        </motion.button>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end mr-2 text-right">
                            <p className="text-xs font-bold text-ash uppercase tracking-widest">{session?.user?.role || 'FREE'} ACCOUNT</p>
                            <p className="text-sm font-black text-navy">{session?.user?.email}</p>
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="p-3 glass-card !rounded-full text-ash hover:text-score-ai transition-colors"
                        >
                            <Lock className="w-4 h-4" />
                        </button>
                    </div>
                </header>

                <ToastContainer />

                <div className="mb-8">
                    <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
                        <TerminalSquare className="w-8 h-8 text-accent-blue" />
                        Developer API
                    </h1>
                    <p className="text-ash font-medium mt-2">Manage your authentication tokens and programmatically access the Jotril engine.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Keys Manager */}
                    <div className="lg:col-span-8">
                        <div className="glass-card rounded-[32px] p-1 overflow-hidden h-full flex flex-col">
                            <div className="p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-silver/40">
                                <div>
                                    <h3 className="font-black text-xl">API Keys</h3>
                                    <p className="text-sm text-ash mt-1">Keep your keys secure. Never expose them in client-side code.</p>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleCreateKey}
                                    disabled={isGenerating}
                                    className="px-6 py-3 bg-accent-blue text-white rounded-xl font-bold shadow-xl text-sm disabled:opacity-50 whitespace-nowrap"
                                >
                                    {isGenerating ? "Generating..." : "+ New Secret Key"}
                                </motion.button>
                            </div>

                            <div className="p-1 flex-grow">
                                <div className="bg-surface/30 rounded-[28px] overflow-hidden h-full">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="text-[10px] font-bold text-ash uppercase tracking-[0.2em] border-b border-silver/50">
                                            <tr>
                                                <th className="p-6">Key Token</th>
                                                <th className="p-6">Created</th>
                                                <th className="p-6 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-silver/30">
                                            {keys.length === 0 ? (
                                                <tr><td colSpan="3" className="p-10 text-center text-ash text-sm font-medium">No active keys. Generate one to start building.</td></tr>
                                            ) : keys.map((k) => (
                                                <tr key={k.id} className="hover:bg-white/40 transition-colors group">
                                                    <td className="p-6">
                                                        <div className="flex items-center gap-2">
                                                            <code className="font-mono text-sm text-navy font-bold tracking-widest">{k.key}</code>
                                                            <button onClick={() => handleCopyKey(k.key, k.id)} className="text-ash hover:text-accent-blue transition-colors">
                                                                {copiedId === k.id ? <Check className="w-4 h-4 text-score-human" /> : <Copy className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="p-6 text-xs text-ash font-bold">{new Date(k.createdAt).toLocaleDateString()}</td>
                                                    <td className="p-6 text-right">
                                                        <button onClick={() => handleRevokeKey(k.id)} className="text-ash hover:text-score-ai transition-colors p-2">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* API Documentation Short Card */}
                    <div className="lg:col-span-4 space-y-8">
                        <div className="glass-card rounded-[32px] p-8 h-full flex flex-col justify-between">
                            <div>
                                <div className="p-3 bg-accent-blue/10 rounded-xl inline-block mb-6">
                                    <BookOpen className="w-6 h-6 text-accent-blue" />
                                </div>
                                <h3 className="text-xl font-black mb-3">Quick Integration</h3>
                                <p className="text-sm text-ash leading-relaxed mb-6">
                                    Attach your API key to the `Authorization` header as a Bearer token when making POST requests to the engine.
                                </p>

                                <div className="bg-navy rounded-xl p-4 overflow-hidden glow-border">
                                    <pre className="text-[10px] text-silver font-mono leading-relaxed overflow-x-auto">
                                        {`fetch('https://api.jotril.ai/v1/detect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer jt_ab12...cd34'
  },
  body: JSON.stringify({
    text: "..."
  })
})`}
                                    </pre>
                                </div>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -2 }}
                                disabled
                                className="w-full mt-8 py-4 glass-card text-ash font-bold rounded-xl text-sm opacity-50 cursor-not-allowed"
                            >
                                Full Documentation (Soon)
                            </motion.button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
