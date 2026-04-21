'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Suspense } from 'react';

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-4 border-silver border-t-accent-blue animate-spin" />
            </div>
        }>
            <ResetPasswordForm />
        </Suspense>
    );
}

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!token) {
            setStatus({ type: 'error', message: 'Invalid or missing reset token.' });
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) return;

        setIsLoading(true);
        setStatus({ type: '', message: '' });

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus({ type: 'error', message: data.error || 'Failed to reset password' });
            } else {
                setStatus({ type: 'success', message: 'Password has been successfully reset!' });
                setPassword('');
                setTimeout(() => {
                    router.push('/auth/signin');
                }, 3000);
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Network error occurred. Please try again later.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans aurora-bg relative">
            <div className="aurora-accent top-[30%] right-[30%]" />
            <div className="floating-orb w-3 h-3 bg-accent-purple/20 top-[20%] right-[15%]" style={{ animationDelay: '0s' }} />
            <div className="floating-orb w-2 h-2 bg-accent-blue/20 bottom-[30%] left-[20%]" style={{ animationDelay: '3s' }} />

            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
            >
                <div className="flex justify-center items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push('/')}>
                    <span className="text-3xl font-black text-navy">Jotril</span>
                    <span className="text-3xl font-black text-accent-blue">AI</span>
                    <span className="text-accent-blue text-4xl leading-none font-black">.</span>
                </div>
                <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                    className="mt-6 text-center text-3xl font-black text-navy tracking-tight">
                    Set new password
                </motion.h2>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                    className="mt-2 text-center text-sm text-ash font-medium">
                    Please securely enter your new password below.
                </motion.p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10"
            >
                <div className="glass-card rounded-2xl py-8 px-6 sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                            <label htmlFor="password" className="block text-sm font-bold text-navy mb-1.5">
                                New Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                minLength={8}
                                disabled={!token}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full px-4 py-3 border border-silver rounded-xl bg-white/50 placeholder-ash-light focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all text-navy font-medium disabled:opacity-50"
                                placeholder="•••••••••"
                            />

                            {/* Password Strength Indicator */}
                            {password.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    <div className="flex gap-1 h-1.5 w-full rounded-full overflow-hidden">
                                        <div className={`h-full flex-1 transition-colors ${password.length >= 8 ? 'bg-score-human' : 'bg-silver'}`} />
                                        <div className={`h-full flex-1 transition-colors ${/(?=.*[A-Z])/.test(password) && /(?=.*[a-z])/.test(password) ? 'bg-score-human' : 'bg-silver'}`} />
                                        <div className={`h-full flex-1 transition-colors ${/(?=.*\d)/.test(password) ? 'bg-score-human' : 'bg-silver'}`} />
                                        <div className={`h-full flex-1 transition-colors ${/(?=.*[@$!%*?&])/.test(password) ? 'bg-score-human' : 'bg-silver'}`} />
                                    </div>
                                    <p className="text-[10px] font-bold text-ash flex justify-between">
                                        <span>Weak</span>
                                        <span>Strong</span>
                                    </p>
                                </div>
                            )}
                            <p className="mt-1 text-xs font-semibold text-ash">Must be 8+ chars and contain uppercase, lowercase, number & symbol.</p>
                        </motion.div>

                        {status.message && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`rounded-xl p-4 border ${status.type === 'error'
                                    ? 'bg-score-ai/5 border-score-ai/20'
                                    : 'bg-score-human/5 border-score-human/20'}`}
                            >
                                <h3 className={`text-sm font-semibold text-center ${status.type === 'error' ? 'text-score-ai' : 'text-score-human'}`}>
                                    {status.message}
                                </h3>
                            </motion.div>
                        )}

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                            <motion.button
                                type="submit"
                                disabled={isLoading || !token}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-accent-blue hover:bg-accent-blue-light focus:outline-none focus:ring-4 focus:ring-accent-blue/20 transition-all disabled:opacity-50 btn-shimmer shadow-[0_4px_14px_rgba(37,99,235,0.25)]"
                            >
                                {isLoading ? 'Resetting...' : 'Reset Password'}
                            </motion.button>
                        </motion.div>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
