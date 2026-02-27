import { Octokit } from "@octokit/rest"
import { getInstallationToken } from "./github.js"

export async function dispatchAgent(installationId: number, payload: any, plan: any) {
  const token = await getInstallationToken(installationId)
  const octokit = new Octokit({ auth: token })

  const { owner, name: repo } = payload.repository
  const issue_number = payload.issue ? payload.issue.number : payload.pull_request?.number
  const comment_id = payload.comment?.id

  const model = plan.tier === 'pro' ? 'anthropic/claude-3-5-sonnet' : 'groq/llama-3.1-8b-instant'
  const workflowPath = '.github/workflows/archon-managed.yml'

  // The workflow content injected into the target repo.
  // KEY: Uses ${TOKEN} bash variable (not ${{ github.token }} expression) inside git remote set-url
  // to avoid shell-escaping issues. TOKEN is passed as an env var to the step.
  const workflowContent = `name: archon-managed
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number'
        required: true
      comment_id:
        description: 'Comment ID'
        required: false
      model:
        description: 'AI Model'
        required: true
      archon_token:
        description: 'SaaS Token'
        required: false
      groq_api_key:
        description: 'Groq API Key for AI model access'
        required: false

jobs:
  archon:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
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
          GROQ_API_KEY: \${{ github.event.inputs.groq_api_key }}
        with:
          model: \${{ github.event.inputs.model }}

      - name: Self Cleanup
        if: always()
        env:
          GH_TOKEN: \${{ github.token }}
          REPO: \${{ github.repository }}
        run: |
          echo "Deleting archon-managed.yml via GitHub API..."
          FILE_PATH=".github/workflows/archon-managed.yml"
          SHA=$(curl -s \
            -H "Authorization: token \${GH_TOKEN}" \
            -H "Accept: application/vnd.github+json" \
            "https://api.github.com/repos/\${REPO}/contents/\${FILE_PATH}" | \
            python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sha',''))" 2>/dev/null || echo "")
          if [ -n "\${SHA}" ]; then
            curl -s -X DELETE \
              -H "Authorization: token \${GH_TOKEN}" \
              -H "Accept: application/vnd.github+json" \
              -H "Content-Type: application/json" \
              "https://api.github.com/repos/\${REPO}/contents/\${FILE_PATH}" \
              -d "{\"message\":\"chore: cleanup archon managed workflow [skip ci]\",\"sha\":\"\${SHA}\"}" \
              | python3 -c "import sys,json; d=json.load(sys.stdin); print('Deleted:', d.get('commit',{}).get('sha','unknown'))" \
              || echo "Warning: API delete failed, will retry on next run"
            echo "Cleanup complete."
          else
            echo "File already deleted or not found, skipping."
          fi
`

  try {
    // Always force-delete and re-inject so we NEVER reuse a stale/broken workflow file
    try {
      const existing = await octokit.repos.getContent({ owner: owner.login, repo, path: workflowPath })
      const existingSha = (existing.data as any).sha
      console.log("Existing workflow found, deleting to re-inject fresh version...")
      await octokit.repos.deleteFile({
        owner: owner.login,
        repo,
        path: workflowPath,
        message: "chore: refresh archon managed workflow",
        sha: existingSha,
      })
      await new Promise(r => setTimeout(r, 1500))
    } catch (e: any) {
      if (e.status !== 404) {
        console.log("Note: Could not delete existing workflow:", e.message)
      }
    }

    console.log("Injecting fresh managed workflow into repo...")
    await octokit.repos.createOrUpdateFileContents({
      owner: owner.login,
      repo,
      path: workflowPath,
      message: "chore: add archon managed workflow",
      content: Buffer.from(workflowContent).toString('base64'),
    })

    // Wait for GitHub to register the new workflow file
    await new Promise(r => setTimeout(r, 3000))

    // Trigger the workflow via workflow_dispatch
    console.log(`Triggering archon-managed.yml on ${owner.login}/${repo}...`)
    await octokit.actions.createWorkflowDispatch({
      owner: owner.login,
      repo,
      workflow_id: 'archon-managed.yml',
      ref: payload.repository.default_branch,
      inputs: {
        issue_number: (issue_number ?? '').toString(),
        comment_id: (comment_id ?? '').toString(),
        model: model,
        groq_api_key: process.env.GROQ_API_KEY || '',
        archon_token: Buffer.from(JSON.stringify({ orgId: owner.id })).toString('base64')
      }
    })
    console.log("✅ Agent dispatched successfully!")
    return true
  } catch (error: any) {
    console.error("Failed to dispatch agent:", error.message)
    return false
  }
}
