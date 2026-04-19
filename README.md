# @xrplriskscore/mcp

MCP (Model Context Protocol) server for [xrplriskscore.ai](https://xrplriskscore.ai). Exposes XRPL wallet risk scoring, RWA compliance checks, and escrow counterparty analysis as tools for Claude Desktop, Cline, and other MCP-compatible AI clients.

The server scores and informs — it does not approve or execute transactions. That decision stays with the agent or human.

## Quick start (Claude Desktop)

Run this once:

    npx -p @xrplriskscore/mcp xrplriskscore-mcp-setup

Then restart Claude Desktop. The tools will be available in your next conversation.

## Available tools

- `check_xrpl_wallet_risk` — full risk assessment on an XRPL wallet
- `quick_xrpl_prescore` — lightweight pre-transaction score
- `explain_xrpl_risk_score` — human-readable breakdown of a verdict
- `check_xrpl_rwa_compliance` — RLUSD, tokenized asset, and escrow compliance check
- `check_xrpl_credential_eligibility` — XRPL credential-based eligibility check
- `check_xrpl_escrow_counterparty` — counterparty risk analysis for escrow transactions
- `list_xrpl_risk_endpoints` — list all available risk scoring endpoints

Each scoring tool returns a verdict: `ALLOW`, `CHALLENGE`, or `BLOCK`.

## Payment

The free demo tier is enabled by default — good for testing and light use.

For full paid analysis, set the `XRPL_SEED` environment variable and use the [`@xrplriskscore/client`](https://www.npmjs.com/package/@xrplriskscore/client) SDK. Paid requests are settled on XRPL mainnet via the x402 protocol through t54's facilitator.

Paid endpoints:
- `/score` — full risk assessment (1 XRP)
- `/prescore` — lightweight pre-score (0.1 XRP)
- `/rwa-check` — RWA compliance check (0.5 XRP)

## How it works

When a tool is called, the MCP server contacts the xrplriskscore.ai API. For free-tier calls, results return immediately. For paid calls, the client SDK handles the x402 payment flow: HTTP 402 → sign XRPL payment with invoice ID → retry with payment proof → receive scored result.

## Links

- Website: [xrplriskscore.ai](https://xrplriskscore.ai)
- Client SDK: [@xrplriskscore/client](https://www.npmjs.com/package/@xrplriskscore/client)
- Issues: [github.com/kynto2001-ctrl/xrplriskscore-mcp/issues](https://github.com/kynto2001-ctrl/xrplriskscore-mcp/issues)

## License

MIT
