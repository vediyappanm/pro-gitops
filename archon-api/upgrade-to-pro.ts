import { db } from "./src/db/client.js";
import { organizations } from "./src/db/schema.js";
import { sql } from "drizzle-orm";

async function upgradeAll() {
    console.log("🚀 Upgrading all organizations to PRO...");
    const result = await db.update(organizations).set({ plan: "pro" });
    console.log("✅ All organizations are now on PRO plan.");
    process.exit(0);
}

upgradeAll().catch(console.error);
