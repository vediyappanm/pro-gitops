import { Hono } from "hono"
import { handleGitHubCallback } from "../services/auth.js"

const auth = new Hono()

auth.get("/github", (c) => {
    const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email`
    return c.redirect(url)
})

auth.get("/github/callback", async (c) => {
    const code = c.req.query("code")
    if (!code) return c.json({ error: "Missing code" }, 400)

    try {
        const token = await handleGitHubCallback(code)
        // Redirect to frontend with token
        return c.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/callback?token=${token}`)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

export default auth
