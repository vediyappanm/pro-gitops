
const HF_API_KEY = process.env.HF_TOKEN;

async function testHuggingFace() {
    console.log("Testing Hugging Face API Key...");
    try {
        const modelId = "Qwen/Qwen2.5-Coder-32B-Instruct";
        const response = await fetch(`https://api-inference.huggingface.co/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: "user", content: "Hello, reply with 'Success' if you can read this." }],
                max_tokens: 10,
            }),
        });

        const data = await response.json();
        if (response.ok) {
            console.log("✅ Success! Hugging Face response:", JSON.stringify(data, null, 2));
        } else {
            console.error(`❌ API Error (${response.status}):`, JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("❌ Network or Fetch Error:", error);
    }
}

testHuggingFace();
