"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_cron_1 = __importDefault(require("node-cron"));
const node_child_process_1 = require("node:child_process");
const schedule = process.env.CRON_SCHEDULE ?? "0 10 * * *";
console.log(`[scheduler] running with schedule: ${schedule}`);
node_cron_1.default.schedule(schedule, () => {
    console.log("[scheduler] triggering scraper run");
    const child = (0, node_child_process_1.spawn)("npm", ["run", "start"], { stdio: "inherit", shell: true });
    child.on("exit", (code) => {
        console.log(`[scheduler] scraper finished with code ${code ?? 0}`);
    });
});
//# sourceMappingURL=cron.js.map