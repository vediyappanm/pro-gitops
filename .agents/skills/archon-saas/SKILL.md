---
name: archon-saas-product
description: Build Archon as a production SaaS product — GitHub App with centralized AI proxy, Stripe billing, usage dashboard, and full user control. No customer-side API keys required.
---

# Archon SaaS Product — Complete Build Skill

## Overview

This skill transforms Archon from a BYOK (Bring Your Own Key) composite GitHub Action into a **fully managed SaaS product** where:
- Users install a **GitHub App** with one click (no forks, no secrets)
- **You** control all AI API keys, model routing, rate limits
- Users pay **you** via Stripe (subscription + usage-based)
- You have full visibility into usage, billing, and support

This is the same architecture used by **CodeRabbit**, **Sweep AI**, and **GitHub Copilot**.

---

## Architecture

```
┌─────────────────┐     Webhook      ┌──────────────────┐
│   GitHub Repo    │ ──────────────→  │   Archon Backend │
│  (User's repo)  │                  │   (Your server)  │
│                 │  ← GitHub API ── │                  │
│  /archon cmd    │                  │  ┌────────────┐  │
└─────────────────┘                  │  │ Auth/Billing│  │
                                     │  │ AI Proxy    │  │
┌─────────────────┐                  │  │ Rate Limit  │  │
│   Dashboard     │ ← REST API ───── │  │ Usage Track │  │
│  (archon.ai)    │                  │  └────────────┘  │
└─────────────────┘                  └────────┬─────────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                    ┌──────────┐       ┌──────────┐       ┌──────────┐
                    │  Groq    │       │ Anthropic│       │ OpenAI   │
                    │  (Free)  │       │  (Pro)   │       │(Enterprise)│
                    └──────────┘       └──────────┘       └──────────┘
```

---

## Phase 1: GitHub App + Webhook Backend (MVP)

### Step 1.1: Register GitHub App

1. Go to https://github.com/settings/apps/new
2. Fill in:
   - **Name**: `Archon AI` (or your brand name)
   - **Homepage URL**: `https://archon.ai`
   - **Webhook URL**: `https://api.archon.ai/webhook/github`
   - **Webhook Secret**: Generate a strong random secret
3. Set **Permissions**:
   - Repository permissions:
     - **Contents**: Read & Write
     - **Issues**: Read & Write
     - **Pull requests**: Read & Write
     - **Metadata**: Read-only
   - Organization permissions: None initially
4. Subscribe to **Events**:
   - `Issue comment`
   - `Pull request review comment`
5. Set **Where can this GitHub App be installed?**: `Any account`
6. Create the app, then:
   - Generate a **Private Key** (download the `.pem` file)
   - Note the **App ID** and **Client ID**
   - Create a **Client Secret**

### Step 1.2: Create Backend Project

Create a new directory for the backend service:

```bash
mkdir archon-api && cd archon-api
npx -y create-hono@latest ./ --template nodejs
```

#### Project Structure

```
archon-api/
├── src/
│   ├── index.ts                 # Entry point, Hono app
│   ├── routes/
│   │   ├── webhook.ts           # GitHub webhook handler
│   │   ├── auth.ts              # OAuth + login routes
│   │   ├── billing.ts           # Stripe webhook + API
│   │   ├── dashboard.ts         # Dashboard API routes
│   │   └── health.ts            # Health check
│   ├── services/
│   │   ├── github.ts            # GitHub API client (Octokit)
│   │   ├── ai-proxy.ts          # AI model router + proxy
│   │   ├── archon-runner.ts     # Spawns Archon process
│   │   ├── billing.ts           # Stripe billing logic
│   │   ├── usage.ts             # Usage tracking + limits
│   │   └── auth.ts              # JWT + session management
│   ├── db/
│   │   ├── schema.ts            # Drizzle ORM schema
│   │   ├── migrations/          # SQL migrations
│   │   └── client.ts            # Database connection
│   ├── config/
│   │   ├── env.ts               # Environment variables
│   │   ├── models.ts            # Model tier definitions
│   │   └── plans.ts             # Billing plan definitions
│   └── lib/
│       ├── verify-webhook.ts    # GitHub webhook signature verification
│       ├── rate-limiter.ts      # Token bucket rate limiter
│       └── logger.ts            # Structured logging
├── .env.example
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── Dockerfile
```

### Step 1.3: Implement Webhook Handler

This is the core entry point. When a user comments `/archon` on any repo where the app is installed, GitHub sends a webhook.

```typescript
// src/routes/webhook.ts
import { Hono } from "hono"
import { verifyGitHubWebhook } from "../lib/verify-webhook"
import { getInstallationToken } from "../services/github"
import { checkUserQuota } from "../services/usage"
import { routeToModel } from "../services/ai-proxy"
import { getUserPlan } from "../services/billing"

const webhook = new Hono()

webhook.post("/webhook/github", async (c) => {
  // 1. Verify webhook signature
  const signature = c.req.header("x-hub-signature-256")
  const body = await c.req.text()
  if (!verifyGitHubWebhook(body, signature, process.env.GITHUB_WEBHOOK_SECRET!)) {
    return c.json({ error: "Invalid signature" }, 401)
  }

  const event = c.req.header("x-github-event")
  const payload = JSON.parse(body)

  // 2. Only handle issue_comment and pull_request_review_comment
  if (event !== "issue_comment" && event !== "pull_request_review_comment") {
    return c.json({ ok: true, skipped: true })
  }

  // 3. Check for /archon keyword
  const comment = payload.comment.body.trim()
  if (!comment.match(/(?:^|\s)(?:\/archon|\/ac)(?=$|\s)/)) {
    return c.json({ ok: true, skipped: true })
  }

  // 4. Get installation token for this repo
  const installationId = payload.installation.id
  const token = await getInstallationToken(installationId)

  // 5. Check user billing/quota
  const userId = payload.comment.user.id.toString()
  const orgId = payload.repository.owner.id.toString()
  const plan = await getUserPlan(orgId)
  const quota = await checkUserQuota(orgId, plan)

  if (!quota.allowed) {
    // Post a comment saying they've exceeded their limit
    await postComment(token, payload, `⚠️ You've used ${quota.used}/${quota.limit} requests this month. [Upgrade your plan](https://archon.ai/billing)`)
    return c.json({ ok: true, limited: true })
  }

  // 6. Process asynchronously (respond to GitHub quickly)
  c.executionCtx.waitUntil(processArchonRequest(token, payload, plan))

  return c.json({ ok: true, processing: true })
})

async function processArchonRequest(token: string, payload: any, plan: Plan) {
  try {
    // Post "Working..." comment
    const commentId = await postComment(token, payload, "⏳ Working...")

    // Get the right model for this plan tier
    const model = routeToModel(plan.tier)

    // Run Archon with the selected model
    const response = await runArchon({
      token,
      model,
      repo: payload.repository,
      issue: payload.issue,
      comment: payload.comment,
      installationId: payload.installation.id,
    })

    // Update the comment with the response
    await updateComment(token, payload, commentId, response)

    // Track usage
    await recordUsage({
      orgId: payload.repository.owner.id,
      userId: payload.comment.user.id,
      repo: payload.repository.full_name,
      tokens: response.tokensUsed,
    })
  } catch (error) {
    await updateComment(token, payload, commentId,
      `❌ Error: ${error.message}\n\n[Report this issue](https://archon.ai/support)`)
  }
}

export default webhook
```

### Step 1.4: Implement AI Proxy / Model Router

```typescript
// src/services/ai-proxy.ts
// Route users to different models based on their plan tier

interface ModelConfig {
  provider: string
  modelId: string
  apiKey: string
  maxTokens: number
  tpmLimit: number
}

const MODEL_TIERS: Record<string, ModelConfig> = {
  free: {
    provider: "groq",
    modelId: "meta-llama/llama-4-scout-17b-16e-instruct",
    apiKey: process.env.GROQ_API_KEY!,
    maxTokens: 2048,
    tpmLimit: 30000,
  },
  pro: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    maxTokens: 8192,
    tpmLimit: 100000,
  },
  enterprise: {
    provider: "openai",
    modelId: "gpt-5",
    apiKey: process.env.OPENAI_API_KEY!,
    maxTokens: 16384,
    tpmLimit: 500000,
  },
}

export function routeToModel(tier: string): ModelConfig {
  return MODEL_TIERS[tier] || MODEL_TIERS.free
}
```

### Step 1.5: Implement GitHub Webhook Verification

```typescript
// src/lib/verify-webhook.ts
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
```

### Step 1.6: Environment Variables

```bash
# .env.example

# GitHub App
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_CLIENT_ID=Iv1.xxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxx

# AI Provider Keys (YOUR keys, not users')
GROQ_API_KEY=gsk_xxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxx
OPENROUTER_API_KEY=sk-or-xxxxxxxxx

# Database
DATABASE_URL=postgresql://user:pass@host:5432/archon

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxx
STRIPE_PRICE_PRO=price_xxxxxxxxx
STRIPE_PRICE_TEAM=price_xxxxxxxxx

# App
PORT=3000
NODE_ENV=production
JWT_SECRET=xxxxxxxxx
```

---

## Phase 2: Database Schema + Billing

### Step 2.1: Database Schema (Drizzle ORM + PostgreSQL)

```typescript
// src/db/schema.ts
import { pgTable, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core"

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),                    // GitHub org/user ID
  githubLogin: text("github_login").notNull(),
  installationId: integer("installation_id"),
  plan: text("plan").default("free"),             // free, pro, team, enterprise
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const users = pgTable("users", {
  id: text("id").primaryKey(),                    // GitHub user ID
  githubLogin: text("github_login").notNull(),
  email: text("email"),
  orgId: text("org_id").references(() => organizations.id),
  role: text("role").default("member"),           // owner, admin, member
  createdAt: timestamp("created_at").defaultNow(),
})

export const usageRecords = pgTable("usage_records", {
  id: text("id").primaryKey(),
  orgId: text("org_id").references(() => organizations.id),
  userId: text("user_id").references(() => users.id),
  repo: text("repo").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  cost: integer("cost_microcents").default(0),    // Cost in microcents (1/10000 cent)
  createdAt: timestamp("created_at").defaultNow(),
})

export const repos = pgTable("repos", {
  id: text("id").primaryKey(),                    // GitHub repo ID
  orgId: text("org_id").references(() => organizations.id),
  fullName: text("full_name").notNull(),          // owner/repo
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings").default({}),        // Model preferences, etc.
  createdAt: timestamp("created_at").defaultNow(),
})
```

### Step 2.2: Billing Plans

```typescript
// src/config/plans.ts
export interface Plan {
  id: string
  name: string
  tier: string                    // Maps to MODEL_TIERS
  monthlyRequests: number
  maxTokensPerRequest: number
  privateRepos: boolean
  priceMonthly: number            // In cents
  stripePriceId: string | null
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tier: "free",
    monthlyRequests: 50,
    maxTokensPerRequest: 2048,
    privateRepos: false,
    priceMonthly: 0,
    stripePriceId: null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    tier: "pro",
    monthlyRequests: 500,
    maxTokensPerRequest: 8192,
    privateRepos: true,
    priceMonthly: 1900,           // $19.00
    stripePriceId: "price_pro_xxx",
  },
  team: {
    id: "team",
    name: "Team",
    tier: "pro",
    monthlyRequests: 2000,
    maxTokensPerRequest: 8192,
    privateRepos: true,
    priceMonthly: 4900,           // $49.00
    stripePriceId: "price_team_xxx",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tier: "enterprise",
    monthlyRequests: -1,           // Unlimited
    maxTokensPerRequest: 16384,
    privateRepos: true,
    priceMonthly: 0,              // Custom pricing
    stripePriceId: null,
  },
}
```

### Step 2.3: Stripe Integration

```typescript
// src/routes/billing.ts
import Stripe from "stripe"
import { Hono } from "hono"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const billing = new Hono()

// Create checkout session
billing.post("/api/billing/checkout", async (c) => {
  const { orgId, planId } = await c.req.json()
  const plan = PLANS[planId]
  if (!plan?.stripePriceId) return c.json({ error: "Invalid plan" }, 400)

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `https://archon.ai/dashboard?success=true`,
    cancel_url: `https://archon.ai/dashboard?canceled=true`,
    metadata: { orgId },
  })

  return c.json({ url: session.url })
})

// Stripe webhook handler
billing.post("/webhook/stripe", async (c) => {
  const sig = c.req.header("stripe-signature")!
  const body = await c.req.text()
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object
      await db.update(organizations)
        .set({
          plan: session.metadata.planId,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
        })
        .where(eq(organizations.id, session.metadata.orgId))
      break
    }
    case "customer.subscription.deleted": {
      // Downgrade to free
      const sub = event.data.object
      await db.update(organizations)
        .set({ plan: "free" })
        .where(eq(organizations.stripeSubscriptionId, sub.id))
      break
    }
  }

  return c.json({ ok: true })
})

export default billing
```

---

## Phase 3: Dashboard Frontend

### Step 3.1: Dashboard Pages

Build a simple dashboard at `https://archon.ai/dashboard` with:

| Page | Purpose |
|---|---|
| `/dashboard` | Usage overview, monthly stats, current plan |
| `/dashboard/billing` | Manage subscription, upgrade/downgrade |
| `/dashboard/repos` | List of repos with Archon installed |
| `/dashboard/settings` | Model preferences, response style |
| `/dashboard/history` | History of all Archon requests |

### Step 3.2: OAuth Login Flow

Users log in with GitHub OAuth:

```
1. User clicks "Login with GitHub" → redirects to GitHub OAuth
2. GitHub redirects back with code → exchange for access token
3. Backend creates JWT session → returns to dashboard
4. Dashboard uses JWT for all API calls
```

---

## Phase 4: Deployment

### Step 4.1: Deploy Backend

Recommended: **Railway** or **Fly.io** for simplicity.

```dockerfile
# Dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Step 4.2: Required Infrastructure

| Service | Purpose | Cost |
|---|---|---|
| **Railway/Fly.io** | Backend hosting | ~$5-20/mo |
| **PostgreSQL** (Neon/Supabase) | Database | Free tier available |
| **Stripe** | Billing | 2.9% + 30¢ per transaction |
| **Cloudflare** (optional) | CDN + DDoS protection | Free tier |
| **Domain** | archon.ai or similar | ~$12/year |

### Step 4.3: GitHub App Configuration Checklist

After deploying:

1. Update GitHub App **Webhook URL** to `https://api.archon.ai/webhook/github`
2. Set the **Webhook Secret** in production env
3. Upload the Private Key to production env
4. Test with a real webhook delivery via GitHub App → Advanced → Recent Deliveries

---

## Security Checklist

- [ ] Webhook signatures verified with HMAC-SHA256
- [ ] All AI API keys stored server-side only (never exposed to users)
- [ ] JWT tokens with short expiry (1 hour) + refresh tokens
- [ ] Rate limiting on all endpoints (per IP and per org)
- [ ] Database credentials encrypted at rest
- [ ] HTTPS enforced everywhere
- [ ] CSP headers on dashboard
- [ ] Stripe webhook signatures verified
- [ ] GitHub installation tokens scoped to minimum required permissions
- [ ] No user code stored permanently — process in memory and discard

---

## Testing Checklist

### Unit Tests
- [ ] Webhook signature verification (valid, invalid, missing)
- [ ] Model routing by tier (free → Llama, pro → Claude)
- [ ] Usage quota checks (under limit, at limit, over limit)
- [ ] Plan lookup and billing logic

### Integration Tests
- [ ] Full webhook flow: comment → processing → response posted
- [ ] Stripe checkout → subscription created → plan upgraded
- [ ] Subscription canceled → downgraded to free
- [ ] Rate limiting kicks in correctly

### End-to-End Tests
- [ ] Install GitHub App on test repo
- [ ] Comment `/archon summarize this issue` → AI response appears
- [ ] Free tier user hits 50 request limit → gets upgrade message
- [ ] Pro user gets Claude responses, free user gets Llama

---

## Revenue Projections

| Metric | Free | Pro ($19) | Team ($49) |
|---|---|---|---|
| AI cost per request | ~$0.001 | ~$0.03 | ~$0.03 |
| Monthly requests | 50 | 500 | 2000 |
| AI cost/user/month | $0.05 | $15.00 | $60.00 |
| Revenue/user/month | $0 | $19.00 | $49.00 |
| **Margin** | **-$0.05** | **+$4.00** | **-$11.00** |

> [!TIP]
> To be profitable on Team tier, use a mix of cheaper models (Groq for simple tasks, Claude for complex ones) to keep AI costs under $30/user/month.

---

## Migration from Current BYOK Model

To migrate existing users:

1. Keep the current composite action working as-is (backwards compatible)
2. Add a new "managed mode" where the action calls YOUR API instead of direct AI providers
3. In the workflow, users replace their API key env vars with a single `ARCHON_API_KEY`
4. Eventually deprecate direct API key mode

```yaml
# Migration path for existing users
- name: Run archon
  uses: vediyappanm/pro-gitops/github@main
  env:
    GITHUB_TOKEN: ${{ github.token }}
    # OLD: GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
    # NEW: Just one key from archon.ai dashboard
    ARCHON_API_KEY: ${{ secrets.ARCHON_API_KEY }}
  with:
    model: auto  # Let Archon pick the best model for your plan
    use_github_token: "true"
```
