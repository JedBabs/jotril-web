import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let calculatePointCost;
let estimateCost;
let TIERS;

before(async () => {
    process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
    process.env.DIRECT_URL ||= 'postgresql://test:test@localhost:5432/test';

    const quota = await import('../src/lib/quota-manager.js');
    calculatePointCost = quota.calculatePointCost;
    estimateCost = quota.estimateCost;
    TIERS = quota.TIERS;
});

describe('calculatePointCost', () => {
    it('enforces the minimum cost of 10 points', () => {
        assert.equal(calculatePointCost(1), 10);
        assert.equal(calculatePointCost(2), 10);
    });

    it('scales with sentence count and caps at 200', () => {
        assert.equal(calculatePointCost(10), 30);
        assert.equal(calculatePointCost(100), 200);
        assert.equal(calculatePointCost(500), 200);
    });
});

describe('estimateCost', () => {
    it('returns sentence count and point cost for text input', () => {
        const text = [
            'This is sentence one with enough length.',
            'This is sentence two with enough length.',
            'This is sentence three with enough length.',
        ].join(' ');

        const result = estimateCost(text);

        assert.ok(result.sentenceCount >= 3);
        assert.equal(result.pointCost, calculatePointCost(result.sentenceCount));
    });
});

describe('TIERS', () => {
    it('matches the landing page free and pro point budgets', () => {
        assert.equal(TIERS.FREE.dailyPoints, 400);
        assert.equal(TIERS.PRO.dailyPoints, 2500);
    });
});
