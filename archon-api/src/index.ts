import "dotenv/config"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import webhook from "./routes/webhook.js"
import auth from "./routes/auth.js"
import billing from "./routes/billing.js"
import dashboard from "./routes/dashboard.js"

const app = new Hono()

app.use("*", logger())
app.use("*", cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}))

// Routes
app.get("/", (c) => c.text("Archon API is running!"))
app.route("/webhook/github", webhook)
app.route("/auth", auth)
app.route("/billing", billing)
app.route("/dashboard", dashboard)

const port = Number(process.env.PORT) || 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0",
})
