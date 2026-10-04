---
name: yandex-webmaster
description: Fetch, normalize, cache, and inspect Yandex Webmaster search-performance data through the API. Use when Codex needs to configure or verify local Yandex OAuth access, list accessible hosts, analyze clicks/impressions/CTR/average position by date or popular query, compare device segments or periods, replace manual exports, or supply reproducible Yandex evidence to SEO automations across multiple websites.
---

# Yandex Webmaster

## Overview

Use the bundled dependency-free Node.js CLI for every Yandex Webmaster API operation. This skill is read-only and supports host discovery, search performance history, popular-query evidence, device comparisons, structured availability states, and reproducible JSON snapshots.

## Privacy model

Require each user to create their own Yandex OAuth application; never distribute shared OAuth credentials with this skill. Keep OAuth client credentials, renewable tokens, aliases, and snapshots outside repositories under `~/.config/codex-yandex-webmaster` and `~/.local/share/codex-yandex-webmaster` by default. Treat host identifiers, queries, and metrics as private business data.

## Requirements

- Node.js 22 or newer.
- A Yandex account with Webmaster host access.
- A user-owned Yandex OAuth application with the required Webmaster permissions.

## Setup

Resolve `SKILL_DIR` to the absolute directory containing this `SKILL.md`; do not assume the user's current working directory is the skill directory. Run commands as `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" ...`.

Read [references/oauth-setup.md](references/oauth-setup.md), then run:

```bash
node "$SKILL_DIR/scripts/yandex-webmaster.mjs" configure --from-env
node "$SKILL_DIR/scripts/yandex-webmaster.mjs" doctor
node "$SKILL_DIR/scripts/yandex-webmaster.mjs" auth
```

## Workflow

1. Always run `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" doctor` before querying.
2. If `ready` is false, do not run data commands. Read [references/oauth-setup.md](references/oauth-setup.md), explain each reported blocker, and guide the user through creating their own Yandex OAuth application. Never ask the user to paste a client secret, confirmation code, or token into chat.
3. Pause while the user completes the Yandex OAuth steps. After they confirm the application exists, import its protected client configuration with `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" configure --from-env` or `--input`, then run `auth` interactively. Rerun `doctor` and require `ready: true`. Never start the confirmation-code flow from unattended automation.
4. Run `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" hosts` and preserve the exact `hostId` returned by the API.
5. Add a stable alias when useful: `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" alias --name example --host https:example.com:443`.
6. For repeatable analysis, prefer a snapshot:

   `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" snapshot --host example --days 28`

7. Read the emitted snapshot path and report its `source`, `fetchedAt`, host, requested and returned periods, device type, availability state, and row counts. Read [references/output-schema.md](references/output-schema.md) before interpreting or transforming snapshot data.

## Commands

- `doctor`: inspect client/token readiness without revealing secrets.
- `configure`: securely copy `{ "client_id", "client_secret" }` from `--input FILE`, or import `YANDEX_CLIENT_ID` and `YANDEX_CLIENT_SECRET` with `--from-env`.
- `auth`: perform the one-time browser confirmation-code flow with PKCE. The authorization URL intentionally omits `scope`, so Yandex uses permissions registered for the app.
- `refresh`: force a refresh-token exchange, persist a rotated refresh token, and print only expiry metadata.
- `hosts`: list exact Yandex `hostId` values, URLs, verification state, and data status.
- `alias`: save a local alias for an exact host ID.
- `query`: fetch `summary`, `date`, or `query` data; use `--start-date`, `--end-date`, `--days`, `--end-lag`, `--device-type`, `--order-by`, `--max-rows`, and `--output` as needed.
- `snapshot`: fetch aggregate summary, daily history, and Top query rows into one versioned JSON snapshot.
- `snapshots`: list the latest local snapshot pointers without requiring a known host ID.
- `latest`: locate the last successful or structured-empty local snapshot for a host.

Run `node "$SKILL_DIR/scripts/yandex-webmaster.mjs" help` for complete flags.

## Output

Snapshots record the exact host identity, requested and returned periods, device type, availability state, normalized datasets, row counts, pagination, truncation, and completeness. Use `summary` for authoritative totals. Read [references/output-schema.md](references/output-schema.md) before interpreting or transforming snapshot data.

## Data limitations

- Default to the 28-day window ending two UTC days ago. Yandex does not expose a finalized-data flag; report the requested and API-returned periods separately.
- Use daily all-query history for authoritative aggregate clicks, impressions, CTR, and impression-weighted average show position.
- Treat popular-query rows as Top-row evidence, not a complete census. Never sum them and present the result as an authoritative host total.
- Yandex exposes no landing-page performance dimension comparable to Search Console. Do not infer query-to-page attribution.
- Preserve exact `hostId` values. Do not silently replace them with display URLs.
- `MOBILE_AND_TABLET` overlaps `MOBILE` and `TABLET`. Never sum overlapping device segments.
- Treat `HOST_NOT_LOADED` and `HOST_NOT_INDEXED` snapshots as valid structured empty states, not zero-performance proof.
- Cache a daily snapshot and avoid repeatedly requesting the same host and window.
- Never print client secrets, access tokens, refresh tokens, or confirmation codes.
- Never commit OAuth files, tokens, aliases containing private host names, or raw snapshots to a repository.

## Automation Fallback

For unattended jobs, use this order:

1. Fresh API snapshot created during the current run.
2. `latest` successful API snapshot, explicitly marked stale with its fetch time.
3. Existing manual export, explicitly marked with its path and age.
4. No-op when the available evidence is too stale, unavailable, or weak.

Do not claim live Yandex data unless the current API request succeeded. Do not launch `auth` from an unattended run.

## Troubleshooting

- If `doctor` reports unsafe permissions or repository paths, move credentials outside Git and set mode `0600` on macOS or Linux.
- If authorization fails, verify the registered confirmation-code redirect URI and Webmaster permissions, then repeat `auth` interactively.
- If data is structurally empty, report `HOST_NOT_LOADED` or `HOST_NOT_INDEXED`; do not convert it into zero performance.
- If device totals appear inconsistent, check for the documented overlap between `MOBILE_AND_TABLET`, `MOBILE`, and `TABLET`.
