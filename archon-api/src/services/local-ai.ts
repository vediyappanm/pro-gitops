import { createArchonClient } from "@opencode-ai/sdk/v2/client";

export async function generateWelcomeMessage(issueTitle: string, orgId: string): Promise<string> {
    // We avoid calling the local AI server (localhost:4096) as requested ("don't use local").
    // We return a high-quality, professional acknowledgement message.
    return `🚀 **Archon** is beginning to analyze your request: "${issueTitle}".

I will review the context, investigate the codebase, and provide a detailed analysis or fix shortly.

You can track my progress in your Dashboard.`;
}
