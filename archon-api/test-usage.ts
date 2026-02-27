import "dotenv/config";
import { db } from "./src/db/client.js";
import { usageRecords } from "./src/db/schema.js";

async function checkUsage() {
    try {
        console.log("📊 Checking for usage records...");
        const records = await db.select().from(usageRecords);
        if (records.length > 0) {
            console.log(`✅ FOUND ${records.length} records!`);
            console.log(JSON.stringify(records, null, 2));
        } else {
            console.log("❌ No usage records found yet.");
        }
    } catch (e: any) {
        console.error("❌ Error:", e.message);
    } finally {
        process.exit(0);
    }
}

checkUsage();
