import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

if (!process.env.npm_execpath) throw new Error("Run npm run install:ci.");
const child = spawn(process.execPath, [process.env.npm_execpath, "ci", "--ignore-scripts", "--include=dev", "--include=optional", "--no-audit", "--no-fund"], { stdio: "inherit" });
child.on("error", () => { console.error("Unable to start npm ci"); process.exitCode = 1; });
const code = await new Promise((resolve) => child.once("close", resolve));
if (code !== 0) process.exit(code ?? 1);
await access(`node_modules/.bin/${process.platform === "win32" ? "next.cmd" : "next"}`, process.platform === "win32" ? constants.F_OK : constants.X_OK);
