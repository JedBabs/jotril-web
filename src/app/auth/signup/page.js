'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { motion } from 'framer-motion';

const benefits = [
    { icon: "📊", text: "Track your scan history & usage" },
    { icon: "⚡", text: "2× more daily points than guests" },
    { icon: "🔑", text: "Access your personal dashboard" },
    { icon: "🚀", text: "Unlock Pro features when ready" },
];

export default function SignUpPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Registration failed');
                setIsLoading(false);
                return;
            }

            const signInRes = await signIn('credentials', {
                redirect: false,
                email,
                password
            });

            if (signInRes?.error) {
                setError('Registration successful, but auto-login failed. Please sign in manually.');
                setIsLoading(false);
            } else {
                router.push('/dashboard');
            }

        } catch (err) {
            setError('Network error occurred. Please try again later.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans aurora-bg relative">
            <div className="aurora-accent top-[30%] left-[50%]" />
            <div className="floating-orb w-3 h-3 bg-accent-purple/25 top-[10%] right-[20%]" style={{ animationDelay: '0s' }} />
            <div className="floating-orb w-2 h-2 bg-accent-blue/20 bottom-[25%] left-[10%]" style={{ animationDelay: '4s' }} />
            <div className="floating-orb w-4 h-4 bg-accent-pink/15 top-[70%] right-[70%]" style={{ animationDelay: '2s' }} />

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
                <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-6 text-center text-3xl font-black text-navy tracking-tight">
                    Create your free account
                </motion.h2>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-2 text-center text-sm text-ash font-medium">
                    Already have an account?{' '}
                    <Link href="/auth/signin" className="text-accent-blue font-bold hover:text-accent-blue-light transition-colors">Sign in</Link>
                </motion.p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10"
            >
                <div className="glass-card rounded-2xl py-8 px-6 sm:px-10">
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                            <label htmlFor="name" className="block text-sm font-bold text-navy mb-1.5">Full Name</label>
                            <input id="name" name="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)}
                                className="block w-full px-4 py-3 border border-silver rounded-xl bg-white/50 placeholder-ash-light focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all text-navy font-medium"
                                placeholder="Jane Doe" />
                        </motion.div>

                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
                            <label htmlFor="email" className="block text-sm font-bold text-navy mb-1.5">Email address</label>
                            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                className="block w-full px-4 py-3 border border-silver rounded-xl bg-white/50 placeholder-ash-light focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all text-navy font-medium"
                                placeholder="you@example.com" />
                        </motion.div>

                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                            <label htmlFor="password" className="block text-sm font-bold text-navy mb-1.5">Password</label>
                            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                                className="block w-full px-4 py-3 border border-silver rounded-xl bg-white/50 placeholder-ash-light focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all text-navy font-medium"
                                placeholder="••••••••" />
                            <p className="mt-2 text-xs font-semibold text-ash">Must be at least 8 characters.</p>
                        </motion.div>

                        {error && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl bg-score-ai/5 p-4 border border-score-ai/20">
                                <h3 className="text-sm font-semibold text-score-ai text-center">{error}</h3>
                            </motion.div>
                        )}

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                            <motion.button type="submit" disabled={isLoading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-accent-blue hover:bg-accent-blue-light focus:outline-none focus:ring-4 focus:ring-accent-blue/20 transition-all disabled:opacity-50 disabled:shadow-none btn-shimmer shadow-[0_4px_14px_rgba(37,99,235,0.25)]">
                                {isLoading ? 'Creating account...' : 'Sign up'}
                            </motion.button>
                        </motion.div>
                    </form>
                </div>

                {/* Why sign up? Benefits */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-6 glass-card !rounded-xl p-5"
                >
                    <p className="text-xs font-bold text-ash uppercase tracking-[0.15em] mb-3">Why create an account?</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {benefits.map((b, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -5 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.55 + i * 0.08 }}
                                className="flex items-center gap-2.5 text-sm text-navy"
                            >
                                <span className="text-base">{b.icon}</span>
                                <span className="font-medium">{b.text}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
