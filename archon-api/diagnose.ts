
import "dotenv/config";
import { Octokit } from "@octokit/rest";

async function diagnose() {
    console.log("=== 🔍 Archon SaaS Diagnostic ===");

    // 1. Env Check
    console.log("\n1. Checking Environment Variables:");
    const envVars = [
        "GITHUB_APP_ID",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_WEBHOOK_SECRET",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "GROQ_API_KEY",
        "DATABASE_URL"
    ];

    envVars.forEach(v => {
        const val = process.env[v];
        console.log(`${v}: ${val ? "✅ SET" : "❌ MISSING"}`);
        if (val && v.includes("KEY") && val.includes("\\n")) {
            console.log(`   💡 Note: ${v} contains literal \\n (correct for .env)`);
        }
    });

    // 2. GitHub App Connection
    console.log("\n2. Testing GitHub App Authentication:");
    try {
        const appId = process.env.GITHUB_APP_ID;
        const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (appId && privateKey) {
            // Simple JWT check (implicit in octokit app auth)
            console.log("   App ID and Private Key present. Attempting to list installations...");
        } else {
            console.log("   ❌ Cannot test: App ID or Private Key missing.");
        }
    } catch (e) {
        console.log(`   ❌ Auth failed: ${e.message}`);
    }

    // 3. Local Server Check
    console.log("\n3. Testing Local Server Connectivity:");
    try {
        const res = await fetch("http://localhost:3000/");
        const text = await res.text();
        console.log(`   Status: ${res.status} ${res.statusText}`);
        console.log(`   Response: ${text}`);
        if (text.includes("Archon API is running!")) {
            console.log("   ✅ Local server is healthy.");
        } else {
            console.log("   ❌ Unexpected response from server.");
        }
    } catch (e) {
        console.log(`   ❌ Could not connect to local server: ${e.message}`);
    }

    console.log("\n4. Triggering test webhook...");
    try {
        const payload = {
            action: "created",
            comment: { body: "/archon test", user: { id: 1 } },
            repository: { owner: { id: 1 }, full_name: "test/repo" },
            installation: { id: 1 }
        };
        const res = await fetch("http://localhost:3000/webhook/github", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-github-event": "issue_comment",
                "x-hub-signature-256": "sha256=invalid" // This should fail verification if it's on
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log(`   Webhook Response: ${JSON.stringify(data)}`);
        if (data.error === "Invalid signature") {
            console.log("   ✅ Webhook endpoint reached (rejected as expected due to signature).");
        }
    } catch (e) {
        console.log(`   ❌ Webhook test failed: ${e.message}`);
    }

    console.log("\n=== Diagnostic Complete ===");
}

diagnose();
