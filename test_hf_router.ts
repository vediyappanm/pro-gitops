
const HF_API_KEY = process.env.HF_TOKEN;

async function testHuggingFace() {
    console.log("Testing Hugging Face API Key (Router OpenAI)...");
    try {
        const modelId = "Qwen/Qwen2.5-Coder-32B-Instruct";
        const response = await fetch("https://router.huggingface.co/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: modelId,
                messages: [
                    { role: "user", content: "Hello, reply with 'Success' if you can read this." }
                ],
                max_tokens: 10,
            }),
        });

        const text = await response.text();
        console.log(`Response Check: ${response.status} - ${text.substring(0, 500)}`);

        if (response.ok) {
            const data = JSON.parse(text);
            console.log("✅ Success! HF Response:", JSON.stringify(data, null, 2));
        } else {
            console.error(`❌ API Error (${response.status}):`, text);
        }
    } catch (error) {
        console.error("❌ Network or Fetch Error:", error);
    }
}

testHuggingFace();
