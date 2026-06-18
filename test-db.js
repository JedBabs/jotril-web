require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$connect()
    .then(() => { console.log('DB OK'); return p.$disconnect(); })
    .catch(e => { console.log('DB FAIL:', e.message); process.exit(1); });
