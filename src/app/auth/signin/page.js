'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function SignInPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDevMode, setIsDevMode] = useState(false);
    const [devPin, setDevPin] = useState('');
    const [resending, setResending] = useState(false);
    const [resendMsg, setResendMsg] = useState('');

    // Sign-in is blocked until the email is verified (authorize() throws this). When we
    // see that specific error, offer a one-click way to re-send the verification email
    // (covers the "it went to spam / I lost it" case — the #1 signup dead-end).
    const needsVerify = /verify your email/i.test(error);

    const handleResend = async () => {
        if (!email) {
            setResendMsg('Enter your email above first.');
            return;
        }
        setResending(true);
        setResendMsg('');
        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            setResendMsg(data.message || 'If an unverified account exists, a new link is on its way.');
        } catch {
            setResendMsg('Could not resend right now. Please try again shortly.');
        } finally {
            setResending(false);
        }
    };

    // Redirect already-authenticated users to the dashboard
    useEffect(() => {
        if (status === 'authenticated') {
            router.replace('/dashboard');
        }
    }, [status, router]);

    // Show nothing while checking session (prevents form flash)
    if (status === 'loading' || status === 'authenticated') {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center font-sans aurora-bg">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-silver border-t-accent-blue animate-spin" />
                    <div className="absolute inset-3 rounded-full border-4 border-silver border-b-accent-cyan animate-[spin_2s_reverse_infinite]" />
                </div>
            </div>
        );
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        let credentials = { redirect: false };
        if (isDevMode) {
            credentials.devPin = devPin;
        } else {
            credentials.email = email;
            credentials.password = password;
        }

        const res = await signIn('credentials', credentials);

        if (res?.error) {
            try {
                const parsedError = JSON.parse(res.error);
                setError(parsedError.message);
            } catch {
                setError(res.error);
            }
        } else {
            router.push('/dashboard');
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans aurora-bg relative">
            {/* Aurora accent */}
            <div className="aurora-accent top-[20%] right-[20%]" />

            {/* Floating orbs */}
            <div className="floating-orb w-3 h-3 bg-accent-blue/20 top-[15%] left-[10%]" style={{ animationDelay: '0s' }} />
            <div className="floating-orb w-2 h-2 bg-accent-purple/20 bottom-[20%] right-[15%]" style={{ animationDelay: '3s' }} />
            <div className="floating-orb w-4 h-4 bg-accent-cyan/15 top-[60%] left-[80%]" style={{ animationDelay: '5s' }} />

            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
            >
                <div
                    className="flex justify-center items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => router.push('/')}
                >
                    <span className="text-3xl font-black text-navy">Jotril</span>
                    <span className="text-3xl font-black text-accent-blue">AI</span>
                    <span className="text-accent-blue text-4xl leading-none font-black">.</span>
                </div>
                <motion.h2
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="mt-6 text-center text-3xl font-black text-navy tracking-tight"
                >
                    Welcome back
                </motion.h2>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="mt-2 text-center text-sm text-ash font-medium"
                >
                    Or{' '}
                    <a href="/auth/signup" className="text-accent-blue font-bold hover:text-accent-blue-light transition-colors">
                        create your free account
                    </a>
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
                        {!isDevMode ? (
                            <>
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                                    <label htmlFor="email" className="block text-sm font-bold text-navy mb-1.5">
                                        Email address
                                    </label>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required={!isDevMode}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full px-4 py-3 border border-silver rounded-xl bg-white/50 placeholder-ash-light focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all text-navy font-medium"
                                        placeholder="you@example.com"
                                    />
                                </motion.div>

                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
                                    <label htmlFor="password" className="block text-sm font-bold text-navy mb-1.5">
                                        Password
                                    </label>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required={!isDevMode}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full px-4 py-3 border border-silver rounded-xl bg-white/50 placeholder-ash-light focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all text-navy font-medium"
                                        placeholder="••••••••"
                                    />
                                </motion.div>

                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <input
                                            id="remember-me"
                                            name="remember-me"
                                            type="checkbox"
                                            className="h-4 w-4 text-accent-blue focus:ring-accent-blue border-silver rounded cursor-pointer"
                                        />
                                        <label htmlFor="remember-me" className="ml-2 block text-sm text-ash font-medium cursor-pointer">
                                            Remember me
                                        </label>
                                    </div>

                                    <div className="text-sm">
                                        <a href="/auth/forgot-password" className="font-bold text-accent-blue hover:text-accent-blue-light transition-colors">
                                            Forgot password?
                                        </a>
                                    </div>
                                </motion.div>
                            </>
                        ) : (
                            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                                <label htmlFor="devPin" className="block text-sm font-bold text-navy mb-1.5">
                                    Developer PIN
                                </label>
                                <input
                                    id="devPin"
                                    name="devPin"
                                    type="password"
                                    required={isDevMode}
                                    value={devPin}
                                    onChange={(e) => setDevPin(e.target.value)}
                                    className="block w-full px-4 py-3 border border-score-ai/30 rounded-xl bg-score-ai/5 placeholder-ash-light focus:outline-none focus:border-score-ai focus:ring-2 focus:ring-score-ai/20 transition-all text-navy font-mono font-medium"
                                    placeholder="Enter Dev PIN"
                                />
                            </motion.div>
                        )}

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl bg-score-ai/5 p-4 border border-score-ai/20"
                            >
                                <h3 className="text-sm font-semibold text-score-ai text-center">{error}</h3>
                                {needsVerify && (
                                    <div className="mt-3 text-center">
                                        <button
                                            type="button"
                                            onClick={handleResend}
                                            disabled={resending}
                                            className="text-sm font-bold text-accent-blue hover:text-accent-blue-light transition-colors disabled:opacity-50"
                                        >
                                            {resending ? 'Sending…' : 'Resend verification email'}
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}
                        {resendMsg && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl bg-accent-blue/5 p-3 border border-accent-blue/20"
                            >
                                <p className="text-xs font-semibold text-accent-blue text-center">{resendMsg}</p>
                            </motion.div>
                        )}

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                            <motion.button
                                type="submit"
                                disabled={isLoading}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                className={`w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:shadow-none btn-shimmer ${isDevMode
                                    ? 'bg-score-ai hover:bg-score-ai/90 shadow-[0_4px_14px_rgba(239,68,68,0.25)] focus:ring-4 focus:ring-score-ai/20'
                                    : 'bg-accent-blue hover:bg-accent-blue-light shadow-[0_4px_14px_rgba(37,99,235,0.25)] focus:ring-4 focus:ring-accent-blue/20'
                                    }`}
                            >
                                {isLoading ? 'Signing in...' : isDevMode ? 'Enter Dev Mode' : 'Sign in'}
                            </motion.button>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="relative mt-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-silver"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-ash font-medium">Or continue with</span>
                            </div>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                            <button
                                type="button"
                                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                                className="w-full flex justify-center items-center py-3 px-4 rounded-xl border border-silver bg-white text-sm font-bold text-navy hover:bg-black/5 transition-colors shadow-sm"
                            >
                                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continue with Google
                            </button>
                        </motion.div>

                        {/* Developer Mode Toggle */}
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-4 text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsDevMode(!isDevMode);
                                    setError('');
                                }}
                                className="text-xs text-ash hover:text-navy transition-colors opacity-50 hover:opacity-100"
                            >
                                {isDevMode ? 'Back to regular login' : 'Developer Access'}
                            </button>
                        </motion.div>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
