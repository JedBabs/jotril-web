import 'dotenv/config';

async function verifyToken() {
    console.log("Verifying HF Token via direct API fetch...");
    const token = process.env.HF_TOKEN;
    if (!token) {
        console.error("❌ ERROR: HF_TOKEN is missing from .env");
        return;
    }

    // Check one of the known spaces
    const spaceId = "JedBabs/Jotril-Space-1";
    console.log(`Fetching metadata for ${spaceId}...`);

    try {
        const response = await fetch(`https://huggingface.co/api/spaces/${spaceId}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        console.log(`Status: ${response.status} ${response.statusText}`);

        if (response.ok) {
            const data = await response.json();
            console.log("✅ SUCCESS!");
            console.log("Space ID:", data.id);
            console.log("Runtime Info:", data.runtime?.stage || "Unknown stage");
        } else {
            const text = await response.text();
            console.error("❌ FAILED!");
            console.error(text);
        }
    } catch (e) {
        console.error("Network Fetch Error:", e.stack);
    }
}

verifyToken();
