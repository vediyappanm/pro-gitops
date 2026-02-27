import { Hono } from "hono"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { organizations, usageRecords, users } from "../db/schema.js"
import { eq, desc } from "drizzle-orm"

type Variables = {
    userId: string
}

const dashboard = new Hono<{ Variables: Variables }>()

// Middleware to check auth
dashboard.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401)
    }

    const token = authHeader.split(" ")[1]
    const payload = verifyToken(token)
    if (!payload) {
        return c.json({ error: "Invalid token" }, 401)
    }

    c.set("userId", payload.userId)
    await next()
})

dashboard.get("/stats", async (c) => {
    const userId = c.get("userId") as string

    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })

    if (!user) return c.json({ error: "User not found" }, 404)

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId!),
    })

    const usage = await db.query.usageRecords.findMany({
        where: eq(usageRecords.orgId, user.orgId!),
        orderBy: [desc(usageRecords.createdAt)],
        limit: 10,
    })

    return c.json({
        org,
        usage,
    })
})

export default dashboard
