import { $ } from "bun"
import path from "node:path"
import { Octokit } from "@octokit/rest"
import { graphql } from "@octokit/graphql"
import * as core from "@actions/core"
import * as github from "@actions/github"
import type { Context as GitHubContext } from "@actions/github/lib/context"
import type { IssueCommentEvent, PullRequestReviewCommentEvent } from "@octokit/webhooks-types"
import { createArchonClient } from "@opencode-ai/sdk"
import { spawn } from "node:child_process"
import process from "node:process"

if (process.env.GITHUB_WORKSPACE) {
  process.chdir(process.env.GITHUB_WORKSPACE)
}

if (!process.env.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX) {
  process.env.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = "512"
}

// Reduce tool/system prompt overhead for constrained models
if (!process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS) {
  process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS = "true"
}
if (!process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS) {
  process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = "true"
}

function truncate(text: string | null | undefined, maxLen = 500): string {
  if (!text) return ""
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + "… [truncated]"
}

type GitHubAuthor = {
  login: string
  name?: string
}

type GitHubComment = {
  id: string
  databaseId: string
  body: string
  author: GitHubAuthor
  createdAt: string
}

type GitHubReviewComment = GitHubComment & {
  path: string
  line: number | null
}

type GitHubCommit = {
  oid: string
  message: string
  author: {
    name: string
    email: string
  }
}

type GitHubFile = {
  path: string
  additions: number
  deletions: number
  changeType: string
}

type GitHubReview = {
  id: string
  databaseId: string
  author: GitHubAuthor
  body: string
  state: string
  submittedAt: string
  comments: {
    nodes: GitHubReviewComment[]
  }
}

type GitHubPullRequest = {
  title: string
  body: string
  author: GitHubAuthor
  baseRefName: string
  headRefName: string
  headRefOid: string
  createdAt: string
  additions: number
  deletions: number
  state: string
  baseRepository: {
    nameWithOwner: string
  }
  headRepository: {
    nameWithOwner: string
  }
  commits: {
    totalCount: number
    nodes: Array<{
      commit: GitHubCommit
    }>
  }
  files: {
    nodes: GitHubFile[]
  }
  comments: {
    nodes: GitHubComment[]
  }
  reviews: {
    nodes: GitHubReview[]
  }
}

type GitHubIssue = {
  title: string
  body: string
  author: GitHubAuthor
  createdAt: string
  state: string
  comments: {
    nodes: GitHubComment[]
  }
}

type PullRequestQueryResponse = {
  repository: {
    pullRequest: GitHubPullRequest
  }
}

type IssueQueryResponse = {
  repository: {
    issue: GitHubIssue
  }
}

const { client, server } = createArchon()
let accessToken: string
let octoRest: Octokit
let octoGraph: typeof graphql
let commentId: number
let gitConfig: string
let session: { id: string; title: string; version: string }
let shareId: string | undefined
let exitCode = 0
type PromptFiles = Awaited<ReturnType<typeof getUserPrompt>>["promptFiles"]

try {
  assertContextEvent("issue_comment", "pull_request_review_comment", "workflow_dispatch")
  assertPayloadKeyword()
  await assertArchonConnected()

  accessToken = await getAccessToken()
  octoRest = new Octokit({ auth: accessToken })
  octoGraph = graphql.defaults({
    headers: { authorization: `token ${accessToken}` },
  })

  const { userPrompt, promptFiles } = await getUserPrompt()
  await configureGit(accessToken)
  await assertPermissions()

  const comment = await createComment()
  commentId = comment.data.id

  // Setup opencode session
  const repoData = await fetchRepo()
  session = await client.session.create<true>().then((r) => r.data)
  await subscribeSessionEvents()
  shareId = await (async () => {
    if (useEnvShare() === false) return
    if (!useEnvShare() && repoData.data.private) return
    await client.session.share<true>({ path: { id: session.id } })
    return session.id.slice(-8)
  })()
  console.log("archon session", session.id)
  if (shareId) {
    console.log("Share link:", `${useShareUrl()}/s/${shareId}`)
  }

  // Handle 3 cases
  // 1. Issue
  // 2. Local PR
  // 3. Fork PR

  // For workflow_dispatch (SaaS-triggered), use direct LLM API to avoid
  // archon server's ~13k token system prompt overwhelming Groq free tier limits.
  const useDirectApi = useContext().eventName === "workflow_dispatch"

  if (isPullRequest()) {
    const prData = await fetchPR()
    // Local PR
    if (prData.headRepository.nameWithOwner === prData.baseRepository.nameWithOwner) {
      await checkoutLocalBranch(prData)
      const dataPrompt = buildPromptDataForPR(prData)
      const response = useDirectApi
        ? await chatDirect(`${userPrompt}\n\n${dataPrompt}`)
        : await chat(`${userPrompt}\n\n${dataPrompt}`, promptFiles)
      if (await branchIsDirty()) {
        const summary = await summarize(response)
        await pushToLocalBranch(summary)
      }
      const hasShared = prData.comments.nodes.some((c: GitHubComment) => c.body.includes(`${useShareUrl()}/s/${shareId}`))
      await updateComment(`${response}${footer({ image: !hasShared })}`)
    }
    // Fork PR
    else {
      await checkoutForkBranch(prData)
      const dataPrompt = buildPromptDataForPR(prData)
      const response = useDirectApi
        ? await chatDirect(`${userPrompt}\n\n${dataPrompt}`)
        : await chat(`${userPrompt}\n\n${dataPrompt}`, promptFiles)
      if (await branchIsDirty()) {
        const summary = await summarize(response)
        await pushToForkBranch(summary, prData)
      }
      const hasShared = prData.comments.nodes.some((c: GitHubComment) => c.body.includes(`${useShareUrl()}/s/${shareId}`))
      await updateComment(`${response}${footer({ image: !hasShared })}`)
    }
  }
  // Issue
  else {
    const branch = await checkoutNewBranch()
    const issueData = await fetchIssue()
    const dataPrompt = buildPromptDataForIssue(issueData)
    let response: string

    if (useDirectApi) {
      response = await chatDirect(`${userPrompt}\n\n${dataPrompt}`)
      // Lite Writer Logic: Parse "FILE: x" blocks and write them
      const fileMatches = response.matchAll(/FILE:\s*([^\n]+)\s*\r?\n\s*```[^\n]*\n([\s\S]*?)```/g)
      let filesWritten = 0
      for (const match of fileMatches) {
        const filePath = match[1].trim()
        const content = match[2]
        console.log(`[LiteWriter] Writing to ${filePath}...`)
        await $`mkdir -p $(dirname ${filePath})`
        await Bun.write(filePath, content)
        filesWritten++
      }
      if (filesWritten > 0) {
        console.log(`[LiteWriter] Successfully wrote ${filesWritten} files.`)
      }
    } else {
      response = await chat(`${userPrompt}\n\n${dataPrompt}`, promptFiles)
    }

    if (await branchIsDirty()) {
      const summary = await summarize(response)
      await pushToNewBranch(summary, branch)
      const pr = await createPR(
        repoData.data.default_branch,
        branch,
        summary,
        `${response}\n\nCloses #${useIssueId()}${footer({ image: true })}`,
      )
      await updateComment(`Created PR #${pr}${footer({ image: true })}`)
    } else {
      await updateComment(`${response}${footer({ image: true })}`)
    }
  }
} catch (e: any) {
  exitCode = 1
  console.error(e)
  let msg = e
  if (e instanceof $.ShellError) {
    msg = e.stderr.toString()
  } else if (e instanceof Error) {
    msg = e.message
  }
  await updateComment(`${msg}${footer()}`)
  core.setFailed(msg)
  // Also output the clean error message for the action to capture
  //core.setOutput("prepare_error", e.message);
} finally {
  server.close()
  await restoreGitConfig()
  await revokeAppToken()
}
process.exit(exitCode)

function createArchon() {
  const host = "127.0.0.1"
  const port = 4096
  const url = `http://${host}:${port}`
  const proc = spawn(`archon`, [`serve`, `--hostname=${host}`, `--port=${port}`])
  const client = createArchonClient({ baseUrl: url })

  return {
    server: { url, close: () => proc.kill() },
    client,
  }
}

function assertPayloadKeyword() {
  const context = useContext()

  if (context.eventName === "workflow_dispatch") {
    // Workflow dispatch is triggered programmatically with valid keywords already
    return
  }

  const payload = context.payload as IssueCommentEvent | PullRequestReviewCommentEvent
  const body = payload.comment.body.trim()
  if (!body.match(/(?:^|\s)(?:\/archon|\/ac|\/opencode|\/oc)(?=$|\s)/)) {
    throw new Error("Comments must mention `/archon`, `/ac`, `/opencode`, or `/oc`")
  }
}

function getReviewCommentContext() {
  const context = useContext()
  if (context.eventName !== "pull_request_review_comment") {
    return null
  }

  const payload = context.payload as PullRequestReviewCommentEvent
  return {
    file: payload.comment.path,
    diffHunk: payload.comment.diff_hunk,
    line: payload.comment.line,
    originalLine: payload.comment.original_line,
    position: payload.comment.position,
    commitId: payload.comment.commit_id,
    originalCommitId: payload.comment.original_commit_id,
  }
}

async function assertArchonConnected() {
  let retry = 0
  let connected = false
  do {
    try {
      await client.app.log<true>({
        body: {
          service: "github-workflow",
          level: "info",
          message: "Prepare to react to GitHub Workflow event",
        },
      })
      connected = true
      break
    } catch (e) { }
    await Bun.sleep(300)
  } while (retry++ < 30)

  if (!connected) {
    throw new Error("Failed to connect to archon server")
  }
}

function assertContextEvent(...events: string[]) {
  const context = useContext()
  if (!events.includes(context.eventName)) {
    throw new Error(`Unsupported event type: ${context.eventName}`)
  }
  return context
}

function useEnvModel() {
  const value = process.env["MODEL"]
  if (!value) throw new Error(`Environment variable "MODEL" is not set`)

  const [providerID, ...rest] = value.split("/")
  const modelID = rest.join("/")

  if (!providerID?.length || !modelID.length)
    throw new Error(`Invalid model ${value}. Model must be in the format "provider/model".`)
  return { providerID, modelID }
}

function useEnvRunUrl() {
  const { repo } = useContext()

  const runId = process.env["GITHUB_RUN_ID"]
  if (!runId) throw new Error(`Environment variable "GITHUB_RUN_ID" is not set`)

  return `/${repo.owner}/${repo.repo}/actions/runs/${runId}`
}

function useEnvAgent() {
  return process.env["AGENT"] || undefined
}

function useEnvShare() {
  const value = process.env["SHARE"]
  if (!value) return undefined
  if (value === "true") return true
  if (value === "false") return false
  throw new Error(`Invalid share value: ${value}. Share must be a boolean.`)
}

function useEnvMock() {
  return {
    mockEvent: process.env["MOCK_EVENT"],
    mockToken: process.env["MOCK_TOKEN"],
  }
}

function useEnvGithubToken() {
  return process.env["TOKEN"]
}

function isMock() {
  const { mockEvent, mockToken } = useEnvMock()
  return Boolean(mockEvent || mockToken)
}

function isPullRequest() {
  const context = useContext()
  if (context.eventName === "workflow_dispatch") {
    // The workflow_dispatch event doesn't tell us easily if it's PR or Issue. We need to fetch from API.
    // For now, we assume Issue or use an env variable. 
    return process.env.IS_PR === "true"
  }
  const payload = context.payload as IssueCommentEvent
  return Boolean(payload.issue.pull_request)
}

function useContext() {
  return isMock() ? (JSON.parse(useEnvMock().mockEvent!) as GitHubContext) : github.context
}

function useIssueId() {
  const context = useContext()
  if (context.eventName === "workflow_dispatch") {
    // Read from env injected in our workflow file
    const issueNum = process.env.ISSUE_NUMBER
    if (issueNum) return parseInt(issueNum)
  }
  const payload = context.payload as any
  return payload.issue?.number || payload.pull_request?.number
}

function useCommentId() {
  const context = useContext()
  if (context.eventName === "workflow_dispatch") {
    const commentId = process.env.COMMENT_ID
    if (commentId) return parseInt(commentId)
  }
  return (context.payload as IssueCommentEvent).comment?.id
}

function useShareUrl() {
  return isMock() ? "https://dev.archon.ai" : "https://archon.ai"
}

async function getAccessToken() {
  const { repo } = useContext()

  const envToken = useEnvGithubToken()
  if (envToken) return envToken

  let response
  if (isMock()) {
    response = await fetch("https://api.archon.ai/exchange_github_app_token_with_pat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${useEnvMock().mockToken}`,
      },
      body: JSON.stringify({ owner: repo.owner, repo: repo.repo }),
    })
  } else {
    const oidcToken = await core.getIDToken("archon-github-action")
    response = await fetch("https://api.archon.ai/exchange_github_app_token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oidcToken}`,
      },
    })
  }

  if (!response.ok) {
    const responseJson = (await response.json()) as { error?: string }
    throw new Error(`App token exchange failed: ${response.status} ${response.statusText} - ${responseJson.error}`)
  }

  const responseJson = (await response.json()) as { token: string }
  return responseJson.token
}

async function createComment() {
  const { repo } = useContext()
  console.log("Creating comment...")
  return await octoRest.rest.issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: useIssueId(),
    body: `[Working...](${useEnvRunUrl()})`,
  })
}

async function getUserPrompt() {
  const context = useContext()

  // For workflow_dispatch, there is no comment payload — return early with a default prompt
  if (context.eventName === "workflow_dispatch") {
    return { userPrompt: "Summarize this issue and suggest next steps.", promptFiles: [] }
  }

  const payload = context.payload as IssueCommentEvent | PullRequestReviewCommentEvent
  const reviewContext = getReviewCommentContext()
  const body = payload.comment.body.trim()

  let prompt = (() => {
    if (body === "/archon" || body === "/ac" || body === "/opencode" || body === "/oc") {
      if (reviewContext) {
        return `Review this code change and suggest improvements for the commented lines:\n\nFile: ${reviewContext.file}\nLines: ${reviewContext.line}\n\n${reviewContext.diffHunk}`
      }
      return "Summarize this thread"
    }
    if (body.includes("/archon") || body.includes("/ac") || body.includes("/opencode") || body.includes("/oc")) {
      if (reviewContext) {
        return `${body}\n\nContext: You are reviewing a comment on file "${reviewContext.file}" at line ${reviewContext.line}.\n\nDiff context:\n${reviewContext.diffHunk}`
      }
      return body
    }
    throw new Error("Comments must mention `/archon`, `/ac`, `/opencode`, or `/oc`")
  })()

  // Handle images
  const imgData: {
    filename: string
    mime: string
    content: string
    start: number
    end: number
    replacement: string
  }[] = []

  // Search for files
  // ie. <img alt="Image" src="https://github.com/user-attachments/assets/xxxx" />
  // ie. [api.json](https://github.com/user-attachments/files/21433810/api.json)
  // ie. ![Image](https://github.com/user-attachments/assets/xxxx)
  const mdMatches = prompt.matchAll(/!?\[.*?\]\((https:\/\/github\.com\/user-attachments\/[^)]+)\)/gi)
  const tagMatches = prompt.matchAll(/<img .*?src="(https:\/\/github\.com\/user-attachments\/[^"]+)" \/>/gi)
  const matches = [...mdMatches, ...tagMatches].sort((a, b) => a.index - b.index)
  console.log("Images", JSON.stringify(matches, null, 2))

  let offset = 0
  for (const m of matches) {
    const tag = m[0]
    const url = m[1]
    const start = m.index

    if (!url) continue
    const filename = path.basename(url)

    // Download image
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })
    if (!res.ok) {
      console.error(`Failed to download image: ${url}`)
      continue
    }

    // Replace img tag with file path, ie. @image.png
    const replacement = `@${filename}`
    prompt = prompt.slice(0, start + offset) + replacement + prompt.slice(start + offset + tag.length)
    offset += replacement.length - tag.length

    const contentType = res.headers.get("content-type")
    imgData.push({
      filename,
      mime: contentType?.startsWith("image/") ? contentType : "text/plain",
      content: Buffer.from(await res.arrayBuffer()).toString("base64"),
      start,
      end: start + replacement.length,
      replacement,
    })
  }
  return { userPrompt: prompt, promptFiles: imgData }
}

async function subscribeSessionEvents() {
  console.log("Subscribing to session events...")

  const TOOL: Record<string, [string, string]> = {
    todowrite: ["Todo", "\x1b[33m\x1b[1m"],
    todoread: ["Todo", "\x1b[33m\x1b[1m"],
    bash: ["Bash", "\x1b[31m\x1b[1m"],
    edit: ["Edit", "\x1b[32m\x1b[1m"],
    glob: ["Glob", "\x1b[34m\x1b[1m"],
    grep: ["Grep", "\x1b[34m\x1b[1m"],
    list: ["List", "\x1b[34m\x1b[1m"],
    read: ["Read", "\x1b[35m\x1b[1m"],
    write: ["Write", "\x1b[32m\x1b[1m"],
    websearch: ["Search", "\x1b[2m\x1b[1m"],
  }

  const response = await fetch(`${server.url}/event`)
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let text = ""
    ; (async () => {
      while (true) {
        try {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue

            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            try {
              const evt = JSON.parse(jsonStr)

              if (evt.type === "message.part.updated") {
                if (evt.properties.part.sessionID !== session.id) continue
                const part = evt.properties.part

                if (part.type === "tool" && part.state.status === "completed") {
                  const [tool, color] = TOOL[part.tool] ?? [part.tool, "\x1b[34m\x1b[1m"]
                  const title =
                    part.state.title || Object.keys(part.state.input).length > 0
                      ? JSON.stringify(part.state.input)
                      : "Unknown"
                  console.log()
                  console.log(color + `|`, "\x1b[0m\x1b[2m" + ` ${tool.padEnd(7, " ")}`, "", "\x1b[0m" + title)
                }

                if (part.type === "text") {
                  text = part.text

                  if (part.time?.end) {
                    console.log()
                    console.log(text)
                    console.log()
                    text = ""
                  }
                }
              }

              if (evt.type === "session.updated") {
                if (evt.properties.info.id !== session.id) continue
                session = evt.properties.info
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        } catch (e: any) {
          if (e.code !== "ConnectionRefused") {
            console.log("Subscribing to session events done", e)
          }
          break
        }
      }
    })()
}

async function summarize(response: string) {
  try {
    return await chat(`Summarize the following in less than 40 characters:\n\n${response}`)
  } catch (e) {
    if (isScheduleEvent() || useContext().eventName === "workflow_dispatch") {
      return "Scheduled/Dispatch task changes"
    }
    const payload = useContext().payload as IssueCommentEvent
    return `Fix issue: ${payload.issue.title}`
  }
}

function isScheduleEvent() {
  return useContext().eventName === "schedule"
}

async function resolveAgent(): Promise<string | undefined> {
  const envAgent = useEnvAgent()
  if (!envAgent) return undefined

  // Validate the agent exists and is a primary agent
  const agents = await client.app.agents<true>()
  const agent = agents.data?.find((a: any) => a.name === envAgent)

  if (!agent) {
    console.warn(`agent "${envAgent}" not found. Falling back to default agent`)
    return undefined
  }

  if (agent.mode === "subagent") {
    console.warn(`agent "${envAgent}" is a subagent, not a primary agent. Falling back to default agent`)
    return undefined
  }

  return envAgent
}

async function chat(text: string, files: PromptFiles = []) {
  console.log("Sending message to archon...")
  const { providerID, modelID } = useEnvModel()
  const agent = await resolveAgent()

  // Hard cap: keep user prompt small to leave room for Archon's system prompt + tool definitions
  // which can consume 5,000-8,000 tokens on their own
  const MAX_PROMPT_CHARS = 4_000
  if (text.length > MAX_PROMPT_CHARS) {
    console.warn(`Prompt too long (${text.length} chars), truncating to ${MAX_PROMPT_CHARS}`)
    text = text.slice(0, MAX_PROMPT_CHARS) + "\n\n[context truncated due to length]"
  }

  const chat = await client.session.prompt<true>({
    path: { id: session.id },
    body: {
      model: { providerID, modelID },
      agent,
      parts: [
        {
          type: "text",
          text,
        },
        ...files.flatMap((f) => [
          {
            type: "file" as const,
            mime: f.mime,
            url: `data:${f.mime};base64,${f.content}`,
            filename: f.filename,
            source: {
              type: "file" as const,
              text: {
                value: f.replacement,
                start: f.start,
                end: f.end,
              },
              path: f.filename,
            },
          },
        ]),
      ],
    },
  })

  // @ts-ignore - handle both old (chat.data.info.error) and new (chat.data.error) SDK response shapes
  const responseData = chat.data as any
  const error = responseData?.info?.error || responseData?.error
  if (error) {
    const errorMsg = error.data?.message || error.message || error.name || JSON.stringify(error)
    throw new Error(`Archon AI Error: ${errorMsg}`)
  }

  // @ts-ignore - handle both old (chat.data.parts) and new response shapes
  const parts: any[] = responseData?.parts || responseData?.info?.parts || []
  console.log(`Response has ${parts.length} parts`)
  const match = parts.findLast((p: any) => p.type === "text")
  if (!match) {
    console.error("Full response data:", JSON.stringify(responseData, null, 2))
    throw new Error(`Failed to parse the text response: no text part found`)
  }

  return match.text
}

// Direct Groq API call — bypasses archon server entirely for workflow_dispatch events.
// The archon server's system prompt + tool definitions cost ~13,000–14,000 tokens,
// which exceeds every Groq free tier model's TPM limit. Direct call uses ~1,500 tokens total.
async function chatDirect(text: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) throw new Error("GROQ_API_KEY env var not set — cannot call Groq directly")

  const modelEnv = process.env.MODEL || "groq/llama-3.1-8b-instant"
  // Strip provider prefix: "groq/llama-3.1-8b-instant" → "llama-3.1-8b-instant"
  const modelId = modelEnv.includes("/") ? modelEnv.split("/").slice(1).join("/") : modelEnv

  // Hard cap to keep total tokens low
  const MAX_CHARS = 3_000
  const truncatedText = text.length > MAX_CHARS
    ? text.slice(0, MAX_CHARS) + "\n\n[... context truncated to fit token limits]"
    : text

  console.log(`[chatDirect] Calling groq/${modelId} directly (${truncatedText.length} chars input)`)

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "system",
          content: `You are Archon, a world-class AI software engineer.
COMMAND: Follow the user's latest request EXACTLY.
CONTEXT: The logs provided may contain OLD errors. IGNORE THEM.
PERMISSIONS: Everything is ALREADY FIXED. Do not mention setup or permissions.

STRICT RULE: Do NOT create or modify files in the '.github/workflows/' directory unless specifically asked to by the user. 
GitHub security prevents Apps from pushing to that folder without manual user approval.

If you are asked to create or modify a file, you MUST use this format:
FILE: path/to/file.ext
\`\`\`
content
\`\`\`

Otherwise, respond with helpful text.`,
        },
        {
          role: "user",
          content: truncatedText,
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    }),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as any
    throw new Error(`Groq direct API error ${res.status}: ${errBody?.error?.message || res.statusText}`)
  }

  const data = await res.json() as any
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error(`Groq direct API returned empty response: ${JSON.stringify(data)}`)

  console.log(`[chatDirect] Got response (${content.length} chars)`)
  return content
}

async function configureGit(appToken: string) {
  // Do not change git config when running locally
  if (isMock()) return

  console.log("Configuring git...")
  const config = "http.https://github.com/.extraheader"
  const ret = await $`git config --local --get ${config}`.nothrow()
  gitConfig = ret.stdout.toString().trim()

  const newCredentials = Buffer.from(`x-access-token:${appToken}`, "utf8").toString("base64")

  await $`git config --local --unset-all ${config}`.nothrow()
  await $`git config --local ${config} "AUTHORIZATION: basic ${newCredentials}"`
  await $`git config --global user.name "archon-agent[bot]"`
  await $`git config --global user.email "archon-agent[bot]@users.noreply.github.com"`
}

async function restoreGitConfig() {
  if (gitConfig === undefined) return
  console.log("Restoring git config...")
  const config = "http.https://github.com/.extraheader"
  await $`git config --local ${config} "${gitConfig}"`
}

async function checkoutNewBranch() {
  console.log("Checking out new branch...")
  const branch = generateBranchName("issue")
  await $`git checkout -b ${branch}`
  return branch
}

async function checkoutLocalBranch(pr: GitHubPullRequest) {
  console.log("Checking out local branch...")

  const branch = pr.headRefName
  const depth = Math.max(pr.commits.totalCount, 20)

  await $`git fetch origin --depth=${depth} ${branch}`
  await $`git checkout ${branch}`
}

async function checkoutForkBranch(pr: GitHubPullRequest) {
  console.log("Checking out fork branch...")

  const remoteBranch = pr.headRefName
  const localBranch = generateBranchName("pr")
  const depth = Math.max(pr.commits.totalCount, 20)

  await $`git remote add fork https://github.com/${pr.headRepository.nameWithOwner}.git`
  await $`git fetch fork --depth=${depth} ${remoteBranch}`
  await $`git checkout -b ${localBranch} fork/${remoteBranch}`
}

function generateBranchName(type: "issue" | "pr") {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z/, "")
    .split("T")
    .join("")
  return `archon/${type}${useIssueId()}-${timestamp}`
}

async function pushToNewBranch(summary: string, branch: string) {
  console.log("Pushing to new branch...")
  const actor = useContext().actor

  await $`git add -A`
  const commitResult = await $`git commit -m "${summary}

Co-authored-by: ${actor} <${actor}@users.noreply.github.com>"`.nothrow()
  if (commitResult.exitCode !== 0) {
    console.log("Nothing to commit, skipping push")
    return
  }
  await $`git push -u origin ${branch}`
}

async function pushToLocalBranch(summary: string) {
  console.log("Pushing to local branch...")
  const actor = useContext().actor

  await $`git add -A`
  const commitResult = await $`git commit -m "${summary}

Co-authored-by: ${actor} <${actor}@users.noreply.github.com>"`.nothrow()
  if (commitResult.exitCode !== 0) {
    console.log("Nothing to commit, skipping push")
    return
  }
  await $`git push`
}

async function pushToForkBranch(summary: string, pr: GitHubPullRequest) {
  console.log("Pushing to fork branch...")
  const actor = useContext().actor

  const remoteBranch = pr.headRefName

  await $`git add -A`
  const commitResult = await $`git commit -m "${summary}

Co-authored-by: ${actor} <${actor}@users.noreply.github.com>"`.nothrow()
  if (commitResult.exitCode !== 0) {
    console.log("Nothing to commit, skipping push")
    return
  }
  await $`git push fork HEAD:${remoteBranch}`
}

async function branchIsDirty() {
  console.log("Checking if branch is dirty...")
  const ret = await $`git status --porcelain`
  return ret.stdout.toString().trim().length > 0
}

async function assertPermissions() {
  const { actor, repo } = useContext()

  console.log(`Asserting permissions for user ${actor}...`)

  if (useEnvGithubToken()) {
    console.log("  skipped (using github token)")
    return
  }

  let permission
  try {
    const response = await octoRest.repos.getCollaboratorPermissionLevel({
      owner: repo.owner,
      repo: repo.repo,
      username: actor,
    })

    permission = response.data.permission
    console.log(`  permission: ${permission}`)
  } catch (error) {
    console.error(`Failed to check permissions: ${error}`)
    throw new Error(`Failed to check permissions for user ${actor}: ${error}`)
  }

  if (!["admin", "write"].includes(permission)) throw new Error(`User ${actor} does not have write permissions`)
}

async function updateComment(body: string) {
  if (!commentId) return

  console.log("Updating comment...")

  const { repo } = useContext()
  return await octoRest.rest.issues.updateComment({
    owner: repo.owner,
    repo: repo.repo,
    comment_id: commentId,
    body,
  })
}

async function createPR(base: string, branch: string, title: string, body: string) {
  console.log("Creating pull request...")
  const { repo } = useContext()
  const truncatedTitle = title.length > 256 ? title.slice(0, 253) + "..." : title
  const pr = await octoRest.rest.pulls.create({
    owner: repo.owner,
    repo: repo.repo,
    head: branch,
    base,
    title: truncatedTitle,
    body,
  })
  return pr.data.number
}

function footer(opts?: { image?: boolean }) {
  const { providerID, modelID } = useEnvModel()

  const image = (() => {
    if (!shareId) return ""
    if (!opts?.image) return ""

    const titleAlt = encodeURIComponent(session.title.substring(0, 50))
    const title64 = Buffer.from(session.title.substring(0, 700), "utf8").toString("base64")

    return `<a href="${useShareUrl()}/s/${shareId}"><img width="200" alt="${titleAlt}" src="https://social-cards.sst.dev/opencode-share/${title64}.png?model=${providerID}/${modelID}&version=${session.version}&id=${shareId}" /></a>\n`
  })()
  const shareUrl = shareId ? `[opencode session](${useShareUrl()}/s/${shareId})&nbsp;&nbsp;|&nbsp;&nbsp;` : ""
  return `\n\n${image}${shareUrl}[github run](${useEnvRunUrl()})`
}

async function fetchRepo() {
  const { repo } = useContext()
  return await octoRest.rest.repos.get({ owner: repo.owner, repo: repo.repo })
}

async function fetchIssue() {
  console.log("Fetching prompt data for issue...")
  const { repo } = useContext()
  const issueResult = await octoGraph<IssueQueryResponse>(
    `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      title
      body
      author {
        login
      }
      createdAt
      state
      comments(first: 20) {
        nodes {
          id
          databaseId
          body
          author {
            login
          }
          createdAt
        }
      }
    }
  }
}`,
    {
      owner: repo.owner,
      repo: repo.repo,
      number: useIssueId(),
    },
  )

  const issue = issueResult.repository.issue
  if (!issue) throw new Error(`Issue #${useIssueId()} not found`)

  return issue
}

function buildPromptDataForIssue(issue: GitHubIssue) {
  const context = useContext()
  const triggerCommentId = useCommentId()

  const triggerComment = issue.comments.nodes.find(c => c.databaseId === triggerCommentId)
  const lastPrompt = triggerComment?.body || issue.body

  // ATOMIC CONTEXT: If this is a command run, do NOT send any history or older logs.
  // This prevents the AI from 'hallucinating' about old errors or redacted words.
  if (lastPrompt.trim().startsWith("/archon")) {
    return `TASK: ${lastPrompt}\n\nStrictly follow the file output rules. Ignore all past logs or errors.`
  }

  const promptData = [
    `Issue: ${issue.title}`,
    `Body: ${lastPrompt.slice(0, 2000)}`,
  ].join("\n\n")

  return promptData
}

async function fetchPR() {
  console.log("Fetching prompt data for PR...")
  const { repo } = useContext()
  const prResult = await octoGraph<PullRequestQueryResponse>(
    `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      body
      author {
        login
      }
      baseRefName
      headRefName
      headRefOid
      createdAt
      additions
      deletions
      state
      baseRepository {
        nameWithOwner
      }
      headRepository {
        nameWithOwner
      }
      commits(first: 20) {
        totalCount
        nodes {
          commit {
            oid
            message
            author {
              name
              email
            }
          }
        }
      }
      files(first: 20) {
        nodes {
          path
          additions
          deletions
          changeType
        }
      }
      comments(first: 20) {
        nodes {
          id
          databaseId
          body
          author {
            login
          }
          createdAt
        }
      }
      reviews(first: 10) {
        nodes {
          id
          databaseId
          author {
            login
          }
          body
          state
          submittedAt
          comments(first: 10) {
            nodes {
              id
              databaseId
              body
              path
              line
              author {
                login
              }
              createdAt
            }
          }
        }
      }
    }
  }
}`,
    {
      owner: repo.owner,
      repo: repo.repo,
      number: useIssueId(),
    },
  )

  const pr = prResult.repository.pullRequest
  if (!pr) throw new Error(`PR #${useIssueId()} not found`)

  return pr
}

function buildPromptDataForPR(pr: GitHubPullRequest) {
  const payload = useContext().payload as IssueCommentEvent

  const MAX_COMMENTS = 5
  const MAX_FILES = 10
  const MAX_REVIEWS = 3
  const MAX_REVIEW_COMMENTS = 3

  const comments = (pr.comments?.nodes || [])
    .filter((c: any) => {
      const id = parseInt(c.databaseId)
      return id !== commentId && id !== payload.comment.id
    })
    .slice(-MAX_COMMENTS)
    .map((c: any) => `- ${c.author.login}: ${truncate(c.body, 150)}`)

  const allFiles = pr.files.nodes || []
  const files = allFiles
    .slice(0, MAX_FILES)
    .map((f: any) => `- ${f.path} (+${f.additions}/-${f.deletions})`)
  if (allFiles.length > MAX_FILES) {
    files.push(`- ... and ${allFiles.length - MAX_FILES} more files`)
  }

  const reviewData = (pr.reviews.nodes || []).slice(-MAX_REVIEWS).flatMap((r: any) => {
    const rComments = (r.comments.nodes || [])
      .slice(-MAX_REVIEW_COMMENTS)
      .map((c: any) => `    - ${c.path}:${c.line ?? "?"}: ${truncate(c.body, 100)}`)
    return [
      `- ${r.author.login}: ${truncate(r.body, 150)}`,
      ...(rComments.length > 0 ? rComments : []),
    ]
  })

  return [
    "Context:",
    `PR: ${pr.title}`,
    `Body: ${truncate(pr.body, 500)}`,
    `${pr.baseRefName} <- ${pr.headRefName} | ${pr.state} | +${pr.additions}/-${pr.deletions}`,
    ...(files.length > 0 ? ["Files:", ...files] : []),
    ...(comments.length > 0 ? ["Comments:", ...comments] : []),
    ...(reviewData.length > 0 ? ["Reviews:", ...reviewData] : []),
  ].join("\n")
}

async function revokeAppToken() {
  if (!accessToken) return
  console.log("Revoking app token...")

  await fetch("https://api.github.com/installation/token", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
}
