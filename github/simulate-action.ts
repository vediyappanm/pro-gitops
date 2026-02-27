import { $ } from "bun";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Simulations script to verify tool access and agentic behavior in the GitHub Action component.
 */

async function runSimulation() {
    console.log("🚀 Starting GitHub Action Simulation...");

    // 1. Create a dummy event payload
    const mockEvent = {
        eventName: "workflow_dispatch",
        payload: {
            issue: {
                number: 1,
                title: "Test Issue",
                body: "Test body"
            },
            comment: {
                id: 12345,
                databaseId: 12345,
                body: "/archon list the files in the current directory"
            },
            repository: {
                owner: { id: "test-owner", login: "test-user" },
                name: "test-repo",
                full_name: "test-user/test-repo",
                private: false,
                default_branch: "main"
            }
        },
        repo: { owner: "test-user", repo: "test-repo" }
    };

    const tempDir = path.join(import.meta.dir, "temp_sim");
    await $`rm -rf ${tempDir}`;
    await mkdir(tempDir, { recursive: true });

    // 2. Setup environment variables for the simulation
    // We point to a real archon binary if possible, or we mock it.
    // Since we want to check if tools are loaded, we should let it run.

    process.env.MOCK_EVENT = JSON.stringify(mockEvent);
    process.env.MOCK_TOKEN = "dummy-token";
    process.env.MODEL = "groq/llama-3.1-8b-instant";
    process.env.GITHUB_RUN_ID = "12345678";
    process.env.GITHUB_WORKSPACE = tempDir;
    process.env.ENABLE_TOOLS = "true";
    process.env.TOKEN = "dummy-github-token";

    console.log("📦 Environment configured. Running index.ts...");

    try {
        // We run the index.ts. Note: This will try to spawn 'archon' binary.
        // It will also try to reach api.archon.ai for token exchange if TOKEN is not set correctly (but we set it).

        // We'll use Bun to run the index.ts script
        const proc = Bun.spawn(["bun", "run", "index.ts"], {
            cwd: path.join(import.meta.dir),
            stdout: "pipe",
            stderr: "inherit",
            env: process.env
        });

        // We capture the output to verify if 'archon serve' started and if tools are being registered
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            process.stdout.write(text); // Mirror to console

            if (text.includes("archon session")) {
                console.log("\n✅ Detected archon session creation!");
            }
            if (text.includes("| List") || text.includes("| Bash") || text.includes("| Grep")) {
                console.log("\n✅ Detected Tool Usage!");
            }
        }

        console.log("\n✅ Simulation completed.");
    } catch (error) {
        console.error("\n❌ Simulation failed:", error);
    } finally {
        // Cleanup is handled by the process exit usually, but we should kill the archon process if it's still running
        // The index.ts script has a finally block that closes the server.
    }
}

runSimulation();
