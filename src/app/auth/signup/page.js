'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { motion } from 'framer-motion';

const BETA_EMAIL_DOMAIN = 'stu.cu.edu.ng';

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
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [agreed, setAgreed] = useState(false);

    const isCuEmail = email.toLowerCase().trim().endsWith(`@${BETA_EMAIL_DOMAIN}`);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!agreed) {
            setError('Please accept the Terms and Privacy Policy to continue.');
            return;
        }
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

            // Successfully registered! Do not auto-login because they need to verify their email first.
            setSuccessMsg("Registration successful! We've sent a verification link to your email — check your inbox (and your spam folder). Didn't get it? You can resend it from the sign-in page.");
            setIsLoading(false);

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
                    <a href="/auth/signin" className="text-accent-blue font-bold hover:text-accent-blue-light transition-colors">Sign in</a>
                </motion.p>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-4 text-center text-xs font-semibold">
                    <span className="inline-block px-3 py-1.5 rounded-full bg-accent-blue/10 text-accent-blue">
                        🎓 Covenant University students get <span className="font-black">Pro free for 2 months</span> — verify your @stu.cu.edu.ng email
                    </span>
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
                            {isCuEmail && (
                                <p className="mt-1.5 text-xs font-bold text-score-human flex items-center gap-1">
                                    🎉 Nice — you&rsquo;ll get Pro free for 2 months once you verify this email.
                                </p>
                            )}
                        </motion.div>

                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                            <label htmlFor="password" className="block text-sm font-bold text-navy mb-1.5">Password</label>
                            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                                className="block w-full px-4 py-3 border border-silver rounded-xl bg-white/50 placeholder-ash-light focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 transition-all text-navy font-medium"
                                placeholder="•••••••••" />

                            {/* Password Strength Indicator */}
                            {password.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    <div className="flex gap-1 h-1.5 w-full rounded-full overflow-hidden">
                                        <div className={`h-full flex-1 transition-colors ${password.length >= 8 ? 'bg-score-human' : 'bg-silver'}`} />
                                        <div className={`h-full flex-1 transition-colors ${/(?=.*[A-Z])/.test(password) && /(?=.*[a-z])/.test(password) ? 'bg-score-human' : 'bg-silver'}`} />
                                        <div className={`h-full flex-1 transition-colors ${/(?=.*\d)/.test(password) ? 'bg-score-human' : 'bg-silver'}`} />
                                        <div className={`h-full flex-1 transition-colors ${/(?=.*[^a-zA-Z0-9])/.test(password) ? 'bg-score-human' : 'bg-silver'}`} />
                                    </div>
                                    <p className="text-[10px] font-bold text-ash flex justify-between">
                                        <span>Weak</span>
                                        <span>Strong</span>
                                    </p>
                                </div>
                            )}
                            <p className="mt-1 text-xs font-semibold text-ash">Must be 8+ chars and contain uppercase, lowercase, number & symbol.</p>
                        </motion.div>

                        {error && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl bg-[#EF4444]/10 p-4 border border-[#EF4444]/20">
                                <h3 className="text-sm font-semibold text-[#EF4444] text-center">{error}</h3>
                            </motion.div>
                        )}
                        {successMsg && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl bg-[#10B981]/10 p-4 border border-[#10B981]/20">
                                <h3 className="text-sm font-bold text-[#10B981] text-center mb-2">Check Your Email</h3>
                                <p className="text-xs text-[#10B981]/90 text-center">{successMsg}</p>
                            </motion.div>
                        )}

                        <motion.label initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.33 }}
                            htmlFor="agree" className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input id="agree" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-silver text-accent-blue focus:ring-accent-blue/30 shrink-0" />
                            <span className="text-xs text-ash leading-relaxed">
                                I agree to the{' '}
                                <a href="/legal/terms" target="_blank" className="text-accent-blue font-semibold hover:underline">Terms of Service</a>{' '}and{' '}
                                <a href="/legal/privacy" target="_blank" className="text-accent-blue font-semibold hover:underline">Privacy Policy</a>,
                                and understand Jotril is in beta and its results are estimates, not proof.
                            </span>
                        </motion.label>

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                            <motion.button type="submit" disabled={isLoading || !!successMsg || !agreed} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-accent-blue hover:bg-accent-blue-light focus:outline-none focus:ring-4 focus:ring-accent-blue/20 transition-all disabled:opacity-50 disabled:shadow-none btn-shimmer shadow-[0_4px_14px_rgba(37,99,235,0.25)]">
                                {isLoading ? 'Creating account...' : successMsg ? 'Account Created' : 'Sign up'}
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
                                onClick={() => {
                                    // Google is also an account-creation path, so it must clear the
                                    // same Terms/Privacy consent gate as the email/password form.
                                    if (!agreed) {
                                        setError('Please accept the Terms and Privacy Policy to continue.');
                                        return;
                                    }
                                    signIn('google', { callbackUrl: '/dashboard' });
                                }}
                                className="w-full flex justify-center items-center py-3 px-4 rounded-xl border border-silver bg-white text-sm font-bold text-navy hover:bg-black/5 transition-colors shadow-sm disabled:opacity-50"
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
