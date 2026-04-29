import "dotenv/config";
import cron from "node-cron";
import { spawn } from "node:child_process";

const schedule = process.env.CRON_SCHEDULE ?? "0 10 * * *";

console.log(`[scheduler] running with schedule: ${schedule}`);

cron.schedule(schedule, () => {
  console.log("[scheduler] triggering scraper run");
  const child = spawn("npm", ["run", "start"], { stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    console.log(`[scheduler] scraper finished with code ${code ?? 0}`);
  });
});
