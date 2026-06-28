'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';

function VerifyContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [status, setStatus] = useState('verifying'); // verifying, success, error
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('No verification token provided. Invalid link.');
            return;
        }

        const verifyEmail = async () => {
            try {
                const res = await fetch('/api/auth/verify-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });

                const data = await res.json();

                if (!res.ok) {
                    setStatus('error');
                    setMessage(data.error || 'Verification failed.');
                } else {
                    setStatus('success');
                    setMessage('Your email has been successfully verified! You can now access your account.');
                }
            } catch (err) {
                setStatus('error');
                setMessage('A network error occurred while verifying. Please try again.');
            }
        };

        verifyEmail();
    }, [token]);

    return (
        <div className="glass-card rounded-2xl py-10 px-6 sm:px-10 text-center">
            {status === 'verifying' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="w-12 h-12 rounded-full border-4 border-accent-blue border-t-transparent animate-spin mx-auto"></div>
                    <h3 className="text-xl font-bold text-navy">Verifying your email...</h3>
                    <p className="text-ash text-sm">Please wait while we validate your secure link.</p>
                </motion.div>
            )}

            {status === 'success' && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
                    <div className="w-16 h-16 rounded-full bg-score-human/20 text-score-human flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h3 className="text-2xl font-black text-navy tracking-tight">Email Verified!</h3>
                    <p className="text-ash text-sm font-medium">{message}</p>
                    <button onClick={() => router.push('/auth/signin')}
                        className="w-full mt-4 flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-accent-blue hover:bg-accent-blue-light transition-all btn-shimmer shadow-[0_4px_14px_rgba(37,99,235,0.25)]">
                        Sign In Now
                    </button>
                </motion.div>
            )}

            {status === 'error' && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
                    <div className="w-16 h-16 rounded-full bg-score-ai/20 text-score-ai flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </div>
                    <h3 className="text-2xl font-black text-navy tracking-tight">Invalid Link</h3>
                    <p className="text-ash text-sm font-medium">{message}</p>
                    <a href="/auth/signin"
                        className="block w-full mt-2 py-3.5 px-4 rounded-xl text-sm font-bold border border-silver text-navy hover:bg-black/5 transition-all">
                        Return to Sign In
                    </a>
                </motion.div>
            )}
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans aurora-bg relative">
            <div className="aurora-accent top-[30%] left-[50%]" />
            <div className="floating-orb w-3 h-3 bg-accent-purple/25 top-[10%] right-[20%]" style={{ animationDelay: '0s' }} />

            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="flex justify-center items-center gap-1">
                    <span className="text-3xl font-black text-navy">Jotril</span>
                    <span className="text-3xl font-black text-accent-blue">AI</span>
                    <span className="text-accent-blue text-4xl leading-none font-black">.</span>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10">
                <Suspense fallback={<div className="text-center font-bold text-ash py-10">Loading...</div>}>
                    <VerifyContent />
                </Suspense>
            </motion.div>
        </div>
    );
}
