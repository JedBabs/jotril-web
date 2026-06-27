import { useState, useEffect } from 'react';
import { getJSON } from '@/lib/resilient-fetch';

// Pricing Tiers based on Purchasing Power Parity (PPP)
const PPP_TIERS = {
    // Top Tier (Default)
    DEFAULT: { price: 19, currency: "$", label: "" },

    // Tier 2 (Approx ~40-50% off)
    TIER_2: { price: 9, currency: "$", label: "" },

    // Tier 3 (Africa, parts of LATAM, parts of SEA ~60% off)
    TIER_3: { price: 7, currency: "$", label: "" },

    // India (High volume, highly price sensitive ~75% off)
    INDIA: { price: 5, currency: "$", label: "" },

    // Nigeria (Highly price sensitive, local currency ~ ₦5,000)
    NIGERIA: { price: "5,000", currency: "₦", label: "" }
};

const TIER_2_COUNTRIES = ['PL', 'RO', 'HU', 'CZ', 'SK', 'TR', 'ID', 'PH', 'VN', 'TH', 'RS', 'BG', 'HR', 'MY'];
const TIER_3_COUNTRIES = ['BR', 'AR', 'CO', 'MX', 'ZA', 'KE', 'EG', 'CL', 'PE'];
const INDIA_COUNTRIES = ['IN', 'PK', 'BD', 'LK'];
const NIGERIA_COUNTRIES = ['NG'];

export function usePPP() {
    const [premiumPricing, setPremiumPricing] = useState(PPP_TIERS.DEFAULT);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const ctrl = new AbortController();

        // External geo lookup — short timeout + retry, so a flaky link doesn't
        // hang the price tier indefinitely. On exhaustion we silently fall
        // through to DEFAULT pricing (safer than blocking the UI).
        getJSON('https://get.geojs.io/v1/ip/country.json', {
            signal: ctrl.signal,
            timeoutMs: 6000,
            retries: 2,
        })
            .then(data => {
                if (ctrl.signal.aborted) return;
                const cc = data?.country;
                if (INDIA_COUNTRIES.includes(cc)) {
                    setPremiumPricing(PPP_TIERS.INDIA);
                } else if (NIGERIA_COUNTRIES.includes(cc)) {
                    setPremiumPricing(PPP_TIERS.NIGERIA);
                } else if (TIER_3_COUNTRIES.includes(cc)) {
                    setPremiumPricing(PPP_TIERS.TIER_3);
                } else if (TIER_2_COUNTRIES.includes(cc)) {
                    setPremiumPricing(PPP_TIERS.TIER_2);
                } else {
                    setPremiumPricing(PPP_TIERS.DEFAULT);
                }
            })
            .catch(() => {
                if (!ctrl.signal.aborted) {
                    console.warn("[PPP] Failed to fetch geolocation, falling back to default pricing");
                }
            })
            .finally(() => {
                if (!ctrl.signal.aborted) setLoading(false);
            });

        return () => ctrl.abort();
    }, []);

    return { premiumPricing, loading };
}
