import { db } from "../db/client.js"
import { usageRecords, organizations } from "../db/schema.js"
import { eq, and, gt, sql } from "drizzle-orm"
import { PLANS, type Plan } from "../config/plans.js"

export async function checkUserQuota(orgId: string, plan: Plan) {
    if (plan.monthlyRequests === -1) return { allowed: true, used: 0, limit: -1 }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(usageRecords)
        .where(
            and(
                eq(usageRecords.orgId, orgId),
                gt(usageRecords.createdAt, startOfMonth)
            )
        )

    const used = result[0]?.count || 0
    return {
        allowed: used < plan.monthlyRequests,
        used,
        limit: plan.monthlyRequests,
    }
}

export async function recordUsage(data: {
    orgId: string
    userId: string
    repo: string
    model: string
    inputTokens?: number
    outputTokens?: number
}) {
    await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        orgId: data.orgId,
        userId: data.userId,
        repo: data.repo,
        model: data.model,
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
    })
}

export async function getUserPlan(orgId: string): Promise<Plan> {
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
    })

    return PLANS[org?.plan || "free"] || PLANS.free
}
