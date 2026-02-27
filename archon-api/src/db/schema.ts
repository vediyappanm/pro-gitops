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
