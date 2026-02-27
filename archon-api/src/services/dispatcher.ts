import { Octokit } from "@octokit/rest"
import { getInstallationToken } from "./github.js"

export async function dispatchAgent(installationId: number, payload: any, plan: any) {
  const token = await getInstallationToken(installationId)
  const octokit = new Octokit({ auth: token })

  const { owner, name: repo } = payload.repository
  const issue_number = payload.issue ? payload.issue.number : payload.pull_request.number
  const comment_id = payload.comment.id

  const model = plan.tier === 'pro' ? 'anthropic/claude-3-5-sonnet' : 'groq/llama-3.3-70b-versatile'
  const workflowPath = '.github/workflows/archon-managed.yml'

  try {
    // 1. Check if workflow exists
    try {
      await octokit.repos.getContent({ owner: owner.login, repo, path: workflowPath })
    } catch (e) {
      console.log("Infecting managed workflow into repo...")
      // 2. Inject the workflow if missing
      const workflowContent = `name: archon-managed
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number'
        required: true
      comment_id:
        description: 'Comment ID'
        required: true
      model:
        description: 'AI Model'
        required: true
      archon_token:
        description: 'SaaS Token'
        required: true

jobs:
  archon:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Archon Agent
        uses: vediyappanm/pro-gitops/github@main
        env:
          GITHUB_TOKEN: \${{ github.token }}
          ARCHON_SaaS_TOKEN: \${{ github.event.inputs.archon_token }}
          ISSUE_NUMBER: \${{ github.event.inputs.issue_number }}
        with:
          model: \${{ github.event.inputs.model }}

      - name: Self Cleanup
        if: always()
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: |
          git config --global user.name "archon-pro[bot]"
          git config --global user.email "archon-pro[bot]@users.noreply.github.com"
          git remote set-url origin https://x-access-token:\${{ github.token }}@github.com/\${{ github.repository }}
          rm -f .github/workflows/archon-managed.yml
          git add .github/workflows/archon-managed.yml
          git diff --cached --quiet || git commit -m "chore: cleanup temporary archon runner [skip ci]"
          git push origin \${{ github.ref_name }}
`;
      await octokit.repos.createOrUpdateFileContents({
        owner: owner.login,
        repo,
        path: workflowPath,
        message: "chore: add archon managed workflow",
        content: Buffer.from(workflowContent).toString('base64'),
      })
      // Wait a sec for GitHub to register the new workflow
      await new Promise(r => setTimeout(r, 2000))
    }

    // 3. Trigger the workflow
    await octokit.actions.createWorkflowDispatch({
      owner: owner.login,
      repo,
      workflow_id: 'archon-managed.yml',
      ref: payload.repository.default_branch,
      inputs: {
        issue_number: issue_number.toString(),
        comment_id: comment_id.toString(),
        model: model,
        archon_token: Buffer.from(JSON.stringify({ orgId: owner.id })).toString('base64')
      }
    })
    return true
  } catch (error: any) {
    console.error("Failed to dispatch agent:", error.message)
    return false
  }
}
