// Direct grid search runner - bypasses Next.js entirely
// Uses Node.js --loader to resolve extensionless imports

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Custom loader to resolve extensionless .js imports and path aliases
register('data:text/javascript,' + encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    // Handle @/ alias
    if (specifier.startsWith('@/')) {
      const resolved = new URL('./src/' + specifier.slice(2), '${pathToFileURL(process.cwd() + '/').href}').href;
      return nextResolve(resolved.endsWith('.js') ? resolved : resolved + '.js', context);
    }
    // Handle relative imports without .js extension
    if (specifier.startsWith('./') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
      return nextResolve(specifier + '.js', context);
    }
    return nextResolve(specifier, context);
  }
`));

const { PrismaClient } = await import('@prisma/client');
const { runExhaustiveSearch, evaluateConfig } = await import('./src/lib/auto-tuner.js');

const prisma = new PrismaClient();

async function main() {
    const dataset = await prisma.tuningDataset.findFirst();
    if (!dataset?.scoreCache) {
        console.log('No dataset or score cache!');
        return;
    }

    console.log(`Dataset: ${dataset.name} (${dataset.sampleCount} samples)`);
    console.log(`Cache: ${dataset.scoreCache.length} docs`);
    console.log(`Starting grid search...`);
    console.log('');

    const start = Date.now();
    const deadline = start + 270000; // 4.5 min

    const result = await runExhaustiveSearch(dataset.scoreCache, (progress, status, trials) => {
        process.stdout.write(`\r  [${String(progress).padStart(3)}%] ${status} (${trials} trials)`);
    }, deadline);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\n=== GRID SEARCH COMPLETE (${elapsed}s) ===`);
    console.log(`Total trials: ${result.trialCount}`);
    console.log(`Best MCC: ${result.bestMetrics.mcc}`);
    console.log(`Best Accuracy: ${result.bestMetrics.accuracy}%`);
    console.log(`Best F1: ${result.bestMetrics.f1}`);
    console.log(`\nTop 5 trials:`);
    result.topTrials.slice(0, 5).forEach((t, i) => {
        console.log(`  #${i + 1} MCC: ${t.mcc} | Accuracy: ${t.accuracy}%`);
    });

    // Save result to DB
    const run = await prisma.tuningRun.create({
        data: {
            datasetId: dataset.id,
            status: 'COMPLETE',
            progress: 100,
            bestConfig: result.bestConfig,
            bestAccuracy: result.bestMetrics.accuracy,
            bestMcc: result.bestMetrics.mcc,
            metrics: result.bestMetrics,
            trialCount: result.trialCount,
            log: result.topTrials,
            completedAt: new Date(),
            message: `✅ ${result.trialCount} trials | MCC: ${result.bestMetrics.mcc} | Acc: ${result.bestMetrics.accuracy}%`
        }
    });
    console.log(`\nSaved to DB as run: ${run.id}`);
}

main()
    .catch(e => console.error('FATAL:', e))
    .finally(() => prisma.$disconnect());
