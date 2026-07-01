'use client';

import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, X, Send, Bug, Lightbulb, Frown, Heart, MessageCircle, ImagePlus } from 'lucide-react';
import { showToast } from './Toast';

const CATEGORIES = [
    { id: 'bug', label: 'Bug', icon: Bug },
    { id: 'idea', label: 'Idea', icon: Lightbulb },
    { id: 'complaint', label: 'Issue', icon: Frown },
    { id: 'praise', label: 'Praise', icon: Heart },
    { id: 'other', label: 'Other', icon: MessageCircle },
];

// Downscale an image file to a small JPEG data URL so the screenshot stays well
// under the server cap (and never bloats the DB). Caps the longest edge and
// re-compresses; returns a data:image/jpeg;base64 string.
async function fileToDownscaledDataUrl(file, maxEdge = 1280, quality = 0.7) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('decode failed'));
        i.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
}

export default function FeedbackWidget() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState('bug');
    const [message, setMessage] = useState('');
    const [email, setEmail] = useState('');
    const [rating, setRating] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [screenshot, setScreenshot] = useState(null); // data URL or null
    const [processingImg, setProcessingImg] = useState(false);
    const fileInputRef = useRef(null);

    // Don't overlap the admin tooling.
    if (pathname?.startsWith('/admin')) return null;

    const reset = () => {
        setCategory('bug');
        setMessage('');
        setEmail('');
        setRating(0);
        setScreenshot(null);
    };

    const onPickImage = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-picking the same file
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please choose an image file.', 'error');
            return;
        }
        setProcessingImg(true);
        try {
            const dataUrl = await fileToDownscaledDataUrl(file);
            // Hard cap (~1.4MB of base64) so the request and DB row stay small.
            if (dataUrl.length > 1_400_000) {
                showToast('That image is too large even after compression. Try a crop.', 'error');
                return;
            }
            setScreenshot(dataUrl);
        } catch {
            showToast('Could not process that image.', 'error');
        } finally {
            setProcessingImg(false);
        }
    };

    const submit = async () => {
        if (!message.trim()) {
            showToast('Please enter a message.', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category,
                    message,
                    rating: rating || undefined,
                    email: email || undefined,
                    screenshot: screenshot || undefined,
                    pageUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to send');
            showToast(data.message || 'Thanks for the feedback!', 'success');
            reset();
            setOpen(false);
        } catch (err) {
            showToast(err.message || 'Could not send feedback.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* Launcher */}
            <motion.button
                onClick={() => setOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Send feedback"
                className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full px-4 py-3 font-semibold text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))' }}
            >
                <MessageSquarePlus size={20} />
                <span className="hidden sm:inline text-sm">Feedback</span>
            </motion.button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                        onClick={() => setOpen(false)}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0, scale: 0.98 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 40, opacity: 0, scale: 0.98 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 border"
                            style={{
                                background: 'var(--dyn-bg-white)',
                                borderColor: 'var(--dyn-glass-border)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                            }}
                        >
                            <div className="flex items-start justify-between mb-1">
                                <h3 className="text-lg font-black" style={{ color: 'var(--dyn-text-navy)' }}>
                                    Share feedback
                                </h3>
                                <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: 'var(--dyn-ash)' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--dyn-ash)' }}>
                                You&rsquo;re using a beta. Tell us anything — bugs, confusion, wishes. No detail is too small.
                            </p>

                            {/* Category */}
                            <div className="flex flex-wrap gap-2 mb-4">
                                {CATEGORIES.map((c) => {
                                    const Icon = c.icon;
                                    const active = category === c.id;
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => setCategory(c.id)}
                                            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all"
                                            style={{
                                                background: active ? 'var(--dyn-accent-blue)' : 'var(--dyn-glass-bg)',
                                                color: active ? '#fff' : 'var(--dyn-ash)',
                                                borderColor: active ? 'var(--dyn-accent-blue)' : 'var(--dyn-glass-border)',
                                            }}
                                        >
                                            <Icon size={14} />
                                            {c.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Message */}
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={4}
                                maxLength={4000}
                                placeholder="What happened, or what would make Jotril better?"
                                className="w-full rounded-xl p-3 text-sm outline-none border resize-none mb-3"
                                style={{
                                    background: 'var(--dyn-bg-surface)',
                                    borderColor: 'var(--dyn-glass-border)',
                                    color: 'var(--dyn-text-navy)',
                                }}
                            />

                            {/* Guest email */}
                            {!session?.user?.email && (
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Your email (optional — so we can reply)"
                                    className="w-full rounded-xl p-3 text-sm outline-none border mb-3"
                                    style={{
                                        background: 'var(--dyn-bg-surface)',
                                        borderColor: 'var(--dyn-glass-border)',
                                        color: 'var(--dyn-text-navy)',
                                    }}
                                />
                            )}

                            {/* Rating */}
                            <div className="flex items-center gap-2 mb-5">
                                <span className="text-sm" style={{ color: 'var(--dyn-ash)' }}>
                                    Rate your experience:
                                </span>
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setRating(n === rating ? 0 : n)}
                                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                                        className="text-xl leading-none transition-transform hover:scale-110"
                                        style={{ color: n <= rating ? '#F59E0B' : 'var(--dyn-glass-border)' }}
                                    >
                                        ★
                                    </button>
                                ))}
                            </div>

                            {/* Screenshot attach */}
                            <div className="mb-5">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={onPickImage}
                                    className="hidden"
                                />
                                {screenshot ? (
                                    <div className="relative inline-block">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={screenshot}
                                            alt="Attached screenshot preview"
                                            className="max-h-32 rounded-xl border"
                                            style={{ borderColor: 'var(--dyn-glass-border)' }}
                                        />
                                        <button
                                            onClick={() => setScreenshot(null)}
                                            aria-label="Remove screenshot"
                                            className="absolute -top-2 -right-2 rounded-full p-1 text-white shadow"
                                            style={{ background: 'var(--dyn-accent-blue)' }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={processingImg}
                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium border disabled:opacity-60"
                                        style={{ borderColor: 'var(--dyn-glass-border)', color: 'var(--dyn-ash)' }}
                                    >
                                        <ImagePlus size={16} />
                                        {processingImg ? 'Processing…' : 'Attach screenshot'}
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={submit}
                                disabled={submitting}
                                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-white disabled:opacity-60"
                                style={{ background: 'linear-gradient(135deg, var(--dyn-accent-blue), var(--dyn-accent-purple))' }}
                            >
                                <Send size={16} />
                                {submitting ? 'Sending…' : 'Send feedback'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
