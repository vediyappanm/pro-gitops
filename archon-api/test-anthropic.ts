const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "<YOUR_ANTHROPIC_API_KEY>",
        "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }]
    })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
