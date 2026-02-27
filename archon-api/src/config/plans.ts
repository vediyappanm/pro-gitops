export interface Plan {
    id: string
    name: string
    tier: string
    monthlyRequests: number
    maxTokensPerRequest: number
    privateRepos: boolean
    priceMonthly: number
    stripePriceId: string | null
}

export const PLANS: Record<string, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tier: "free",
        monthlyRequests: 50,
        maxTokensPerRequest: 2048,
        privateRepos: false,
        priceMonthly: 0,
        stripePriceId: null,
    },
    pro: {
        id: "pro",
        name: "Pro",
        tier: "pro",
        monthlyRequests: 500,
        maxTokensPerRequest: 8192,
        privateRepos: true,
        priceMonthly: 1900,
        stripePriceId: process.env.STRIPE_PRICE_PRO || null,
    },
    team: {
        id: "team",
        name: "Team",
        tier: "pro",
        monthlyRequests: 2000,
        maxTokensPerRequest: 8192,
        privateRepos: true,
        priceMonthly: 4900,
        stripePriceId: process.env.STRIPE_PRICE_TEAM || null,
    },
}
