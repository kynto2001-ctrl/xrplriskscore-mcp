#!/usr/bin/env node
// Setup script: registers the xrplriskscore MCP server in Claude Desktop config.
// Run: npx -p @xrplriskscore/mcp xrplriskscore-mcp-setup   OR   node bin/setup.js

import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "..", "src", "server.mjs");

// Locate claude_desktop_config.json
function findConfigPath() {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  // Linux / WSL
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

const configPath = findConfigPath();

// Load existing config (create empty if absent)
let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    console.error(`⚠️  Could not parse existing config at ${configPath}. Aborting.`);
    process.exit(1);
  }
} else {
  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
}

// Merge the xrplriskscore entry
config.mcpServers          = config.mcpServers          || {};
config.mcpServers.xrplriskscore = {
  command: "node",
  args:    [serverPath],
};

// Write back
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

console.log(`\n✅ xrplriskscore MCP server registered in Claude Desktop.\n`);
console.log(`   Config file: ${configPath}`);
console.log(`   Server:      ${serverPath}`);
console.log(`\n   Restart Claude Desktop for the change to take effect.`);
console.log(`\n   Tools available after restart:`);
console.log(`     • check_xrpl_wallet_risk`);
console.log(`     • quick_xrpl_prescore`);
console.log(`     • explain_xrpl_risk_score`);
console.log(`     • check_xrpl_rwa_compliance`);
console.log(`     • check_xrpl_credential_eligibility`);
console.log(`     • check_xrpl_escrow_counterparty`);
console.log(`     • list_xrpl_risk_endpoints`);
console.log(`\n   All tools use the free demo tier by default.`);
console.log(`   For paid full analysis, set XRPL_SEED and use @xrplriskscore/client.\n`);
