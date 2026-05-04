# silver-tokens

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Open Silver](https://img.shields.io/badge/open-silver.dev-silver)](https://open.silver.dev)

> AI usage tracker for [Silver.dev](https://silver.dev) candidates.
> Read your token usage from Claude Code, Codex, and OpenCode — get a
> proficiency scorecard you can share with Silver's clients.

`silver-tokens` measures **how AI-fluent a developer is**, not just how
many tokens they burned. It reads your local AI coding logs via a one-shot
[MCP](https://modelcontextprotocol.io) command, sanitizes content on your
machine, and produces a portable scorecard.

**Live at:** [tokens.silver.dev](https://tokens.silver.dev) (coming soon)

## Why

Token spend is becoming a hiring signal. Most existing trackers (ccusage,
codeburn, tokscale) were built for personal cost monitoring. Silver places
LatAm engineers at US clients who are increasingly asking: *"How do I know
this candidate is good with AI?"*

Raw token spend is gameable. We measure things that aren't:

- **Cache hit rate** — proficient users iterate, not restart from scratch
- **Model mix** — Haiku/Sonnet for routine, Opus where it matters
- **Tool-call distribution** — Read+Grep before Edit means context, not vibes
- **Session shape** — sustained focus vs. scattered bursts

## How it works

1. Candidate visits `tokens.silver.dev`, signs in with GitHub
2. Gets a single-use, 1-hour TTL token
3. Runs ONE command in their CLI:

   ```bash
   # Claude Code
   claude mcp add --scope user --transport http \
     silver https://mcp.silver.dev/u/<TOKEN>
   ```

4. Asks the agent: `/mcp__silver__track`
5. The local CLI reads its own logs, sanitizes them, uploads counts.
   No software installed. No code or prompts leave the machine.
6. Scorecard appears at `tokens.silver.dev/me`

For Codex CLI and OpenCode, see [docs/onboarding.md](./docs/onboarding.md).

## What we read vs. what leaves your machine

| Read locally | Sent to Silver |
|---|---|
| ✅ Token counts (input/output/cache) | ✅ Token counts |
| ✅ Model name, timestamp, session UUID | ✅ Same |
| ✅ Tool names (`Read`, `Edit`, `Bash`) | ✅ Tool **names** only |
| ✅ Project path, prompts, code, tool inputs | ❌ **Never uploaded** |

Sanitization happens in the MCP tool that runs in your CLI, **before** any
HTTP call. Project paths are SHA-256 hashed (basename only). The full spec
is in [docs/privacy.md](./docs/privacy.md). Server code is open source —
audit what `submit_usage` accepts before running it.

## Supported tools

| CLI | Status | Coverage |
|---|---|---|
| Claude Code | ✅ Full | Histórico desde primera sesión |
| OpenAI Codex CLI | ✅ Full | Sesiones desde 2025-09-06 (commit 0269096) |
| OpenCode (sst/opencode) | ✅ Full | JSON legacy + SQLite |
| Cursor, Aider, Cline, Gemini CLI | 🔜 v2 | PRs welcome |
| Claude Desktop / claude.ai web | ❌ Out of scope | No local token data |

## Architecture

```
┌──────────────────────┐        ┌─────────────────────┐
│ tokens.silver.dev    │  HTTPS │ Candidate's CLI     │
│ (Next.js)            │◄──────►│ (Claude Code/Codex/ │
│  - GitHub OAuth      │        │  OpenCode)          │
│  - Token issuance    │        └──────────┬──────────┘
│  - Scorecard UI      │                   │
└──────────┬───────────┘                   │ MCP / HTTP
           │                               ▼
           │                  ┌─────────────────────┐
           │                  │ mcp.silver.dev      │
           ▼                  │  (MCP server)       │
┌──────────────────────┐      │  - submit_usage     │
│ Postgres (Neon)      │◄─────┤  - re-aggregate     │
│  - users, scorecards │      │  - sanitize check   │
│  - raw events (TTL)  │      └─────────────────────┘
└──────────────────────┘
```

Full diagrams in [docs/architecture.md](./docs/architecture.md).

## Local development

Requires Bun ≥1.2, Node ≥20, Postgres (Neon free tier works).

```bash
git clone https://github.com/silver-dev-org/silver-tokens
cd silver-tokens
bun install
cp .env.example .env       # fill DATABASE_URL, GITHUB_OAUTH_*
bun db:push
bun dev                     # web on :3000, mcp on :3001
```

Test the MCP server end-to-end against your own Claude Code:

```bash
claude mcp add --transport http silver-local http://localhost:3001/u/test
```

## Credits

- Claude Code parser wraps [`ccusage`](https://github.com/ryoppippi/ccusage)
  by [@ryoppippi](https://github.com/ryoppippi) (MIT). The single best
  reference for AI-CLI usage parsing.
- Codex and OpenCode parsers are adapted from `@ccusage/codex` and
  `@ccusage/opencode` (MIT). Attribution preserved in source headers.
- Pricing data via [LiteLLM](https://github.com/BerriAI/litellm) snapshot.
- Inspired by Pragmatic Engineer's "Tokenmaxxing" coverage — particularly
  the observation that raw token spend is a vanity metric.

## Contributing

Issues and PRs welcome. This is part of [Open Silver](https://open.silver.dev).
Conventional commits, scope by package: `feat(mcp):`, `fix(parsers):`.

## License

MIT — see [LICENSE](./LICENSE).

---

Made with care by [Silver.dev](https://silver.dev) and contributors.

¿Sos candidato de Silver y querés ver tu scorecard? → [tokens.silver.dev](https://tokens.silver.dev)
