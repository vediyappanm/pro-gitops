import { createArchonClient } from "./packages/sdk/js/src/v2/client";

async function test() {
    console.log("Testing Archon SDK connection to local server...");

    try {
        const client = createArchonClient({
            baseUrl: "http://localhost:4096",
            throwOnError: true,
        });

        console.log("Listing models...");
        const providersResponse = await client.provider.list();
        const providers = providersResponse.data;
        let selectedModel = { providerID: "opencode", modelID: "small" };

        if (providers && providers.all) {
            const opencode = providers.all.find(p => p.id === "opencode");
            if (opencode) {
                const modelIds = Object.keys(opencode.models);
                console.log("Opencode models:", modelIds);
                if (modelIds.length > 0) {
                    selectedModel = { providerID: "opencode", modelID: modelIds[0]! };
                    console.log(`Selected model: ${selectedModel.providerID}/${selectedModel.modelID}`);
                }
            } else {
                console.log("Opencode provider NOT found in connected providers");
                console.log("Connected ids:", providers.connected);
                console.log("All ids:", providers.all.map(p => p.id));
            }
        }


        console.log("Creating session...");
        const sessionResponse = await client.session.create({
            title: "SDK Test Session",
        });
        const session = sessionResponse.data;
        if (!session) {
            throw new Error("Failed to create session");
        }
        console.log("Session created:", session.id);

        console.log(`Sending prompt to ${selectedModel.providerID}/${selectedModel.modelID}...`);
        // The prompt method might be on the session or client depending on the SDK structure
        // Looking at the provided example in the user request: client.prompt
        // However, looking at the SDK code might be better.
        // Based on createArchonClient in client.ts, it returns an ArchonClient instance.

        // Let's try to get a response. 
        // Note: The user example used `client.prompt`, but I should check if it's actually `client.session.prompt` or similar.
        // I'll use a simple fetch-like approach if the SDK is strictly typed and I'm unsure, 
        // but I'll try to follow the SDK's methods.

        const response = await client.session.prompt({
            sessionID: session.id,
            model: selectedModel,
            parts: [
                {
                    type: "text",
                    text: "Explain what is Archon in one sentence.",
                },
            ],
        });

        console.log("\n--- Response ---");
        console.log(JSON.stringify(response, null, 2));
        console.log("----------------\n");

        console.log("Test completed successfully!");
    } catch (error) {
        console.error("Test failed:", error);
    }
}

test();
