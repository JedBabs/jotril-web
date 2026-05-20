const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const runs = await prisma.tuningRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3
    });

    for (const run of runs) {
        console.log(`ID: ${run.id} | Status: ${run.status} | Progress: ${run.progress}% | Trials: ${run.trialCount} | Msg: ${run.message?.substring(0, 80)} | Err: ${run.error?.substring(0, 60) || 'none'}`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
