import { useState, useEffect } from 'react';

// Pricing Tiers based on Purchasing Power Parity (PPP)
const PPP_TIERS = {
    // Top Tier (Default)
    DEFAULT: { price: 19, currency: "$", label: "" },

    // Tier 2 (Approx ~40-50% off)
    TIER_2: { price: 9, currency: "$", label: "Local Pricing Applied" },

    // Tier 3 (Africa, parts of LATAM, parts of SEA ~60% off)
    TIER_3: { price: 7, currency: "$", label: "Local Pricing Applied" },

    // India (High volume, highly price sensitive ~75% off)
    INDIA: { price: 5, currency: "$", label: "India Region Pricing Applied" },

    // Nigeria (Highly price sensitive, local currency ~ ₦5,000)
    NIGERIA: { price: "5,000", currency: "₦", label: "Nigeria Region Pricing Applied" }
};

const TIER_2_COUNTRIES = ['PL', 'RO', 'HU', 'CZ', 'SK', 'TR', 'ID', 'PH', 'VN', 'TH', 'RS', 'BG', 'HR', 'MY'];
const TIER_3_COUNTRIES = ['BR', 'AR', 'CO', 'MX', 'ZA', 'KE', 'EG', 'CL', 'PE'];
const INDIA_COUNTRIES = ['IN', 'PK', 'BD', 'LK'];
const NIGERIA_COUNTRIES = ['NG'];

export function usePPP() {
    const [premiumPricing, setPremiumPricing] = useState(PPP_TIERS.DEFAULT);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        // Use geojs for IP-based country detection purely on the client side
        fetch('https://get.geojs.io/v1/ip/country.json')
            .then(res => res.json())
            .then(data => {
                if (!mounted) return;

                const cc = data.country;
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
            .catch((err) => {
                console.warn("[PPP] Failed to fetch geolocation, falling back to default styling", err);
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => { mounted = false; };
    }, []);

    return { premiumPricing, loading };
}
