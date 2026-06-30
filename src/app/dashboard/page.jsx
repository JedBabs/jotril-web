"use client";
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
    Activity,
    Shield,
    Zap,
    History,
    Key,
    ExternalLink,
    ChevronLeft,
    Clock,
    FileText,
    ArrowUpRight,
    Copy,
    Check,
    Trash2,
    Lock,
    BookOpen,
    ShieldAlert,
    DownloadCloud,
    Search
} from 'lucide-react';
import dynamic from "next/dynamic";
import GlitchLogo from "@/components/GlitchLogo";
import QuotaBar from "@/components/QuotaBar";
import FileUploader from "@/components/FileUploader";
import { showToast } from "@/components/Toast";
import QueueSidebar from "@/components/QueueSidebar";

// Below-the-fold / conditional components — code-split out of the dashboard's
// first-load bundle. These only download when they're actually needed.
const HeatmapViewer = dynamic(() => import("@/components/HeatmapViewer"), {
    loading: () => null,
});
const ScoreGauge = dynamic(() => import("@/components/ScoreGauge"), {
    loading: () => null,
});
const ColdStartOverlay = dynamic(() => import("@/components/ColdStartOverlay"), {
    ssr: false,
    loading: () => null,
});
const SignUpNudge = dynamic(() => import("@/components/SignUpNudge"), {
    loading: () => null,
});
const InteractiveBackground = dynamic(() => import("@/components/InteractiveBackground"), {
    ssr: false,
    loading: () => null,
});
import { generateHardwareVector } from "@/lib/fingerprint";
import { useAnalyze } from "@/hooks/useAnalyze";
import { useProcess } from "@/components/ProcessContext";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { getJSON } from "@/lib/resilient-fetch";

const tierGradients = {
    FREE: "from-accent-blue to-accent-cyan",
    PRO: "from-accent-purple to-accent-pink",
    ULTRA: "from-accent-pink to-score-mixed",
    ADMIN: "from-score-human to-accent-cyan",
};

export default function EnhancedAccountPortal() {
    const { data: session, status, update } = useSession();
    const router = useRouter();

    const [stats, setStats] = useState(null);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [devMode, setDevMode] = useState(false);
    const [deviceHash, setDeviceHash] = useState(null);

    const refreshDashboard = useCallback(() => {
        // getJSON retries 5xx/network with backoff; a temporary blip no longer
        // wipes the dashboard. Errors are swallowed silently — the existing
        // skeleton/zero state is the right fallback.
        getJSON('/api/dashboard')
            .then((data) => { if (data && !data.error) setStats(data); })
            .catch((err) => console.error("Dashboard data fetch failed:", err));
    }, []);

    const {
        results,
        breakdown,
        overallLabel,
        coldStart,
        scannedFile,
        sourceHtml,
        quotaRefreshKey,
        isActive,
        lastText,
        lastScanId,
        handleAnalyze,
        handleRetry,
        resetResults,
    } = useAnalyze({ deviceHash, onAfterComplete: refreshDashboard });

    const { openProcess, simulateProgress, closeProcess } = useProcess();

    // Sync session role if database role has changed (e.g. after manual upgrade)
    useEffect(() => {
        if (stats?.tier && session?.user?.role && stats.tier !== session.user.role) {
            update({ role: stats.tier });
        }
    }, [stats, session, update]);

    useEffect(() => {
        generateHardwareVector().then((vector) => setDeviceHash(vector));
    }, []);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated') {
            const fetchData = async () => {
                try {
                    const dashData = await getJSON('/api/dashboard');
                    if (dashData && !dashData.error) setStats(dashData);
                } catch (err) {
                    // Even on full exhaustion we still want the page to render —
                    // the skeleton + zero state is the right fallback on a dead link.
                    console.error("Dashboard data fetch failed:", err);
                } finally {
                    setIsDataLoaded(true);
                }
            };
            fetchData();
        }
    }, [status]);

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
    const purchasedPoints = stats?.purchasedPoints || 0;
    const recentScans = stats?.recentScans || [];

    let quotaMax = 100;
    if (tier === 'PRO') quotaMax = 500;
    if (tier === 'ULTRA') quotaMax = 5000;
    if (tier === 'UNAUTHENTICATED') quotaMax = 50;

    const fillRatio = Math.min((spentPoints / quotaMax) * 100, 100);
    const gradient = tierGradients[tier] || tierGradients.FREE;

    return (
        <div className="min-h-screen bg-white text-navy font-sans relative overflow-hidden">
            <InteractiveBackground />

            {/* Aurora effects */}
            <div className="aurora-accent top-[-10%] right-[15%] opacity-40 blur-[120px]" />
            <div className="aurora-accent bottom-[-20%] left-[5%] opacity-30 blur-[100px] !bg-accent-purple" />

            <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-12 space-y-12">

                {/* Navbar / Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-8">
                        <GlitchLogo />
                        <div className="h-8 w-px bg-silver hidden md:block" />
                        <motion.button
                            whileHover={{ x: -2 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => router.push('/')}
                            className="flex items-center gap-2 text-sm font-bold text-ash hover:text-navy transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to Scanner
                        </motion.button>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end mr-2 text-right">
                            <div className="flex items-center gap-2">
                                {tier === 'ADMIN' && (
                                    <span className="px-2 py-0.5 rounded-full bg-score-human/10 text-score-human text-[9px] font-black border border-score-human/20 tracking-tighter uppercase">Admin</span>
                                )}
                                <p className="text-xs font-bold text-ash uppercase tracking-widest">{tier} ACCOUNT</p>
                            </div>
                            <p className="text-sm font-black text-navy">{stats?.email}</p>
                        </div>
                        <ThemeSwitcher />
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => signOut()}
                            className="p-3 glass-card !rounded-full text-ash hover:text-score-ai transition-colors"
                        >
                            <Lock className="w-4 h-4" />
                        </motion.button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT COLUMN: Main Stats & Management */}
                    <div className="lg:col-span-8 space-y-8">

                        {/* Welcome & Admin CTA */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                            <div>
                                <h1 className="text-4xl font-black tracking-tight">Account Portal</h1>
                                <p className="text-ash font-medium mt-1">Activity insights and content analysis.</p>
                            </div>

                            <div className="flex flex-wrap gap-4">
                                {tier === 'ADMIN' && (
                                    <motion.button
                                        whileHover={{ scale: 1.05, y: -2 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => router.push('/admin')}
                                        className="flex items-center gap-3 px-6 py-3 bg-navy text-white rounded-2xl font-bold shadow-2xl text-sm btn-shimmer"
                                    >
                                        <Shield className="w-5 h-5 text-score-human" />
                                        Access Admin Hub
                                        <ArrowUpRight className="w-4 h-4 opacity-50" />
                                    </motion.button>
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => document.getElementById('scanner-anchor')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="flex items-center gap-3 px-6 py-3 glass-card rounded-2xl font-bold text-sm"
                                >
                                    <Sparkles className="w-5 h-5 text-accent-blue" />
                                    Start New Scan
                                </motion.button>
                            </div>
                        </div>

                        {/* Integrated Scanner Section */}
                        <div id="scanner-anchor" className="space-y-8 pt-4">
                            <AnimatePresence mode="wait">
                                {!results && !isActive && !coldStart && (
                                    <motion.div
                                        key="uploader"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="liquid-card overflow-hidden"
                                    >
                                        <div className="rounded-[32px] p-1 bg-gradient-to-br from-silver/20 to-transparent">
                                            <div className="rounded-[31px]" style={{ background: "var(--dyn-glass-bg)", backdropFilter: "blur(24px)" }}>
                                                <FileUploader onAnalyze={handleAnalyze} disabled={isActive} deviceHash={deviceHash} initialText={lastText} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}



                                {coldStart && (
                                    <ColdStartOverlay onRetry={handleRetry} />
                                )}

                                {results && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-8"
                                    >
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-6 rounded-[24px]">
                                            <div>
                                                <p className="text-[10px] font-black text-accent-blue uppercase tracking-widest">Deep Scan Complete</p>
                                                <h3 className="text-xl font-black mt-1">Analysis Results</h3>
                                            </div>
                                            <div className="flex gap-3">
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={async () => {
                                                        const controller = new AbortController();
                                                        openProcess("download", "Generating Report PDF", "Compiling styles & layout...", () => controller.abort());
                                                        simulateProgress([
                                                            { progress: 30, duration: 400, step: "Extracting semantic tokens..." },
                                                            { progress: 70, duration: 600, step: "Executing predictive layers..." }
                                                        ]);
                                                        try {
                                                            const { downloadReport } = await import("@/lib/download-report");
                                                            await downloadReport({
                                                                scanId: lastScanId || undefined,
                                                                file: scannedFile,
                                                                filename: scannedFile ? scannedFile.name : 'Text_Scan',
                                                                breakdown,
                                                                overallLabel,
                                                                chunks: results,
                                                                sentenceCount: results.length,
                                                                wordCount: results.reduce((s, c) => s + c.text.trim().split(/\s+/).length, 0),
                                                                sourceHtml,
                                                                signal: controller.signal
                                                            });
                                                        } finally {
                                                            closeProcess();
                                                        }
                                                    }}
                                                    className="px-5 py-2.5 bg-gradient-to-tr from-accent-blue to-accent-purple text-white rounded-xl font-bold text-xs shadow-lg"
                                                >
                                                    Download PDF
                                                </motion.button>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={resetResults}
                                                    className="px-5 py-2.5 glass-card rounded-xl font-bold text-xs"
                                                >
                                                    New Scan
                                                </motion.button>

                                                {tier === 'ADMIN' && (
                                                    <motion.button
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => setDevMode(!devMode)}
                                                        className={`px-4 py-2.5 rounded-xl font-bold text-xs border border-transparent shadow-md transition-all ${devMode ? 'bg-accent-purple text-white shadow-accent-purple/30 border-accent-pink/30' : 'bg-silver/20 text-navy hover:bg-silver/40'}`}
                                                        title="Toggle developer analytics overlay"
                                                    >
                                                        🛠 Dev
                                                    </motion.button>
                                                )}
                                            </div>
                                        </div>
                                        <ScoreGauge breakdown={breakdown} overallLabel={overallLabel} sentenceCount={results.length} wordCount={results.reduce((s, c) => s + c.text.trim().split(/\s+/).length, 0)} />
                                        <HeatmapViewer chunks={results} devMode={devMode} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Stats Overview Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="glass-card rounded-[24px] p-8 relative group overflow-hidden">
                                <Activity className="w-5 h-5 text-accent-blue mb-4" />
                                <p className="text-xs font-bold text-ash uppercase tracking-widest">Lifetime Scans</p>
                                <p className="text-4xl font-black mt-2 text-navy tracking-tighter">{totalRequests}</p>
                                <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-accent-blue/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                            </div>

                            <div className="glass-card rounded-[24px] p-8 relative group overflow-hidden">
                                <Zap className="w-5 h-5 text-accent-purple mb-4" />
                                <p className="text-xs font-bold text-ash uppercase tracking-widest">Usage Burn</p>
                                <p className="text-4xl font-black mt-2 text-navy tracking-tighter">{spentPoints}<span className="text-sm text-ash ml-1 font-bold">pts</span></p>
                                <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-accent-purple/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                            </div>

                            <div className="glass-card rounded-[24px] p-8 relative group overflow-hidden bg-gradient-to-br from-score-human/[0.03] to-transparent">
                                <Sparkles className="w-5 h-5 text-score-human mb-4" />
                                <p className="text-xs font-bold text-ash uppercase tracking-widest">Points Wallet</p>
                                <p className="text-4xl font-black mt-2 text-score-human tracking-tighter">{purchasedPoints}</p>
                                <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-score-human/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                            </div>
                        </div>

                        {/* Past Analysis Results */}
                        <div className="glass-card rounded-[32px] overflow-hidden p-1">
                            <div className="p-6 pb-2 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-navy/5 rounded-lg text-navy">
                                        <History className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-black text-lg">Previous Uploads</h3>
                                </div>
                                <span className="text-[10px] font-bold text-ash uppercase tracking-widest">Last 10 Reports</span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <tbody className="divide-y divide-silver/40">
                                        {!(stats?.pastScanResults?.length > 0) ? (
                                            <tr>
                                                <td className="p-12 text-center text-ash font-medium text-sm">No previous scan reports found. Start analyzing to build history.</td>
                                            </tr>
                                        ) : stats.pastScanResults.map((scan, i) => (
                                            <motion.tr
                                                key={scan.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                className="hover:bg-surface/50 group transition-colors"
                                            >
                                                <td className="p-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-ash group-hover:text-accent-blue transition-colors">
                                                            {scan.type === 'DOCUMENT' ? <FileText className="w-4 h-4" /> : <div className="text-[10px] font-black">TX</div>}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-sm text-navy max-w-[200px] truncate">{scan.filename || 'Text Input Scan'}</p>
                                                            <p className="text-xs text-ash font-medium">{new Date(scan.createdAt).toLocaleDateString()} at {new Date(scan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-5 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${(scan.overallLabel || '').toLowerCase().includes('human') ? 'bg-score-human/10 text-score-human' : (scan.overallLabel || '').toLowerCase().includes('mixed') ? 'bg-score-mixed/10 text-score-mixed' : 'bg-score-ai/10 text-score-ai'}`}>
                                                        {scan.overallLabel}
                                                    </span>
                                                </td>
                                                <td className="p-5 text-right">
                                                    <motion.button
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={async () => {
                                                            const controller = new AbortController();
                                                            openProcess("download", "Generating Report PDF", "Fetching analysis data...", () => controller.abort());
                                                            simulateProgress([
                                                                { progress: 20, duration: 200, step: "Retrieving chunks from database..." },
                                                                { progress: 50, duration: 400, step: "Extracting semantic tokens..." },
                                                                { progress: 80, duration: 300, step: "Executing predictive layers..." }
                                                            ]);
                                                            try {
                                                                // The server fetches the full scan (chunks + reproduced
                                                                // document HTML) and renders the PDF by id.
                                                                const { downloadReport } = await import("@/lib/download-report");
                                                                await downloadReport({ scanId: scan.id, filename: scan.filename || 'Text_Scan', signal: controller.signal });
                                                            } catch (err) {
                                                                if (err?.name !== "AbortError") {
                                                                    showToast("Failed to generate PDF.", "error");
                                                                    console.error(err);
                                                                }
                                                            } finally {
                                                                closeProcess();
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-gradient-to-tr from-accent-blue to-accent-purple text-white rounded-lg font-bold text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        Download PDF
                                                    </motion.button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Dashboard Sub-Pages Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

                            {tier === 'ADMIN' && (
                                <motion.button
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => router.push('/admin')}
                                    className="glass-card rounded-[32px] p-8 text-left transition-all hover:bg-surface/50 group border border-transparent hover:border-score-human/30 relative overflow-hidden ring-2 ring-score-human/20"
                                >
                                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-score-human/10 rounded-full blur-2xl group-hover:bg-score-human/20 transition-colors" />
                                    <div className="flex items-center gap-3 mb-4 text-score-human">
                                        <div className="p-3 bg-score-human/10 rounded-2xl group-hover:scale-110 transition-transform"><Shield className="w-6 h-6" /></div>
                                        <h3 className="font-black text-xl text-navy">Admin Hub</h3>
                                    </div>
                                    <p className="text-sm text-ash font-medium leading-relaxed">System dashboard, user management, and quota overrides.</p>
                                    <div className="mt-8 flex items-center text-xs font-bold text-score-human uppercase tracking-widest group-hover:gap-2 transition-all">
                                        Open Console <ArrowUpRight className="w-4 h-4 ml-1" />
                                    </div>
                                </motion.button>
                            )}

                            <motion.button
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => router.push('/dashboard/api-keys')}
                                className="glass-card rounded-[32px] p-8 text-left transition-all hover:bg-surface/50 group border border-transparent hover:border-accent-blue/30 relative overflow-hidden"
                            >
                                <div className="absolute -top-12 -right-12 w-32 h-32 bg-accent-blue/5 rounded-full blur-2xl group-hover:bg-accent-blue/10 transition-colors" />
                                <div className="flex items-center gap-3 mb-4 text-accent-blue">
                                    <div className="p-3 bg-accent-blue/10 rounded-2xl group-hover:scale-110 transition-transform"><Key className="w-6 h-6" /></div>
                                    <h3 className="font-black text-xl text-navy">Developer API</h3>
                                </div>
                                <p className="text-sm text-ash font-medium leading-relaxed">Generate tokens to build AI apps powered by Jotril V2.</p>
                                <div className="mt-8 flex items-center text-xs font-bold text-accent-blue uppercase tracking-widest group-hover:gap-2 transition-all">
                                    Manage Keys <ArrowUpRight className="w-4 h-4 ml-1" />
                                </div>
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => showToast("Exporting history...", "info")}
                                className="glass-card rounded-[32px] p-8 text-left transition-all hover:bg-surface/50 group border border-transparent hover:border-accent-purple/30 relative overflow-hidden"
                            >
                                <div className="absolute -top-12 -right-12 w-32 h-32 bg-accent-purple/5 rounded-full blur-2xl group-hover:bg-accent-purple/10 transition-colors" />
                                <div className="flex items-center gap-3 mb-4 text-accent-purple">
                                    <div className="p-3 bg-accent-purple/10 rounded-2xl group-hover:scale-110 transition-transform"><DownloadCloud className="w-6 h-6" /></div>
                                    <h3 className="font-black text-xl text-navy">Export Logs</h3>
                                </div>
                                <p className="text-sm text-ash font-medium leading-relaxed">Download your full history as encrypted PDF or CSV files.</p>
                                <div className="mt-8 flex items-center text-xs font-bold text-accent-purple uppercase tracking-widest group-hover:gap-2 transition-all">
                                    Request Export <ArrowUpRight className="w-4 h-4 ml-1" />
                                </div>
                            </motion.button>

                            <motion.div
                                className="glass-card rounded-[32px] p-8 text-left relative overflow-hidden opacity-50 cursor-not-allowed hidden sm:block"
                            >
                                <div className="flex items-center gap-3 mb-4 text-ash">
                                    <div className="p-3 bg-silver/30 rounded-2xl"><BookOpen className="w-6 h-6" /></div>
                                    <h3 className="font-black text-xl text-navy">Technical Docs</h3>
                                </div>
                                <p className="text-sm text-ash font-medium leading-relaxed">Learn about our multi-scale detection methodology.</p>
                                <div className="mt-8 flex items-center text-xs font-bold text-ash uppercase tracking-widest">
                                    Coming Soon
                                </div>
                            </motion.div>
                        </div>

                        <QuotaBar deviceHash={deviceHash} refreshKey={quotaRefreshKey} session={session} />
                    </div>

                    {/* RIGHT COLUMN: Tier & Current Quota */}
                    <div className="lg:col-span-4 space-y-8">

                        {/* Current Plan Card */}
                        <div className="relative glow-border rounded-[32px] overflow-hidden">
                            <div className={`bg-gradient-to-br ${gradient} p-8 text-white relative h-full flex flex-col`}>
                                <div className="absolute top-0 right-0 p-8 opacity-20 transform translate-x-4 -translate-y-4">
                                    <Zap className="w-32 h-32" />
                                </div>
                                <div className="relative z-10 flex-grow">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Subscription Status</p>
                                    </div>
                                    <h2 className="text-5xl font-black tracking-tighter mb-4">{tier}</h2>
                                    <p className="text-white/70 text-sm font-medium leading-relaxed mb-10">
                                        {tier === 'FREE' ? 'Upgrade to Pro for deep document analysis and high-volume scanning.' :
                                            tier === 'PRO' ? 'Professional scan volume with advanced detection layers.' :
                                                tier === 'ADMIN' ? 'Full system authority with prioritized engine access.' : 'Maximum capacity unlocked.'}
                                    </p>
                                </div>

                                <div className="relative z-10 space-y-4">
                                    <div className="flex justify-between items-end mb-2">
                                        <p className="text-xs font-bold uppercase tracking-widest opacity-80">Daily Progress</p>
                                        <p className="text-sm font-black tabular-nums">{tier === 'ADMIN' ? '∞' : `${spentPoints}/${quotaMax}`}</p>
                                    </div>
                                    <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${tier === 'ADMIN' ? 0 : fillRatio}%` }}
                                            className="h-full bg-white shadow-[0_0_15px_white]"
                                        />
                                    </div>
                                    <p className="text-[10px] font-bold opacity-60 italic">Refreshing daily at 00:00 UTC</p>
                                </div>
                            </div>
                        </div>

                        {/* Background Queue Dashboard */}
                        <QueueSidebar />

                        {/* Upgrade CTA / Extra Info */}
                        {tier === 'FREE' && (
                            <div className="glass-card rounded-[32px] p-8 space-y-6">
                                <h4 className="font-black text-xl">Unlock Ultra Precision</h4>
                                <ul className="space-y-4">
                                    {[
                                        { t: "Deep Doc Scan", d: "Scan PDFs and Word documents" },
                                        { t: "High Quota", d: "5000 scans per day" },
                                        { t: "API Access", d: "Build using the Jotril engine" }
                                    ].map(item => (
                                        <li key={item.t} className="flex items-start gap-3">
                                            <div className="p-1 bg-accent-blue/10 rounded mt-0.5 text-accent-blue"><Check className="w-3 h-3" /></div>
                                            <div>
                                                <p className="text-sm font-bold text-navy leading-none mb-1">{item.t}</p>
                                                <p className="text-xs text-ash font-medium">{item.d}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                <motion.button
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="w-full py-4 bg-navy text-white font-black rounded-2xl shadow-xl text-sm"
                                >
                                    View Pricing Plans
                                </motion.button>
                            </div>
                        )}

                        {/* Support Card */}
                        <div className="glass-card rounded-[32px] p-8 border-dashed border-2">
                            <h4 className="font-black text-lg mb-2">Need help?</h4>
                            <p className="text-sm text-ash font-medium mb-6">Our response window for {tier === 'FREE' ? 'Free' : 'priority'} support is currently 2 hours.</p>
                            <a href="mailto:support@jotril.ai" className="text-accent-blue font-bold text-sm hover:underline flex items-center gap-2">
                                Contact Support
                                <ArrowUpRight className="w-3 h-3" />
                            </a>
                        </div>

                    </div>
                </div>
            </div>

            <style jsx global>{`
                .num-rise { animation: rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
                @keyframes rise {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

function Sparkles(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <path d="M5 3v4" />
            <path d="M19 17v4" />
            <path d="M3 5h4" />
            <path d="M17 19h4" />
        </svg>
    )
}
