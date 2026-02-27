export interface ModelConfig {
    provider: string
    modelId: string
    apiKey: string
    maxTokens: number
    tpmLimit: number
}

const MODEL_TIERS: Record<string, ModelConfig> = {
    free: {
        provider: "opencode",
        modelId: "trinity-large-preview-free",
        apiKey: "",
        maxTokens: 8192,
        tpmLimit: 100000,
    },
    pro: {
        provider: "opencode",
        modelId: "trinity-large-preview-free",
        apiKey: "",
        maxTokens: 8192,
        tpmLimit: 100000,
    },
}

export function routeToModel(tier: string = "free"): ModelConfig {
    return MODEL_TIERS[tier] || MODEL_TIERS.free
}
