import { Hono } from "hono"
import Stripe from "stripe"
import { db } from "../db/client.js"
import { organizations } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { PLANS } from "../config/plans.js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')

const billing = new Hono()

// Stripe Webhook
billing.post("/webhook", async (c) => {
    const sig = c.req.header("stripe-signature")
    const body = await c.req.text()

    let event: Stripe.Event
    try {
        event = stripe.webhooks.constructEvent(
            body,
            sig || "",
            process.env.STRIPE_WEBHOOK_SECRET || ""
        )
    } catch (err: any) {
        return c.json({ error: `Webhook Error: ${err.message}` }, 400)
    }

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session
            const orgId = session.metadata?.orgId
            const planId = session.metadata?.planId

            if (orgId && planId) {
                await db.update(organizations)
                    .set({
                        plan: planId,
                        stripeCustomerId: session.customer as string,
                        stripeSubscriptionId: session.subscription as string,
                        updatedAt: new Date(),
                    })
                    .where(eq(organizations.id, orgId))
            }
            break
        }
        case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription
            await db.update(organizations)
                .set({ plan: "free", updatedAt: new Date() })
                .where(eq(organizations.stripeSubscriptionId, subscription.id))
            break
        }
    }

    return c.json({ received: true })
})

export default billing
