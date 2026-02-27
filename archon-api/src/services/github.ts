import { Octokit } from "@octokit/rest"
import { createAppAuth } from "@octokit/auth-app"

/**
 * Gets an installation-specific access token for the GitHub App.
 */
export async function getInstallationToken(installationId: number) {
    const auth = createAppAuth({
        appId: process.env.GITHUB_APP_ID as string,
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY as string,
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    })

    const installationAuthentication = await auth({
        type: "installation",
        installationId,
    })

    return installationAuthentication.token
}

/**
 * Posts a comment to an issue or pull request.
 */
export async function postComment(token: string, payload: any, body: string) {
    const octokit = new Octokit({ auth: token })
    const { owner, name: repo } = payload.repository
    const issue_number = payload.issue ? payload.issue.number : payload.pull_request.number

    const { data } = await octokit.issues.createComment({
        owner: owner.login,
        repo,
        issue_number,
        body,
    })

    return data.id
}

/**
 * Updates an existing comment.
 */
export async function updateComment(token: string, payload: any, commentId: number, body: string) {
    const octokit = new Octokit({ auth: token })
    const { owner, name: repo } = payload.repository

    await octokit.issues.updateComment({
        owner: owner.login,
        repo,
        comment_id: commentId,
        body,
    })
}
