#!/usr/bin/env node
// ============================================================
// @xrplriskscore/mcp — MCP server for xrplriskscore.ai
//
// Tools:
//   check_xrpl_wallet_risk         — full 23-signal risk score (demo)
//   quick_xrpl_prescore            — fast 3-signal pre-check (demo)
//   explain_xrpl_risk_score        — explain a score result
//   check_xrpl_rwa_compliance      — RWA compliance check (demo)
//   check_xrpl_credential_eligibility — credential screening (demo)
//   check_xrpl_escrow_counterparty — escrow counterparty screening (demo)
//   list_xrpl_risk_endpoints       — list all endpoints and pricing
//   check_xrpl_compliance_bundle   — unified risk + RWA + credential bundle (paid, 3 XRP)
//   provision_xrpl_wallet          — generate a fresh XRPL keypair (paid, 1 XRP — caller funds reserve)
//
// Transport: stdio (standard MCP)
// Demo tools use the free /demo/* endpoints (3 calls/IP/24h).
// For paid full analysis, use @xrplriskscore/client directly.
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const BASE_URL    = process.env.XRPLRISKSCORE_BASE_URL || "https://xrplriskscore.ai";
const API_TIMEOUT = 15_000;

async function apiFetch(path) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function verdictBanner(verdict) {
  if (verdict === "BLOCK")     return "⚠️  WARNING: BLOCK — Do not send XRP to this wallet.";
  if (verdict === "CHALLENGE") return "⚠️  CAUTION: CHALLENGE — Verify before sending.";
  return "✅ ALLOW — Wallet appears safe to transact with.";
}

const FLAG_EXPLANATIONS = {
  "New account":                   "Freshly created wallet — scammers often use new addresses.",
  "High transaction velocity":     "Unusually high 24h transaction rate — possible bot or burst fraud.",
  "Low counterparty diversity":    "Sends to very few unique addresses — limited legitimate use.",
  "High offer cancellation ratio": "Most DEX offers cancelled immediately — DEX spoofing pattern.",
  "Wash trading detected":         "Round-trip XRP flows detected — inflated volume.",
  "Fan-out pattern":               "Large inflow immediately split to many addresses — laundering layering.",
  "Dormancy spike":                "Old inactive account suddenly active — may be compromised.",
  "Round number bias":             "Most payments are round amounts — scripted fraud indicator.",
  "Bot timing pattern":            "Machine-like transaction intervals — automated tooling.",
  "Rapid outflow":                 "Large inflows quickly redistributed — pass-through wallet.",
  "SANCTIONS MATCH":               "🚨 Matches OFAC or international sanctions list. Transacting may be illegal.",
  "KNOWN SCAM":                    "🚨 Confirmed in known scam database — phishing, rug pull, or fraud wallet.",
};

function explainFlag(flag) {
  for (const [key, explanation] of Object.entries(FLAG_EXPLANATIONS)) {
    if (flag.toLowerCase().includes(key.toLowerCase())) return explanation;
  }
  return "Unusual activity pattern — review transaction history carefully.";
}

function actionForVerdict(verdict, riskScore) {
  if (verdict === "BLOCK") {
    return "🚫 Do NOT send XRP. High probability of fraud, scam, or sanctions match.";
  }
  if (verdict === "CHALLENGE") {
    return `⚠️  Proceed with caution (score: ${riskScore}/100). Verify identity via separate channel, send a small test amount first.`;
  }
  return `✅ Safe to proceed (score: ${riskScore}/100). Standard precautions still apply.`;
}

// ─────────────────────────────────────────────────────────────
const server = new McpServer({ name: "xrplriskscore", version });

// ── Tool 1: check_xrpl_wallet_risk ──────────────────────────
server.tool(
  "check_xrpl_wallet_risk",
  "Check any XRPL wallet address for risk before sending XRP. Returns ALLOW/CHALLENGE/BLOCK verdict with 23 on-chain signals including OFAC sanctions screening and known scam database lookup. Use this before any XRPL payment to protect against fraud.",
  { walletAddress: z.string().describe("XRPL wallet address (starts with r, 25-35 chars)") },
  async ({ walletAddress }) => {
    if (!walletAddress?.startsWith("r") || walletAddress.length < 25) {
      return { content: [{ type: "text", text: "❌ Invalid XRPL wallet address. Must start with 'r' and be 25-35 characters." }] };
    }
    let data;
    try { data = await apiFetch(`/demo/score/${encodeURIComponent(walletAddress)}`); }
    catch (err) { return { content: [{ type: "text", text: `❌ Risk scoring unavailable: ${err.message}` }] }; }
    if (data.error) return { content: [{ type: "text", text: `❌ ${data.error}` }] };

    const bd    = data.breakdown ?? {};
    const flags = data.flags ?? [];
    const lines = [
      verdictBanner(data.verdict), "",
      `Wallet:     ${data.wallet}`,
      `Verdict:    ${data.verdict}`,
      `Risk Score: ${data.riskScore ?? "?"}/100  (${data.riskLevel ?? "?"})`,
      `Confidence: ${data.confidence ?? "?"}`,
      "",
      "── Breakdown ──────────────────────────────────",
      `Account age:         ${bd.accountAgeDays ?? "?"} days`,
      `Balance:             ${bd.balanceXRP ?? "?"} XRP  (${bd.spendableXRP ?? "?"} spendable)`,
      `Total transactions:  ${bd.totalTransactions ?? "?"}`,
      `Last 24h txs:        ${bd.last24hrTransactions ?? "?"}`,
      `Unique destinations: ${bd.uniqueDestinations ?? "?"}`,
      `Has trustlines:      ${bd.hasTrustlines ?? "?"}`,
      `Has domain:          ${bd.hasDomain ?? "?"}`,
      `Payment channels:    ${bd.hasPaymentChannels ?? "?"}`,
      "",
      "── Advanced Signals ────────────────────────────",
      `Wash trading:    ${bd.washTradingFlag  ? "⚠️  DETECTED" : "✓ clean"}`,
      `Fan-out pattern: ${bd.fanOutFlag       ? "⚠️  DETECTED" : "✓ clean"}`,
      `Dormancy spike:  ${bd.dormancyFlag     ? "⚠️  DETECTED" : "✓ clean"}`,
      `Round numbers:   ${bd.roundNumberFlag  ? "⚠️  DETECTED" : "✓ clean"}`,
      `Bot timing:      ${bd.botTimingFlag    ? "⚠️  DETECTED" : "✓ clean"}`,
      `Rapid outflow:   ${bd.rapidOutflowFlag ? "⚠️  DETECTED" : "✓ clean"}`,
      "",
      "── Sanctions & Scam ────────────────────────────",
      `Sanctioned:  ${bd.isSanctioned ? "🚨 YES — " + bd.sanctionSource : "✓ no match"}`,
      `Known scam:  ${bd.isKnownScam  ? "🚨 YES — " + bd.scamLabel     : "✓ not found"}`,
    ];

    if (flags.length > 0) {
      lines.push("", "── Active Flags ────────────────────────────────");
      flags.forEach(f => lines.push(`  • ${f}`));
    }
    if (data.summary) lines.push("", "── Summary ─────────────────────────────────────", data.summary);
    lines.push("", "── Recommended Action ──────────────────────────", actionForVerdict(data.verdict, data.riskScore));

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── Tool 2: quick_xrpl_prescore ─────────────────────────────
server.tool(
  "quick_xrpl_prescore",
  "Fast 3-second pre-payment check for an XRPL wallet. Returns ALLOW/CHALLENGE/BLOCK using 3 signals only (account age, balance, existence). Use when speed matters more than depth.",
  { walletAddress: z.string().describe("XRPL wallet address (starts with r)") },
  async ({ walletAddress }) => {
    if (!walletAddress?.startsWith("r") || walletAddress.length < 25) {
      return { content: [{ type: "text", text: "❌ Invalid XRPL wallet address." }] };
    }
    let data;
    try { data = await apiFetch(`/demo/prescore/${encodeURIComponent(walletAddress)}`); }
    catch (err) { return { content: [{ type: "text", text: `❌ Pre-score unavailable: ${err.message}` }] }; }
    if (data.error) return { content: [{ type: "text", text: `❌ ${data.error}` }] };

    const sig = data.signals ?? {};
    return { content: [{ type: "text", text: [
      verdictBanner(data.verdict), "",
      `Wallet:      ${data.wallet}`,
      `Verdict:     ${data.verdict}`,
      `Risk Score:  ${data.riskScore ?? "?"}/100  (quick check — 3 signals only)`,
      `Confidence:  LOW`,
      "",
      "── Signals ─────────────────────────────────────",
      `Account exists: ${sig.accountExists  ? "✓ yes"                  : "✗ not found on XRPL"}`,
      `Account age:    ${sig.accountAgeDays ?? "?"} days`,
      `Balance:        ${sig.balanceXRP     ?? "?"} XRP`,
      `New account:    ${sig.isNewAccount   ? "⚠️  yes (< 30 days)"   : "✓ no"}`,
      "",
      data.note ?? "For full 23-signal analysis, use check_xrpl_wallet_risk.",
    ].join("\n") }] };
  }
);

// ── Tool 3: explain_xrpl_risk_score ─────────────────────────
server.tool(
  "explain_xrpl_risk_score",
  "Explains what an XRPL wallet risk score and verdict mean. Use this to help users understand a score report.",
  {
    verdict:   z.enum(["ALLOW", "CHALLENGE", "BLOCK"]),
    riskScore: z.number().min(0).max(100),
    flags:     z.array(z.string()).optional(),
  },
  async ({ verdict, riskScore, flags = [] }) => {
    const scoreRange =
      riskScore <= 30 ? `${riskScore}/100 — LOW risk (0–30). Normal on-chain behaviour, no significant red flags.` :
      riskScore <= 60 ? `${riskScore}/100 — MEDIUM risk (31–60). Some caution signals, not definitively malicious.` :
                        `${riskScore}/100 — HIGH risk (61–100). Serious fraud, scam, or money-laundering indicators.`;

    const lines = [
      "── XRPL Risk Score Explained ───────────────────", "",
      `Verdict:    ${verdict}`,
      `Risk Score: ${scoreRange}`, "",
      "── What the verdict means ──────────────────────",
      { ALLOW: "ALLOW — Safe to transact.", CHALLENGE: "CHALLENGE — Do additional verification first.", BLOCK: "BLOCK — Do not transact. High probability of fraud." }[verdict],
    ];

    if (flags.length > 0) {
      lines.push("", "── Flag explanations ───────────────────────────");
      for (const f of flags) { lines.push(`• ${f}`, `  → ${explainFlag(f)}`); }
    }

    lines.push("", "── Recommended action ──────────────────────────", actionForVerdict(verdict, riskScore));
    lines.push("", "── 23 signals checked ──────────────────────────",
      "Account age, balance, velocity, counterparty diversity, offer cancel ratio,",
      "wash trading, fan-out, dormancy, round number bias, bot timing, rapid outflow,",
      "OFAC sanctions (Chainalysis), known scam database, NFT offer dump, memo phishing.",
      "", "Source: xrplriskscore.ai  |  XRPL Mainnet data"
    );
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── Tool 4: check_xrpl_rwa_compliance ───────────────────────
server.tool(
  "check_xrpl_rwa_compliance",
  "Check if an XRPL wallet is compliant for Real World Asset (RWA) interactions — RLUSD holdings, trustlines, compliance score. Returns COMPLIANT / REVIEW / NON_COMPLIANT.",
  { walletAddress: z.string().describe("XRPL wallet address (starts with r)") },
  async ({ walletAddress }) => {
    if (!walletAddress?.startsWith("r") || walletAddress.length < 25) {
      return { content: [{ type: "text", text: "❌ Invalid XRPL wallet address." }] };
    }
    let data;
    try { data = await apiFetch(`/demo/rwa-check/${encodeURIComponent(walletAddress)}`); }
    catch (err) { return { content: [{ type: "text", text: `❌ RWA check unavailable: ${err.message}` }] }; }
    if (data.error) return { content: [{ type: "text", text: `❌ ${data.error}` }] };

    const vdict = data.complianceVerdict ?? data.verdict;
    const banner =
      vdict === "COMPLIANT"     ? "✅ COMPLIANT — Configured for RWA interactions." :
      vdict === "NON_COMPLIANT" ? "🚫 NON_COMPLIANT — Not suitable for RWA interactions." :
                                  "⚠️  REVIEW — Manual review recommended.";
    const rwa  = data.rwaActivity ?? {};
    const sigs = data.complianceSignals ?? {};
    const flags = data.flags ?? [];
    const lines = [
      banner, "",
      `Wallet:           ${data.wallet}`,
      `Compliance Score: ${data.complianceScore ?? "?"}/100`,
      `Verdict:          ${vdict}`, "",
      "── RWA Activity ────────────────────────────────",
      `RWA transactions:   ${rwa.rwaTransactionCount ?? 0}`,
      `Unique RWA issuers: ${rwa.uniqueRwaIssuers    ?? 0}`,
      `Holds RLUSD:        ${rwa.holdsRlusd ? `yes (${rwa.rlusdBalance} RLUSD)` : "no"}`, "",
      "── Account Signals ─────────────────────────────",
      `Account age:   ${sigs.accountAgeDays ?? "?"} days`,
      `Has domain:    ${sigs.hasDomain     ?? "?"}`,
      `Has trustlines:${sigs.hasTrustlines ?? "?"}  (${sigs.trustlineCount ?? 0} total)`,
      `Balance:       ${sigs.balanceXRP    ?? "?"} XRP`,
    ];
    if (flags.length > 0) { lines.push("", "── Flags ───────────────────────────────────────"); flags.forEach(f => lines.push(`  • ${f}`)); }
    if (data.summary) lines.push("", "── Summary ─────────────────────────────────────", data.summary);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── Tool 5: check_xrpl_credential_eligibility ───────────────
server.tool(
  "check_xrpl_credential_eligibility",
  "Screen an XRPL wallet for eligibility to receive a Permissioned Domain credential (XLS-80d). Returns CREDENTIAL_READY / REVIEW_REQUIRED / CREDENTIAL_DENIED.",
  { walletAddress: z.string().describe("XRPL wallet address (starts with r)") },
  async ({ walletAddress }) => {
    if (!walletAddress?.startsWith("r") || walletAddress.length < 25) {
      return { content: [{ type: "text", text: "❌ Invalid XRPL wallet address." }] };
    }
    let data;
    try { data = await apiFetch(`/demo/credential-check/${encodeURIComponent(walletAddress)}`); }
    catch (err) { return { content: [{ type: "text", text: `❌ Service unavailable: ${err.message}` }] }; }
    if (data.error) return { content: [{ type: "text", text: `❌ ${data.error}` }] };

    const banners = {
      CREDENTIAL_READY:  "✅ CREDENTIAL_READY — Meets institutional standards for credential issuance.",
      REVIEW_REQUIRED:   "⚠️  REVIEW_REQUIRED — Manual review recommended before issuing.",
      CREDENTIAL_DENIED: "🚫 CREDENTIAL_DENIED — Do not issue a credential to this wallet.",
    };
    return { content: [{ type: "text", text: [
      banners[data.verdict] ?? data.verdict, "",
      `Wallet:  ${data.wallet}`,
      `Verdict: ${data.verdict}`,
      "",
      "(Demo mode — full credential score with behavioral checks requires a paid call)",
      "Use /credential-check/{wallet} — 0.5 XRP via x402",
    ].join("\n") }] };
  }
);

// ── Tool 6: check_xrpl_escrow_counterparty ──────────────────
server.tool(
  "check_xrpl_escrow_counterparty",
  "Screen an XRPL wallet as a potential escrow counterparty (XLS-85 Token Escrow). Returns ESCROW_SAFE / ESCROW_REVIEW / ESCROW_DENIED. Use before locking funds in escrow.",
  { walletAddress: z.string().describe("XRPL wallet address (starts with r)") },
  async ({ walletAddress }) => {
    if (!walletAddress?.startsWith("r") || walletAddress.length < 25) {
      return { content: [{ type: "text", text: "❌ Invalid XRPL wallet address." }] };
    }
    let data;
    try { data = await apiFetch(`/demo/escrow-check/${encodeURIComponent(walletAddress)}`); }
    catch (err) { return { content: [{ type: "text", text: `❌ Service unavailable: ${err.message}` }] }; }
    if (data.error) return { content: [{ type: "text", text: `❌ ${data.error}` }] };

    const banners = {
      ESCROW_SAFE:   "✅ ESCROW_SAFE — Clean escrow profile, suitable counterparty.",
      ESCROW_REVIEW: "⚠️  ESCROW_REVIEW — Proceed with caution, manual review recommended.",
      ESCROW_DENIED: "🚫 ESCROW_DENIED — Do not lock funds in escrow with this wallet.",
    };
    return { content: [{ type: "text", text: [
      banners[data.verdict] ?? data.verdict, "",
      `Wallet:  ${data.wallet}`,
      `Verdict: ${data.verdict}`,
      "",
      "(Demo mode — full escrow risk profile with completion rate requires a paid call)",
      "Use /escrow-check/{wallet} — 0.5 XRP via x402",
    ].join("\n") }] };
  }
);

// ── Tool 7: list_xrpl_risk_endpoints ────────────────────────
server.tool(
  "list_xrpl_risk_endpoints",
  "List all available xrplriskscore.ai API endpoints with pricing. Use when the user asks what endpoints exist.",
  {},
  async () => ({ content: [{ type: "text", text: [
    "── xrplriskscore.ai Endpoints ──────────────────────────────",
    "",
    "PAID (x402 protocol — no subscription, pay per call):",
    "  GET  /score/{wallet}            1.0 XRP  — 23-signal risk score",
    "  GET  /prescore/{wallet}         0.1 XRP  — 3-signal fast pre-check",
    "  GET  /rwa-check/{wallet}        0.5 XRP  — RWA compliance check",
    "  GET  /credential-check/{wallet} 0.5 XRP  — Credential eligibility (XLS-80d)",
    "  GET  /escrow-check/{wallet}     0.5 XRP  — Escrow screening (XLS-85)",
    "  POST /score-batch               8–40 XRP — Batch 1–50 wallets (20% discount)",
    "        Tier S: 1–10  wallets →  8 XRP",
    "        Tier M: 11–25 wallets → 20 XRP",
    "        Tier L: 26–50 wallets → 40 XRP",
    "",
    "FREE demo (verdict only, 3 calls/IP/24h):",
    "  /demo/score /demo/prescore /demo/rwa-check",
    "  /demo/credential-check /demo/escrow-check",
    "",
    "Client:    npm install @xrplriskscore/client",
    "MCP:       npx @xrplriskscore/mcp-setup",
    "OpenAPI:   https://xrplriskscore.ai/openapi.json",
    "Playground:https://xrplriskscore.ai/playground",
  ].join("\n") }] })
);

// ── Tool 8: check_xrpl_compliance_bundle ────────────────────
server.tool(
  "check_xrpl_compliance_bundle",
  "Run a full compliance bundle on an XRPL wallet — combines risk scoring, RWA compliance, and credential eligibility into one call. Returns an overall_verdict of PASS, REVIEW, or BLOCK plus the full results of all three checks. Use this before onboarding a wallet, before releasing funds, or any time you need a complete picture of a wallet's compliance status. Costs 3 XRP via x402 on the paid tier.",
  { walletAddress: z.string().describe("XRPL wallet address to check (starts with r)") },
  async ({ walletAddress }) => {
    if (!walletAddress?.startsWith("r") || walletAddress.length < 25) {
      return { content: [{ type: "text", text: "❌ Invalid XRPL wallet address. Must start with 'r' and be 25-35 characters." }] };
    }

    let data;
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
    try {
      const res = await fetch(`${BASE_URL}/compliance-bundle`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({ wallet: walletAddress }),
        signal:  ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      data = await res.json();
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Compliance bundle unavailable: ${err.message}` }] };
    } finally {
      clearTimeout(timer);
    }

    if (data.error) return { content: [{ type: "text", text: `❌ ${data.error}` }] };

    const banner =
      data.overall_verdict === "PASS"   ? "✅ PASS — All compliance checks cleared for this wallet." :
      data.overall_verdict === "REVIEW" ? "⚠️ REVIEW — One or more checks need attention before proceeding." :
      data.overall_verdict === "BLOCK"  ? "🚫 BLOCK — This wallet failed compliance checks. Do not proceed." :
                                          `Overall verdict: ${data.overall_verdict ?? "?"}`;

    const rs  = data.risk_score             ?? {};
    const rwa = data.rwa_compliance         ?? {};
    const cr  = data.credential_eligibility ?? {};
    const sum = data.summary                ?? {};

    const riskLine =
      rs.error      ? `ERROR — ${rs.message}` :
      rs.riskScore != null
        ? `${rs.riskScore}/100 (${rs.verdict ?? "?"})`
        : (rs.verdict ?? "?");
    const rwaLine =
      rwa.error ? `ERROR — ${rwa.message}` :
      (rwa.complianceVerdict ?? rwa.verdict ?? "?");
    const credVerdict   = cr.verdict;
    const credEligible  = cr.error ? null : credVerdict === "CREDENTIAL_READY";
    const credLine =
      cr.error             ? `ERROR — ${cr.message}` :
      credEligible === null ? (credVerdict ?? "?") :
                               `eligible ${credEligible ? "true" : "false"} (${credVerdict ?? "?"})`;

    const lines = [
      banner, "",
      `Wallet:                ${data.wallet}`,
      `Overall Verdict:       ${data.overall_verdict ?? "?"}`,
      `Checks Passed:         ${sum.checks_passed ?? 0}/${sum.checks_total ?? 3}`,
      "",
      "── Results ─────────────────────────────────────",
      `Risk Score:            ${riskLine}`,
      `RWA Compliance:        ${rwaLine}`,
      `Credential Eligibility: ${credLine}`,
    ];

    if (data.timestamp) lines.push("", `Generated at: ${data.timestamp}`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── Tool 9: provision_xrpl_wallet ───────────────────────────
server.tool(
  "provision_xrpl_wallet",
  "Generate a fresh XRPL wallet keypair instantly via x402. Returns the wallet address, seed, and public key in one call. You fund the 2 XRP mainnet reserve yourself from any wallet or exchange. Costs 1 XRP via x402. The seed is shown only once — store it immediately.",
  {
    confirmStore: z.boolean().describe("Must be true — confirms the caller understands the seed will be shown only once and must be stored securely before calling this tool"),
  },
  async ({ confirmStore }) => {
    if (confirmStore !== true) {
      return { content: [{ type: "text", text: "⚠️ Safety check required: Set confirmStore to true to confirm you understand the wallet seed will be shown only once and must be stored securely immediately." }] };
    }

    let data;
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
    try {
      const res = await fetch(`${BASE_URL}/provision-wallet`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({}),
        signal:  ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      data = await res.json();
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Provisioning failed: ${err.message}` }] };
    } finally {
      clearTimeout(timer);
    }

    if (data.error) return { content: [{ type: "text", text: `❌ Provisioning failed: ${data.error}` }] };

    const w   = data.wallet   ?? {};
    const ins = data.instructions ?? {};

    const lines = [
      "✅ Fresh XRPL Wallet Generated", "",
      "⚠️ STORE THIS SEED NOW — shown only once.", "",
      `Address: ${w.address   ?? "?"}`,
      `Seed: ${w.seed      ?? "?"}`,
      `Public Key: ${w.publicKey ?? "?"}`,
    ];

    if (ins.activation) lines.push("", `Next: ${ins.activation}`);
    if (ins.nextStep)   lines.push("", ins.nextStep);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("XRPL Risk Scorer MCP Server running — 9 tools available");
