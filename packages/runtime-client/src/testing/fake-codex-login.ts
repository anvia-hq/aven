#!/usr/bin/env bun
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const home = process.env.CODEX_HOME ?? ".";
const marker = join(home, "signed-in");
const args = process.argv.slice(2);

if (args[0] === "login" && args[1] === "status") {
  console.log(existsSync(marker) ? "Logged in using ChatGPT" : "Not logged in");
  process.exit(existsSync(marker) ? 0 : 1);
}

if (args[0] === "login" && args[1] === "--device-auth") {
  console.log(
    "\nWelcome to Codex [v\u001b[90m0.167.0\u001b[0m]\n\nFollow these steps to sign in with ChatGPT using device code authorization:\n\n1. Open this link in your browser and sign in to your account\n   \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m\n\n2. Enter this one-time code \u001b[90m(expires in 15 minutes)\u001b[0m\n   \u001b[94mAOL5-C2T9O\u001b[0m\n",
  );
  for (;;) {
    if (existsSync(join(home, "approve"))) {
      writeFileSync(marker, "yes");
      process.exit(0);
    }
    if (existsSync(join(home, "deny"))) {
      console.error("Error logging in with device code: device code authorization was denied");
      process.exit(1);
    }
    await Bun.sleep(50);
  }
}
process.exit(2);
