import { createArchonClient } from "@opencode-ai/sdk/v2/client";

export async function generateWelcomeMessage(issueTitle: string, orgId: string): Promise<string> {
    const client = createArchonClient({
        baseUrl: "http://localhost:4096", // The local Archon gateway server
        throwOnError: true,
    });

    console.log("Connecting to local Archon server...");

    try {
        // Create session
        const sessionResponse = await client.session.create({
            title: `Greeting Session for org ${orgId}`,
        });
        const session = sessionResponse.data;
        if (!session) {
            throw new Error("Failed to create session");
        }

        // Fetch free models from Archon server
        const providersResponse = await client.provider.list();
        const providers = providersResponse.data;
        let selectedModel = { providerID: "opencode", modelID: "trinity-large-preview-free" };

        if (providers && providers.all) {
            const opencode = providers.all.find((p: any) => p.id === "opencode");
            if (opencode) {
                const modelIds = Object.keys(opencode.models);
                if (modelIds.length > 0) {
                    selectedModel = { providerID: "opencode", modelID: modelIds[0] };
                }
            }
        }

        console.log(`Using model ${selectedModel.modelID} from ${selectedModel.providerID}`);

        // Prompt the model
        const responseResponse = await client.session.prompt({
            sessionID: session.id,
            model: selectedModel,
            parts: [
                {
                    type: "text",
                    text: `A user just triggered Archon on this issue: "${issueTitle}". Write a very short, friendly 1-sentence acknowledgement telling them Archon is beginning to analyze their request.`,
                },
            ],
        });

        // Extract the text part from the response
        const data = responseResponse.data as any;
        if (data && data.parts) {
            const textPart = data.parts.find((p: any) => p.type === 'text');
            if (textPart && textPart.text) {
                return textPart.text;
            }
        }

        return "⏳ Archon SaaS is initializing your request...";
    } catch (e: any) {
        console.error("Local AI server failed to generate welcome message:", e.message);
        return "⏳ Archon SaaS is initializing your request..."; // Fallback mechanism
    }
}
