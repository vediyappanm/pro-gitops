import * as dotenv from "dotenv";
import { App } from "octokit";

dotenv.config();

async function checkInstallations() {
    const appId = process.env.GITHUB_APP_ID!;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n');

    try {
        const app = new App({
            appId: appId,
            privateKey: privateKey,
        });

        console.log("Fetching installations for App ID:", appId);
        const { data: installations } = await app.octokit.request("GET /app/installations");

        console.log(`\nFound ${installations.length} installations:`);
        for (const inst of installations) {
            console.log(`- ID: ${inst.id}, Account: ${inst.account?.login} (${inst.account?.type})`);

            try {
                const octokitInst = await app.getInstallationOctokit(inst.id);
                const { data: repoData } = await octokitInst.request("GET /installation/repositories");

                console.log(`  Repos accessible: ${repoData.total_count}`);
                repoData.repositories.forEach((r: any) => {
                    console.log(`    > ${r.full_name}`);
                });
            } catch (err: any) {
                console.error(`  Error fetching repos for installation ${inst.id}:`, err.message);
            }
        }
    } catch (error: any) {
        console.error("Error checking installations:", error.message);
    }
}

checkInstallations();
