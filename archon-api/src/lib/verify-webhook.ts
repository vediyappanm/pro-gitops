import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyGitHubWebhook(
    payload: string,
    signature: string | undefined,
    secret: string
): boolean {
    if (!signature) return false

    const hmac = createHmac("sha256", secret)
    hmac.update(payload)
    const expected = `sha256=${hmac.digest("hex")}`

    if (expected.length !== signature.length) return false
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
