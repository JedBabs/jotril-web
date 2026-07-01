'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Send, Users, Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';

const AUDIENCES = [
    { id: 'all', label: 'All registered users', hint: 'Everyone with an account' },
    { id: 'verified', label: 'Verified emails only', hint: 'Confirmed their email — best deliverability' },
    { id: 'beta', label: 'Beta testers', hint: 'CU students comped Pro' },
    { id: 'pro', label: 'Pro & Ultra', hint: 'Paid / comped tiers' },
];

export default function AdminBroadcastPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();

    const [counts, setCounts] = useState(null);
    const [adminEmail, setAdminEmail] = useState('');
    const [audience, setAudience] = useState('verified');
    const [subject, setSubject] = useState('');
    const [heading, setHeading] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState(null);

    const loadCounts = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/broadcast');
            if (!res.ok) throw new Error('Failed to load audience counts');
            const data = await res.json();
            setCounts(data.counts);
            setAdminEmail(data.adminEmail || '');
        } catch (err) {
            showToast(err.message || 'Could not load broadcast tool.', 'error');
            router.push('/dashboard');
        }
    }, [router]);

    useEffect(() => {
        if (authStatus === 'unauthenticated') router.push('/auth/signin');
        else if (authStatus === 'authenticated') loadCounts();
    }, [authStatus, loadCounts, router]);

    const recipientCount = counts ? counts[audience] ?? 0 : null;

    const validate = () => {
        if (!subject.trim()) { showToast('Add a subject.', 'error'); return false; }
        if (!message.trim()) { showToast('Add a message.', 'error'); return false; }
        return true;
    };

    const sendTest = async () => {
        if (!validate()) return;
        setTesting(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test: true, subject, heading, message }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Test failed');
            if (data.sent) {
                showToast(`Test sent to ${data.to} — check your inbox (and spam).`, 'success');
            } else {
                showToast(`Test failed: ${data.errors?.[0] || 'email provider rejected the send'}`, 'error');
                setResult(data); // surface the full provider error in the panel below
            }
        } catch (err) {
            showToast(err.message || 'Test send failed.', 'error');
        } finally {
            setTesting(false);
        }
    };

    const sendBroadcast = async () => {
        if (!validate()) return;
        if (!recipientCount) { showToast('No recipients in that audience.', 'error'); return; }
        const label = AUDIENCES.find((a) => a.id === audience)?.label || audience;
        if (!confirm(`Send this email to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'} (${label})?\n\nThis cannot be undone.`)) return;

        setSending(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audience, subject, heading, message }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Send failed');
            setResult(data);
            showToast(`Sent ${data.sent}/${data.total}.`, data.failed ? 'error' : 'success');
        } catch (err) {
            showToast(err.message || 'Broadcast failed.', 'error');
        } finally {
            setSending(false);
        }
    };

    const inputStyle = {
        background: 'var(--dyn-bg-surface)',
        borderColor: 'var(--dyn-glass-border)',
        color: 'var(--dyn-text-navy)',
    };

    return (
        <div className="min-h-screen aurora-bg" style={{ background: 'var(--dyn-bg-white)' }}>
            <div className="relative z-10 max-w-5xl mx-auto p-6 md:p-10">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-medium mb-2 transition-colors hover:text-[var(--dyn-accent-blue)]" style={{ color: 'var(--dyn-ash)' }}>
                        <ArrowLeft size={15} /> Back to Admin
                    </Link>
                    <h1 className="text-3xl font-black flex items-center gap-2.5" style={{ color: 'var(--dyn-text-navy)' }}>
                        <Mail className="text-accent-blue" /> Broadcast email
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--dyn-ash)' }}>
                        Send an announcement to your registered users. Each person gets their own message (no shared recipient list).
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Composer */}
                    <div className="space-y-5">
                        {/* Audience */}
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--dyn-text-navy)' }}>Audience</label>
                            <div className="space-y-2">
                                {AUDIENCES.map((a) => {
                                    const active = audience === a.id;
                                    const c = counts ? counts[a.id] : null;
                                    return (
                                        <button
                                            key={a.id}
                                            onClick={() => setAudience(a.id)}
                                            className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left border transition-all"
                                            style={{
                                                background: active ? 'var(--dyn-accent-blue)' : 'var(--dyn-glass-bg)',
                                                borderColor: active ? 'var(--dyn-accent-blue)' : 'var(--dyn-glass-border)',
                                                color: active ? '#fff' : 'var(--dyn-text-navy)',
                                            }}
                                        >
                                            <span>
                                                <span className="block text-sm font-semibold">{a.label}</span>
                                                <span className="block text-xs" style={{ color: active ? 'rgba(255,255,255,0.8)' : 'var(--dyn-ash)' }}>{a.hint}</span>
                                            </span>
                                            <span className="text-sm font-bold tabular-nums inline-flex items-center gap-1">
                                                <Users size={14} />{c == null ? '…' : c}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Subject */}
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--dyn-text-navy)' }}>Subject</label>
                            <input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                maxLength={200}
                                placeholder="e.g. Jotril AI — a quick update for project season"
                                className="w-full rounded-xl p-3 text-sm outline-none border"
                                style={inputStyle}
                            />
                        </div>

                        {/* Heading (optional) */}
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--dyn-text-navy)' }}>
                                Heading <span className="font-normal" style={{ color: 'var(--dyn-ash)' }}>(optional — shown in the email body)</span>
                            </label>
                            <input
                                value={heading}
                                onChange={(e) => setHeading(e.target.value)}
                                maxLength={200}
                                placeholder="Defaults to the subject"
                                className="w-full rounded-xl p-3 text-sm outline-none border"
                                style={inputStyle}
                            />
                        </div>

                        {/* Message */}
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--dyn-text-navy)' }}>Message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={9}
                                maxLength={20000}
                                placeholder="Write your message. Leave a blank line between paragraphs."
                                className="w-full rounded-xl p-3 text-sm outline-none border resize-y"
                                style={inputStyle}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-3 pt-1">
                            <button
                                onClick={sendTest}
                                disabled={testing || sending}
                                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border disabled:opacity-50"
                                style={{ borderColor: 'var(--dyn-glass-border)', color: 'var(--dyn-accent-blue)' }}
                            >
                                {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                Send test{adminEmail ? ` to ${adminEmail}` : ''}
                            </button>
                            <button
                                onClick={sendBroadcast}
                                disabled={sending || testing}
                                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))' }}
                            >
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {sending ? 'Sending…' : `Send to ${recipientCount ?? '…'}`}
                            </button>
                        </div>

                        {result && (
                            <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--dyn-glass-border)', background: 'var(--dyn-glass-bg)', color: 'var(--dyn-text-navy)' }}>
                                <p className="font-bold mb-1">Send complete</p>
                                <p style={{ color: 'var(--dyn-ash)' }}>Sent {result.sent} / {result.total}{result.failed ? ` · ${result.failed} failed` : ''}.</p>
                                {result.errors?.length > 0 && (
                                    <ul className="mt-2 list-disc list-inside text-xs" style={{ color: 'var(--dyn-score-ai, #EF4444)' }}>
                                        {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Live preview */}
                    <div>
                        <label className="block text-sm font-bold mb-2" style={{ color: 'var(--dyn-text-navy)' }}>Preview</label>
                        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--dyn-glass-border)' }}>
                            <div className="px-5 py-3" style={{ background: '#0f172a' }}>
                                <span className="text-base font-extrabold text-white">Jotril<span style={{ color: '#60a5fa' }}> AI</span></span>
                                <span className="float-right text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#1e293b', color: '#93c5fd' }}>BETA</span>
                            </div>
                            <div className="p-5" style={{ background: '#ffffff', color: '#1e293b' }}>
                                <h2 className="text-lg font-bold mb-3" style={{ color: '#0f172a' }}>{heading || subject || 'Your heading'}</h2>
                                <div className="text-sm whitespace-pre-wrap" style={{ color: '#1e293b', lineHeight: 1.6 }}>
                                    {message || 'Your message will appear here…'}
                                </div>
                            </div>
                            <div className="px-5 py-3 text-[11px]" style={{ background: '#f8fafc', color: '#64748b', borderTop: '1px solid #e2e8f0' }}>
                                Jotril AI is in private beta. AI-detection results are probabilistic and may be inaccurate.
                            </div>
                        </div>
                        <p className="text-xs mt-3" style={{ color: 'var(--dyn-ash)' }}>
                            Tip: send a test to yourself first to confirm formatting and that it lands in the inbox (not spam).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
