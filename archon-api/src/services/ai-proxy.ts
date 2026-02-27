export interface ModelConfig {
    provider: string
    modelId: string
    apiKey: string
    maxTokens: number
    tpmLimit: number
}

const MODEL_TIERS: Record<string, ModelConfig> = {
    free: {
        provider: "anthropic",
        modelId: "claude-3-5-sonnet-20241022",
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        maxTokens: 8192,
        tpmLimit: 100000,
    },
    pro: {
        provider: "anthropic",
        modelId: "claude-3-5-sonnet-20241022",
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        maxTokens: 8192,
        tpmLimit: 100000,
    },
}

export function routeToModel(tier: string = "free"): ModelConfig {
    return MODEL_TIERS[tier] || MODEL_TIERS.free
}
