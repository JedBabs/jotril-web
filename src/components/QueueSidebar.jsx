"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Activity, FileText } from "lucide-react";
import { QueueManager } from "@/lib/queue-manager";

export default function QueueSidebar() {
    const [jobs, setJobs] = useState([]);

    useEffect(() => {
        // Subscribe to singleton queue emitted changes
        const unsubscribe = QueueManager.subscribe((payload) => {
            setJobs(payload.jobs);
        });

        const handleCancel = (e, id) => { e.stopPropagation(); QueueManager.cancelJob(id); };
                        return () => unsubscribe();
    }, []);

    if (jobs.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-[32px] p-6 space-y-6 border border-accent-blue/30 relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 rounded-full blur-2xl" />

            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold p-3 rounded-xl flex items-center gap-2 uppercase tracking-widest">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Warning: Refreshing or closing this tab will cancel your background downloads
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-accent-blue">
                    <Activity className="w-5 h-5 animate-pulse" />
                    <h3 className="font-black text-lg text-navy">Background Scans</h3>
                </div>
                <span className="text-[10px] bg-accent-blue/10 text-accent-blue px-2 py-1 rounded-md font-bold tracking-widest">{jobs.length} ACTIVE</span>
            </div>

            <div className="space-y-4">
                <AnimatePresence>
                    {jobs.map(job => {
                        const progress = job.total > 0 ? (job.completed / job.total) * 100 : 0;
                        const etaMins = Math.floor(job.etaSeconds / 60);
                        const etaSecs = Math.floor(job.etaSeconds % 60);

                        return (
                            <motion.div
                                key={job.jobId}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-surface/50 rounded-2xl p-4 shadow-sm border border-silver/40"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                                        <FileText className="w-4 h-4 text-ash shrink-0" />
                                        <p className="font-bold text-sm text-navy truncate">{job.filename}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent-purple shrink-0 bg-accent-purple/10 px-2 py-0.5 rounded-full">
                                        <Clock className="w-3 h-3" />
                                        {etaMins}:{etaSecs < 10 ? '0' : ''}{etaSecs}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] font-bold text-ash tracking-widest">
                                        <span>{Math.round(progress)}% COMPLETED</span>
                                        <span>CHUNKS: {job.completed}/{job.total}</span>
                                    </div>
                                    <div className="w-full bg-silver/30 rounded-full h-1.5 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ ease: "linear", duration: 0.5 }}
                                            className="h-full bg-gradient-to-r from-accent-blue to-accent-purple"
                                        />
                                    </div>
                                </div>
                                {job.tier > 1 && (
                                    <div className="mt-2 text-[9px] font-bold text-score-human bg-score-human/10 w-fit px-1.5 py-0.5 rounded uppercase tracking-widest">Priority Pro Access</div>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
