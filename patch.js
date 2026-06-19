const fs = require('fs');

let qm = fs.readFileSync('src/lib/queue-manager.js', 'utf8');
if (!qm.includes('cancelJob(jobId)')) {
    qm = qm.replace('getGlobalQueueDepthMs() {', 'cancelJob(jobId) {\n        this.activeJobs.delete(jobId);\n        this.queue = this.queue.filter(j => j.jobId !== jobId);\n        this._notify();\n    }\n\n    getGlobalQueueDepthMs() {');
    fs.writeFileSync('src/lib/queue-manager.js', qm);
}

let side = fs.readFileSync('src/components/QueueSidebar.jsx', 'utf8');
if (!side.includes('cancelJob(job')) {
    side = side.replace('return (', 'const handleCancel = (e, id) => { e.stopPropagation(); QueueManager.cancelJob(id); };\n                        return (');
    side = side.replace('<div className="mt-2 h-1', '<button onClick={(e) => handleCancel(e, job.jobId)} className="absolute top-2 right-2 text-[9px] px-2 py-0.5 rounded border border-red-500/20 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all font-bold">CANCEL</button>\n                            <div className="mt-2 h-1');
    fs.writeFileSync('src/components/QueueSidebar.jsx', side);
}
console.log('Patch complete.');
