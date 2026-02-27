export interface ModelConfig {
    provider: string
    modelId: string
    apiKey: string
    maxTokens: number
    tpmLimit: number
}

const MODEL_TIERS: Record<string, ModelConfig> = {
    free: {
        provider: "groq",
        modelId: "llama-3.3-70b-versatile",
        apiKey: process.env.GROQ_API_KEY || "",
        maxTokens: 8192,
        tpmLimit: 100000,
    },
    pro: {
        provider: "groq",
        modelId: "llama-3.3-70b-versatile",
        apiKey: process.env.GROQ_API_KEY || "",
        maxTokens: 8192,
        tpmLimit: 100000,
    },
}

export function routeToModel(tier: string = "free"): ModelConfig {
    return MODEL_TIERS[tier] || MODEL_TIERS.free
}
