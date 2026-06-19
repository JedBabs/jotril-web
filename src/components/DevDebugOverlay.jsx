'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { QueueManager } from '@/lib/queue-manager';

export default function DevDebugOverlay() {
    const { data: session } = useSession();
    const [errors, setErrors] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [telemetry, setTelemetry] = useState(null);

    useEffect(() => {
        const unsubscribeQueue = QueueManager.subscribe((payload) => {
            if (payload.telemetry) {
                setTelemetry(payload.telemetry);
            }
        });
        if (!session?.user?.isDev) return;

        // Intercept Window Errors
        const handleWindowError = (event) => {
            addError({
                type: 'window_error',
                message: event.message || event.error?.message || 'Unknown Error',
                source: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack,
                time: new Date().toISOString()
            });
        };

        const handlePromiseRejection = (event) => {
            addError({
                type: 'unhandled_rejection',
                message: event.reason?.message || String(event.reason) || 'Promise Rejection',
                stack: event.reason?.stack,
                time: new Date().toISOString()
            });
        };

        // Intercept Console Error
        const originalConsoleError = console.error;
        console.error = (...args) => {
            originalConsoleError(...args);
            addError({
                type: 'console_error',
                message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
                time: new Date().toISOString()
            });
        };

        // Intercept Fetch for API 500s
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);
                if (!response.ok && response.status >= 400) {
                    // Clone to read body without consuming it for the actual app
                    const clone = response.clone();
                    let errBody;
                    try {
                        errBody = await clone.text();
                    } catch {
                        errBody = 'Could not read response body';
                    }
                    addError({
                        type: 'api_error',
                        message: `Fetch failed: ${response.status} ${response.statusText}`,
                        url: typeof args[0] === 'string' ? args[0] : args[0]?.url,
                        responseBody: errBody,
                        time: new Date().toISOString()
                    });
                }
                return response;
            } catch (err) {
                addError({
                    type: 'network_error',
                    message: err.message || 'Fetch failed to execute',
                    url: typeof args[0] === 'string' ? args[0] : args[0]?.url,
                    stack: err.stack,
                    time: new Date().toISOString()
                });
                throw err;
            }
        };

        window.addEventListener('error', handleWindowError);
        window.addEventListener('unhandledrejection', handlePromiseRejection);

        return () => {
            window.removeEventListener('error', handleWindowError);
            window.removeEventListener('unhandledrejection', handlePromiseRejection);
            console.error = originalConsoleError;
            window.fetch = originalFetch;
            unsubscribeQueue();
        };
    }, [session?.user?.isDev]);

    const addError = (errObj) => {
        setErrors(prev => [errObj, ...prev].slice(0, 50)); // Keep last 50
        setIsOpen(true); // Auto-open on new error
    };

    const clearErrors = () => {
        setErrors([]);
        setIsOpen(false);
    };

    // Only render for DEV session
    if (!session?.user?.isDev) return null;

    return (
        <div className="fixed bottom-4 left-4 z-[9999] font-mono text-sm">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border transition-colors ${errors.length > 0 ? 'bg-red-900 border-red-500 text-red-100' : 'bg-gray-900 border-gray-600 text-gray-300'}`}
            >
                <span>🛠 Dev Panel</span>
                {errors.length > 0 && (
                    <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                        {errors.length}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute bottom-full mb-2 left-0 w-[500px] max-w-[90vw] max-h-[70vh] bg-gray-950 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col text-gray-200"
                    >
                        <div className="flex justify-between items-center p-3 border-b border-gray-800 bg-gray-900">
                            <h3 className="font-bold text-gray-100">Antigravity Debug Console</h3>
                            <div className="flex gap-2">
                                <button onClick={clearErrors} className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-600">Clear</button>
                                <button onClick={() => setIsOpen(false)} className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-600">Close</button>
                            </div>
                        </div>

                        {telemetry && (
                            <div className="p-3 border-b border-gray-800 bg-gray-900/50 space-y-1">
                                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Vercel Proxy Telemetry</h4>
                                <div className="flex justify-between text-xs text-gray-400"><span>Chunks Processed:</span> <span className="font-mono text-green-400">{telemetry.processedChunks}</span></div>
                                <div className="flex justify-between text-xs text-gray-400"><span>Network Drops:</span> <span className="font-mono text-amber-500">{telemetry.connectionDrops}</span></div>
                                <div className="flex justify-between text-xs text-gray-400"><span>Sweeper Retries (T999):</span> <span className="font-mono text-purple-400">{telemetry.sweeperRetries}</span></div>
                                <div className="flex justify-between text-xs text-gray-400 font-bold"><span>Edge Limit Load:</span> <span className="font-mono text-blue-400">{telemetry.edgeProxyCalls} / 100,000</span></div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {errors.length === 0 ? (
                                <div className="text-gray-500 text-center py-4">No errors intercepted yet.</div>
                            ) : (
                                errors.map((err, i) => (
                                    <div key={i} className="bg-gray-900 border border-red-900/50 rounded-lg p-3">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-red-400 font-bold uppercase text-xs">{err.type}</span>
                                            <span className="text-gray-500 text-xs">{new Date(err.time).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="text-red-300 break-words font-semibold mb-2">{err.message}</div>

                                        {err.url && (
                                            <div className="text-blue-300 text-xs mb-1 truncate">URL: {err.url}</div>
                                        )}

                                        {err.responseBody && (
                                            <div className="bg-black/50 p-2 rounded border border-gray-800 text-xs text-gray-400 overflow-x-auto whitespace-pre">
                                                {err.responseBody}
                                            </div>
                                        )}

                                        {err.stack && (
                                            <details className="mt-2 text-xs text-gray-500">
                                                <summary className="cursor-pointer hover:text-gray-400">View Stack Trace</summary>
                                                <pre className="mt-1 p-2 bg-black/50 rounded overflow-x-auto whitespace-pre">{err.stack}</pre>
                                            </details>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
