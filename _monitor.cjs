require('dotenv').config({path:'.env.local', quiet:true});
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DSID = 'e3dabf59-b657-438a-89ae-2dd39d3e2313';
const start = Date.now();
let lastKey = '';

async function tick() {
  const run = await prisma.tuningRun.findFirst({
    where: { datasetId: DSID }, orderBy: { createdAt: 'desc' }
  });
  const el = Math.round((Date.now()-start)/1000);
  if (!run) { console.log(`[${el}s] no run yet — waiting for you to click Run Optimization`); return false; }
  const key = `${run.status}|${run.progress}|${run.message||''}`;
  if (key !== lastKey) {
    console.log(`[${el}s] ${run.status} ${run.progress}% — ${(run.message||'').slice(0,70)}`);
    lastKey = key;
  }
  if (['COMPLETE','FAILED','CANCELLED'].includes(run.status)) {
    console.log(`\n=== TERMINAL: ${run.status} ===`);
    console.log('bestAccuracy:', run.bestAccuracy, '| bestMcc:', run.bestMcc, '| trials:', run.trialCount);
    if (run.metrics) {
      const m = run.metrics;
      console.log('test metrics:', JSON.stringify(m.test || {}, null, 0).slice(0,300));
      console.log('confusion (full):', JSON.stringify(m.confusionMatrix || {}));
    }
    if (run.error) console.log('ERROR:', run.error);
    // Check the cache that was built
    const ds = await prisma.tuningDataset.findUnique({where:{id:DSID}, select:{scoreCache:true}});
    if (ds.scoreCache) {
      const allScores = ds.scoreCache.flatMap(d=>d.scores);
      const uniq = new Set(allScores.map(s=>Math.round(s)));
      console.log(`scoreCache: ${allScores.length} scores, ${uniq.size} unique rounded values (1 = STILL BROKEN, >50 = healthy)`);
    }
    return true;
  }
  return false;
}

(async () => {
  for (let i = 0; i < 120; i++) {  // up to ~20 min
    let done = false;
    try { done = await tick(); } catch(e) { console.log('poll err:', e.message.split('\n')[0]); }
    if (done) break;
    await new Promise(r => setTimeout(r, 10000));
  }
  process.exit(0);
})();
