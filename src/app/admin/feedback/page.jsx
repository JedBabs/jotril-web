'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MessageSquare, Bug, Lightbulb, Frown, Heart, MessageCircle, Trash2, RefreshCw, Image as ImageIcon, X } from 'lucide-react';
import { showToast } from '@/components/Toast';

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'WONTFIX'];
const STATUS_LABEL = { NEW: 'New', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', WONTFIX: "Won't fix" };
const STATUS_STYLE = {
    NEW: { bg: 'bg-accent-blue/10', text: 'text-accent-blue' },
    IN_PROGRESS: { bg: 'bg-score-mixed/10', text: 'text-score-mixed' },
    RESOLVED: { bg: 'bg-score-human/10', text: 'text-score-human' },
    WONTFIX: { bg: 'bg-ash/10', text: 'text-ash' },
};
const CATEGORY_ICON = { bug: Bug, idea: Lightbulb, complaint: Frown, praise: Heart, other: MessageCircle };

export default function AdminFeedbackPage() {
    const { status: authStatus } = useSession();
    const router = useRouter();
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({ NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, WONTFIX: 0 });
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [nextCursor, setNextCursor] = useState(null);
    const [lightbox, setLightbox] = useState(null); // data URL of an opened screenshot
    const [loadingShot, setLoadingShot] = useState(null); // feedback id currently loading

    const viewScreenshot = async (id) => {
        setLoadingShot(id);
        try {
            const res = await fetch(`/api/admin/feedback/${id}`);
            if (!res.ok) throw new Error('Could not load screenshot');
            const data = await res.json();
            if (!data.screenshot) throw new Error('No screenshot found');
            setLightbox(data.screenshot);
        } catch (err) {
            showToast(err.message || 'Could not load screenshot.', 'error');
        } finally {
            setLoadingShot(null);
        }
    };

    const load = useCallback(async (statusFilter = filter, cursor = null, append = false) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            if (cursor) params.set('cursor', cursor);
            const res = await fetch(`/api/admin/feedback?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load feedback');
            const data = await res.json();
            setItems((prev) => (append ? [...prev, ...data.items] : data.items));
            setCounts(data.counts);
            setNextCursor(data.nextCursor);
        } catch (err) {
            showToast(err.message || 'Could not load feedback.', 'error');
            router.push('/dashboard');
        } finally {
            setLoading(false);
        }
    }, [filter, router]);

    useEffect(() => {
        if (authStatus === 'unauthenticated') router.push('/auth/signin');
        else if (authStatus === 'authenticated') load(filter, null, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authStatus, filter]);

    const updateItem = async (id, patch) => {
        try {
            const res = await fetch(`/api/admin/feedback/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (!res.ok) throw new Error('Update failed');
            const data = await res.json();
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));
            // Refresh counts when status changes.
            if (patch.status) load(filter, null, false);
            showToast('Saved.', 'success');
        } catch (err) {
            showToast(err.message || 'Could not save.', 'error');
        }
    };

    const remove = async (id) => {
        if (!confirm('Delete this feedback permanently?')) return;
        try {
            const res = await fetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            setItems((prev) => prev.filter((it) => it.id !== id));
            showToast('Deleted.', 'success');
        } catch (err) {
            showToast(err.message || 'Could not delete.', 'error');
        }
    };

    return (
        <div className="min-h-screen aurora-bg" style={{ background: 'var(--dyn-bg-white)' }}>
            <div className="relative z-10 max-w-5xl mx-auto p-6 md:p-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-medium mb-2 transition-colors hover:text-[var(--dyn-accent-blue)]" style={{ color: 'var(--dyn-ash)' }}>
                            <ArrowLeft size={15} /> Back to Admin
                        </Link>
                        <h1 className="text-3xl font-black flex items-center gap-2.5" style={{ color: 'var(--dyn-text-navy)' }}>
                            <MessageSquare className="text-accent-blue" /> Feedback
                        </h1>
                    </div>
                    <button onClick={() => load(filter, null, false)} className="p-2.5 rounded-xl border" style={{ borderColor: 'var(--dyn-glass-border)', color: 'var(--dyn-ash)' }} aria-label="Refresh">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Filter tabs */}
                <div className="flex flex-wrap gap-2 mb-6">
                    <FilterTab active={filter === ''} onClick={() => setFilter('')} label="All" count={Object.values(counts).reduce((a, b) => a + b, 0)} />
                    {STATUSES.map((s) => (
                        <FilterTab key={s} active={filter === s} onClick={() => setFilter(s)} label={STATUS_LABEL[s]} count={counts[s]} />
                    ))}
                </div>

                {/* List */}
                {loading && items.length === 0 ? (
                    <div className="py-20 text-center" style={{ color: 'var(--dyn-ash)' }}>Loading…</div>
                ) : items.length === 0 ? (
                    <div className="py-20 text-center" style={{ color: 'var(--dyn-ash)' }}>No feedback yet.</div>
                ) : (
                    <div className="space-y-4">
                        {items.map((it) => {
                            const Icon = CATEGORY_ICON[it.category] || MessageCircle;
                            const ss = STATUS_STYLE[it.status] || STATUS_STYLE.NEW;
                            return (
                                <motion.div
                                    key={it.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="rounded-2xl border p-5"
                                    style={{ background: 'var(--dyn-glass-bg)', borderColor: 'var(--dyn-glass-border)' }}
                                >
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-accent-purple/10 text-accent-purple">
                                                <Icon size={13} /> {it.category}
                                            </span>
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ss.bg} ${ss.text}`}>{STATUS_LABEL[it.status]}</span>
                                            {it.rating ? <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>{'★'.repeat(it.rating)}</span> : null}
                                        </div>
                                        <button onClick={() => remove(it.id)} className="text-ash/60 hover:text-score-ai transition-colors" aria-label="Delete">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: 'var(--dyn-text-navy)' }}>{it.message}</p>

                                    <div className="text-xs mb-4 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: 'var(--dyn-ash)' }}>
                                        {it.email && <span>{it.email}{it.userRole ? ` · ${it.userRole}` : ''}</span>}
                                        {it.pageUrl && <span>on {it.pageUrl}</span>}
                                        <span>{new Date(it.createdAt).toLocaleString()}</span>
                                        {it.hasScreenshot && (
                                            <button
                                                onClick={() => viewScreenshot(it.id)}
                                                disabled={loadingShot === it.id}
                                                className="inline-flex items-center gap-1 font-semibold disabled:opacity-60 hover:text-[var(--dyn-accent-blue)]"
                                                style={{ color: 'var(--dyn-accent-blue)' }}
                                            >
                                                <ImageIcon size={13} /> {loadingShot === it.id ? 'Loading…' : 'Screenshot'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Triage controls */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {STATUSES.map((s) => (
                                            <button
                                                key={s}
                                                onClick={() => updateItem(it.id, { status: s })}
                                                disabled={it.status === s}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-100 transition-colors"
                                                style={{
                                                    borderColor: 'var(--dyn-glass-border)',
                                                    background: it.status === s ? 'var(--dyn-accent-blue)' : 'transparent',
                                                    color: it.status === s ? '#fff' : 'var(--dyn-ash)',
                                                }}
                                            >
                                                {STATUS_LABEL[s]}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            );
                        })}

                        {nextCursor && (
                            <button
                                onClick={() => load(filter, nextCursor, true)}
                                className="w-full py-3 rounded-xl border font-semibold text-sm"
                                style={{ borderColor: 'var(--dyn-glass-border)', color: 'var(--dyn-accent-blue)' }}
                            >
                                Load more
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Screenshot lightbox */}
            <AnimatePresence>
                {lightbox && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setLightbox(null)}
                        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
                        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
                    >
                        <button
                            onClick={() => setLightbox(null)}
                            aria-label="Close"
                            className="absolute top-5 right-5 text-white/80 hover:text-white"
                        >
                            <X size={28} />
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={lightbox}
                            alt="Feedback screenshot"
                            onClick={(e) => e.stopPropagation()}
                            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function FilterTab({ active, onClick, label, count }) {
    return (
        <button
            onClick={onClick}
            className="text-sm font-semibold px-4 py-2 rounded-full border transition-colors"
            style={{
                background: active ? 'var(--dyn-accent-blue)' : 'var(--dyn-glass-bg)',
                color: active ? '#fff' : 'var(--dyn-ash)',
                borderColor: active ? 'var(--dyn-accent-blue)' : 'var(--dyn-glass-border)',
            }}
        >
            {label} <span className="opacity-70">({count})</span>
        </button>
    );
}
