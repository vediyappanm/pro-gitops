import "dotenv/config";
import { db } from "./src/db/client.js";
import { users } from "./src/db/schema.js";

async function testDB() {
    try {
        console.log("🐘 Testing Database connection...");
        const allUsers = await db.select().from(users).limit(1);
        console.log("✅ Database connectivity: PASSED");
        console.log("Users found:", allUsers.length);
    } catch (e: any) {
        console.error("❌ Database connection FAILED:", e.message);
    } finally {
        process.exit(0);
    }
}

testDB();
