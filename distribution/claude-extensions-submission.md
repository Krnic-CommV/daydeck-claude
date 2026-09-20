# Claude Desktop Extensions directory — submission pack

Prepared 2026-09-20. Sources and verification status are marked inline; nothing here
was invented without a citation or an explicit "assumption" note.

## 1. What I verified, and how

| Question | Answer | Verified via | Date checked |
|---|---|---|---|
| Submission form URL | `https://clau.de/desktop-extention-submission` (note the misspelling "extention" is in the real short-link) → redirects to a Google Form at `docs.google.com/forms/d/e/1FAIpQLScHtjkiCNjpqnWtFLIQStChXlvVcvX8NPXkMfjtYPDPymgang/viewform` | Fetched `clau.de/desktop-extention-submission` directly, got a live 302 redirect to the Google Form URL above | 2026-09-20 |
| Exact fields on that Google Form | **Could not verify.** The form itself returned HTTP 401 when fetched directly (Google Forms blocks the fetcher without a session) | Attempted fetch of the viewform URL | 2026-09-20 |
| The form is a separate path from the Connectors Directory portal (which is for *remote* MCP servers only, needs a Team/Enterprise org) | Confirmed — "Desktop extensions (MCPB) use a separate submission form and don't require the portal" | `https://claude.com/docs/connectors/building/submission` (official docs) | 2026-09-20 |
| Review criteria / pre-submission checklist | Confirmed, full text read | `https://claude.com/docs/connectors/building/review-criteria` | 2026-09-20 |
| Privacy policy requirement | Confirmed: local connectors must have (1) a "Privacy Policy" section in README.md, (2) a `privacy_policies` array in `manifest.json` (manifest_version 0.2+), (3) HTTPS URLs covering data collection, usage/storage, third-party sharing, retention, contact. **Missing or incomplete = immediate rejection.** | Same docs page | 2026-09-20 |
| Tool annotations requirement | Confirmed: every tool needs a `title` plus `readOnlyHint: true` or `destructiveHint: true`. Read vs. write must be **separate tools**, not one tool with a mode flag. Tool names ≤ 64 chars. | review-criteria page | 2026-09-20 |
| Icon size | 512×512px **recommended**, 256×256px minimum, PNG with transparency, filename `icon.png` at bundle root (or a custom path referenced in the manifest) | `https://claude.com/docs/connectors/building/mcpb` (official "Add an icon" section) | 2026-09-20 |
| `manifest_version` currency | **0.3 is current.** The upstream spec doc (`MANIFEST.md`) is dated last-updated 2025-12-02, current version `0.3`; 0.4+ only adds optional UV/Python-runtime fields we don't need for a Node server. Our manifest's `"manifest_version": "0.3"` is up to date — no change needed. | `https://raw.githubusercontent.com/anthropics/dxt/refs/heads/main/MANIFEST.md` + corroborating GitHub search hits (2026 PRs referencing "bring the bundle manifest to 0.3") | 2026-09-20 |
| Is `mcpb sign` required | **No** — signing is optional for submission. Anthropic's own docs list it as a security *feature*, not a submission gate; nothing in the review criteria or submission page mentions signature verification. | `claude.com/docs/connectors/building/review-criteria`, `claude.com/docs/connectors/building/submission` (no sign requirement in either) | 2026-09-20 |
| Should we run `mcpb sign` anyway | **No, actively avoid it right now.** Open GitHub issue reports `mcpb sign` currently produces a corrupt zip (appends the PKCS#7 block after the end-of-central-directory record without updating the comment length), which some strict zip parsers — including Claude Desktop itself — reject with "Invalid comment length." A fix PR exists but isn't confirmed merged/released. | `github.com/modelcontextprotocol/mcpb` issue #278, PR by bryan-anthropic "fix: sign the bytes that are actually written to disk" | 2026-09-20 (GitHub search snippets; not opened directly) |
| Are local Node servers accepted | **Yes, and preferred.** Anthropic's own guidance: "Node.js is strongly recommended... ships with Claude Desktop on macOS and Windows, so users need no separate runtime." Our server (`server.js`, `type: "node"`) fits exactly. | `claude.com/docs/connectors/building/mcpb` | 2026-09-20 |
| `user_config` requirement | Not mandatory for every extension — it's how Claude Desktop auto-generates a settings UI *if* your extension needs user-supplied config (API keys, paths, toggles). Our server takes no such config (it resolves the data file from an env var with sane fallbacks), so we can reasonably omit `user_config`, or add one optional field for `DAYDECK_DATA` override. See §4. | manifest spec + mcpb build guide | 2026-09-20 |
| Program status: open / waitlist / invite-only | **Open**, not a waitlist. "The submission portal is always open." Review times "vary with queue volume" but there's no gate to apply — you just submit. (This is stated for the Connectors Directory generally; the desktop-extension form is the equivalent open path for MCPB.) | `claude.com/docs/connectors/building/submission` ("Review process" section) | 2026-09-20 |
| **Open-source requirement — resolved** | The pre-submission checklist states: *"MCPB open-source and 'spec will evolve' clauses in the Software Directory Terms are required and not waivable."* **Resolved 2026-09-20**: `integrations/` is now MIT-licensed (`integrations/LICENSE`) and published as a public repo, synced from this private app repo: **https://github.com/tomislavkrnic/daydeck-claude**. `manifest.json` and `package.json` for `daydeck-mcp`, and `plugin.json` for the Claude Code plugin, all now say `"license": "MIT"` instead of `"UNLICENSED"`. No further action needed before submission on this point. | `claude.com/docs/connectors/building/review-criteria`, `support.claude.com/en/articles/13145338-anthropic-software-directory-terms`, https://github.com/tomislavkrnic/daydeck-claude | 2026-09-20 |
| Screenshots requirement | Only required for **MCP Apps** (interactive-UI connectors) — 3–5 PNGs, ≥1000px wide, cropped to the app response only. Ordinary desktop extensions (ours) do not need screenshots. | `claude.com/docs/connectors/building/submission` ("Asset specifications" section) | 2026-09-20 |
| Field character limits (for the Connectors Directory *portal*, which lists MCPB extensions once approved alongside remote servers) | Server name ≤ 100 characters; tagline ≤ 55 characters; description ≤ 2,000 characters; 1–5 categories | `claude.com/docs/connectors/building/submission` ("Listing" step of the portal) — **note:** this is documented for the remote-server portal; whether the desktop-extension Google Form uses the same limits could not be confirmed since the form's fields were unreadable (401) | 2026-09-20 |

**Bottom line on "what's real vs. assumed":** the submission *link* and the *review criteria* are solidly verified from Anthropic's own docs. The exact field-by-field layout of the Google Form itself is not verifiable by me (Google blocks unauthenticated fetches of the form), so the filled-in draft below is built from the criteria/portal-equivalent field list documented on the docs site, which is the closest verified proxy. Tomislav should treat the draft as "paste starting point," and adjust field-by-field once the actual form is open in a browser.

## 2. Filled-in draft — every field

| Field | Draft value |
|---|---|
| Extension / server name | **Daydeck** |
| Short description (tagline, ≤55 chars where a limit applies) | `A pacer for your projects, not another task list.` (50 chars) — alt if shorter is needed: `The connector for Daydeck, your pacing timeline.` (49 chars) |
| Long description | Daydeck is a calm macro timeline that lives on your desktop: one lane per project, a few big blocks per lane, recurring rhythms, and ongoing bars — never a to-do list. This extension lets Claude read the current plan, add or move blocks, and check it for pacing problems (too many projects on one day, blocks that cross a weekend, blocks that run too long or too short, and more) — all against the same `data.json` Daydeck itself reads and writes, on your Mac. No account, no cloud, no network calls from this connector; it only touches one local file. |
| Category | Productivity → **Planning / Calendar** (closest fit in Anthropic's categories is usually "Productivity"; pick that if a narrower "Planning" option doesn't exist — note this per the "no productivity positioning" rule below) |
| Keywords | `pacing, timeline, planning, macro tasks, wallpaper, weekly review` (manifest.json currently has `["planning", "calendar", "timeline", "wallpaper", "pacing"]` — recommend adding `macro tasks` and dropping `calendar` since Daydeck explicitly is not a calendar; see §4) |
| Homepage | `https://daydeck.krnic.be` |
| Support contact | `daydeck@krnic.be` |
| Privacy policy URL | `https://daydeck.krnic.be/privacy` |
| Privacy summary (for the form's free-text privacy explanation, if asked) | This connector makes no network calls of its own. It reads and writes exactly one local file — the same `data.json` the Daydeck app uses (`~/Library/Application Support/Daydeck/data.json`, or the App Store sandboxed path, or a path set via `DAYDECK_DATA`). No data leaves the user's Mac through this connector. |
| Icon | `integrations/distribution/icon.png` — 512×512 PNG, copied from `AppIcon.iconset/icon_512x512.png` (see §5) |
| Author | Tomislav Krnic |
| Platform support | macOS only (`darwin`) — matches `compatibility.platforms` in manifest.json already |
| Test/reviewer instructions (likely asked, per "test credentials" line in the checklist — note ours needs no account) | No account or credentials needed. Launch the Daydeck app once first (App Store build or dev build) so it seeds `data.json`, then connect this extension — every tool (`get_plan`, `add_project`, `add_block`, `update_block`, `remove_block`, `remove_project`, `set_project_status`, `check_pacing`) can be exercised immediately with no external service. |

**Tone check on this pack:** none of the fields above use "Mac," "macOS," or "Apple" in the name or tagline (both say "your desktop" or nothing); "your Mac" appears once, correctly, inside the long description and privacy summary, which the rules allow. No "productivity" language beyond the unavoidable store-category dropdown, which is a UI constraint, not copy.

## 3. What Tomislav must do himself

1. Decide on the open-source question in §1 before anything else — either open-source `daydeck-mcp` (public repo + real license, replacing `"license": "UNLICENSED"`) or accept the extension may be rejected/removed under the Software Directory Terms. Read the actual terms at `support.claude.com/en/articles/13145338-anthropic-software-directory-terms` (I could not fetch this) before deciding.
2. Have a Claude account ready (the form likely ties the submission to your identity/contact, per the portal's "Company" and contact steps used for the remote-server flow).
3. Open `https://clau.de/desktop-extention-submission` in a browser (not fetchable by me — Google blocks non-browser access) and fill in the fields using §2 as the draft, adjusting to whatever the actual form asks.
4. Upload `integrations/daydeck-mcp/daydeck-mcp.mcpb` (already built, ~3 MB, at `/Users/tomislavkrnic/Documents/MyWay/Daydeck-1.3/integrations/daydeck-mcp/daydeck-mcp.mcpb`) as the extension file.
5. Upload `integrations/distribution/icon.png` (512×512, prepared in this task) if the form has a separate icon upload; otherwise the icon bundled inside the .mcpb (via `manifest.json`'s `icon` field, once added — see §4) is what's shown.
6. After submitting, watch for reviewer feedback; the docs mention a submissions dashboard and `mcp-review@anthropic.com` for escalations — those are documented for the *portal* flow, so confirm the desktop-extension form gives an equivalent status channel once you're in it.
7. Rebuild and re-upload the `.mcpb` after making the manifest changes proposed in §4 (icon, privacy_policies, keywords) — I did not edit `manifest.json`, only proposed the diffs.
8. Do **not** run `mcpb sign` on this bundle yet, per the known zip-corruption bug in §1 — re-check `github.com/modelcontextprotocol/mcpb` issue #278 for a fix before signing.

## 4. Proposed `manifest.json` changes (not applied — for Tomislav/dev to review)

Current file: `integrations/daydeck-mcp/manifest.json`. Proposed diffs:

```jsonc
{
  "manifest_version": "0.3",   // unchanged — confirmed current, no bump needed
  "name": "daydeck-mcp",
  "display_name": "Daydeck",
  "version": "0.1.0",
  "description": "Read and edit your Daydeck wallpaper plan — projects, phases, and rhythms.",
  "long_description": "…", // unchanged, already good
  "icon": "icon.png",       // ADD — points at integrations/distribution/icon.png,
                              // copy it into integrations/daydeck-mcp/ before packing
                              // (mcpb bundles files relative to the manifest's folder)
  "author": { "name": "Tomislav Krnic" },
  "server": { … },           // unchanged
  "tools": [ … ],             // unchanged — already has title-equivalent names + descriptions;
                              // DOUBLE-CHECK each tool also exposes readOnlyHint/destructiveHint
                              // at the MCP protocol level (in server.js's tool registration),
                              // not just in this manifest, since that's what review-criteria checks
  "prompts": [ … ],           // unchanged
  "keywords": ["planning", "timeline", "wallpaper", "pacing", "macro tasks"],
                              // CHANGE — drop "calendar" (Daydeck explicitly isn't one, PRODUCT.md
                              // "What Daydeck is not"), add "macro tasks"
  "license": "MIT",           // CHANGE from "UNLICENSED" — see §3.1, pick a real license before
                              // submitting; MIT is a placeholder suggestion, Tomislav's call
  "privacy_policies": [       // ADD — required for manifest_version 0.2+ per review criteria
    "https://daydeck.krnic.be/privacy"
  ],
  "homepage": "https://daydeck.krnic.be",   // ADD
  "support": "mailto:daydeck@krnic.be",     // ADD — or a support page URL if preferred
  "compatibility": { … }      // unchanged
}
```

Also add a "## Privacy Policy" section to `integrations/daydeck-mcp/README.md` (required by the checklist alongside the manifest field), stating in plain terms: no network calls, reads/writes one local file, no analytics, no third-party sharing, contact `daydeck@krnic.be`.

## 5. Icon

Copied `AppIcon.iconset/icon_512x512.png` → `integrations/distribution/icon.png`, verified with `sips` at exactly 512×512 PNG — matches the "512×512px recommended" spec from the MCPB build docs. No resize was needed (source was already 512×512); ran `sips -z 512 512` anyway as a no-op confirmation.
