async function run() {
    console.log("Sending request...");
    const res = await fetch("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            text: "Artificial intelligence has experienced growth in recent times. From language learning modules that are capable of generating human-like sentences, to sophisticated visual tools that can generate photorealistic art in seconds, the technological landscape is shifting rapidly. Many educators and writers are concerned about the implications of this shift, prompting the development of advanced detection engines like Jotril AI. Jotril seeks to analyze the stylistic and complexity markers of a document to determine whether a human or machine authored the text. By evaluating semantic structure and other properties across hundreds of layers, Jotril provides sentence-level clarity. This is specifically written so that there are more than 100 words. We must make sure that we reach the absolute minimum requirement of words effectively. This is just filler text to achieve that 100 word minimum. Filler text filler text filler text filler text filler text filler text filler text. Now let's just make sure this is actually 100 words. Artificial intelligence has experienced growth in recent times. From language learning modules that are capable of generating human-like sentences, to sophisticated visual tools that can generate photorealistic art in seconds...",
            hardwareFootprint: "test-device"
        })
    });

    console.log("Status:", res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (value) {
            console.log("CHUNK:", decoder.decode(value, { stream: true }));
        }
        if (done) break;
    }
}
run().catch(console.error);
