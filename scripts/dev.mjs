#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const rootDir = resolve(dirname(new URL(import.meta.url).pathname), "..");
const template = JSON.parse(readFileSync(join(rootDir, "template.config.json"), "utf8"));

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["nitro", "dev", "--port", String(template.servicePort)],
  {
    stdio: "inherit",
    cwd: rootDir,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${Number(template.servicePort) + 1}`
    }
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
