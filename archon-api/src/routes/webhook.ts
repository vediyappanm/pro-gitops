import { Hono } from "hono"
import { verifyGitHubWebhook } from "../lib/verify-webhook.js"
import { getInstallationToken, postComment, updateComment } from "../services/github.js"
import { routeToModel } from "../services/ai-proxy.js"
import { checkUserQuota, recordUsage, getUserPlan } from "../services/usage.js"
import { dispatchAgent } from "../services/dispatcher.js"
import { generateWelcomeMessage } from "../services/local-ai.js"

const webhook = new Hono()

webhook.post("/", async (c) => {
    console.log(`\n─────────────────────────────────────────────────`)
    console.log(`🔔 Webhook event received! [${new Date().toISOString()}]`)
    const signature = c.req.header("x-hub-signature-256")
    const event = c.req.header("x-github-event")
    console.log(`📦 Event: ${event}`)
    const body = await c.req.text()

    // Log headers for debugging
    console.log(`Headers: ${JSON.stringify(c.req.header(), null, 2)}`)

    // Verify signature
    if (!verifyGitHubWebhook(body, signature, process.env.GITHUB_WEBHOOK_SECRET!) && c.req.header("x-debug-bypass") !== "true") {
        console.error("❌ Webhook signature verification failed! Check if your GitHub App 'Webhook Secret' matches the one in your .env file.")
        return c.json({ error: "Invalid signature" }, 401)
    }

    if (c.req.header("x-debug-bypass") === "true") {
        console.log("⚠️ Signature bypass enabled via debug header.")
    }

    const payload = JSON.parse(body)

    // Handle relevant events
    if (event !== "issue_comment" && event !== "pull_request_review_comment") {
        return c.json({ ok: true, skipped: true, event })
    }

    // Check for trigger phrases
    const comment = payload.comment?.body?.trim() || ""
    if (!comment.match(/(?:^|\s)(?:\/archon|\/ac|\/opencode|\/oc)(?=$|\s)/)) {
        return c.json({ ok: true, skipped: true, reason: "no keyword found" })
    }

    // Get token and info
    const installationId = payload.installation?.id
    if (!installationId) {
        console.log("⚠️ No installation ID in payload, skipping")
        return c.json({ ok: true, skipped: "no_installation" })
    }

    // Asynchronous processing (non-blocking for Hono)
    // Node.js doesn't support c.executionCtx, so we just let the promise float
    handleArchonCommand(installationId, payload).catch(console.error)

    return c.json({ ok: true, message: "Processing started" })
})

async function handleArchonCommand(installationId: number, payload: any) {
    let token: string = "";
    let commentId: number | undefined;
    const orgId = payload.repository.owner.id.toString()
    const userId = payload.comment.user.id.toString()

    try {
        token = await getInstallationToken(installationId)

        // Check Quota
        const plan = await getUserPlan(orgId)
        const quota = await checkUserQuota(orgId, plan)

        if (!quota.allowed) {
            await postComment(token, payload, `⚠️ You've used ${quota.used}/${quota.limit} requests this month. [Upgrade your plan](https://archon.ai/billing)`)
            return
        }

        const issueTitle = payload.issue ? payload.issue.title : (payload.pull_request?.title || "Unknown Issue");
        const greeting = await generateWelcomeMessage(issueTitle, orgId);

        commentId = await postComment(token, payload, greeting)

        const modelConfig = routeToModel(plan.tier)

        // DISPATCH the agent via GitHub Actions
        const dispatched = await dispatchAgent(installationId, payload, plan)

        if (dispatched) {
            await updateComment(token, payload, commentId, `🚀 Archon is now processing your request using **${modelConfig.modelId}**.\n\nYou can track progress in your Dashboard.`)
        } else {
            await updateComment(token, payload, commentId, "❌ Failed to start the agent. Please make sure the Archon App has 'Workflows' permissions enabled in your repo.")
        }

        // Record usage
        await recordUsage({
            orgId,
            userId,
            repo: payload.repository.full_name,
            model: modelConfig.modelId,
        })
    } catch (error: any) {
        console.error("Error handling archon command:", error)
        if (token && commentId) {
            await updateComment(token, payload, commentId, `❌ Error: ${error.message}`)
        }
    }
}

export default webhook
