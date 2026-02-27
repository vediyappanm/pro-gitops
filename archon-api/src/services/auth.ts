import jwt from "jsonwebtoken"
import { Octokit } from "@octokit/rest"
import { db } from "../db/client.js"
import { users, organizations } from "../db/schema.js"
import { eq } from "drizzle-orm"

const JWT_SECRET = process.env.JWT_SECRET || "supersecret"

export function createToken(userId: string) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" })
}

export function verifyToken(token: string) {
    try {
        return jwt.verify(token, JWT_SECRET) as { userId: string }
    } catch {
        return null
    }
}

export async function handleGitHubCallback(code: string) {
    try {
        // 1. Exchange code for access token
        const response = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            }),
        })

        const authData = await response.json() as any
        const access_token = authData.access_token

        if (!access_token) {
            throw new Error(`GitHub Auth failed: ${JSON.stringify(authData)}`)
        }

        // 2. Get user info
        const octokit = new Octokit({ auth: access_token })
        const { data: user } = await octokit.users.getAuthenticated()
        const userId = user.id.toString()

        // 3. Upsert User/Org in DB
        const existingUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1)

        if (existingUsers.length === 0) {
            // Check Org
            const existingOrgs = await db.select().from(organizations).where(eq(organizations.id, userId)).limit(1)

            if (existingOrgs.length === 0) {
                await db.insert(organizations).values({
                    id: userId,
                    githubLogin: user.login,
                    plan: "free",
                })
            }

            await db.insert(users).values({
                id: userId,
                githubLogin: user.login,
                email: user.email,
                orgId: userId,
                role: "owner",
            })
        }

        return createToken(userId)
    } catch (error: any) {
        console.error("CRITICAL AUTH ERROR:", error)
        throw error
    }
}
