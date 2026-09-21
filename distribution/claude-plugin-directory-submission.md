# Claude plugin directory — submission pack

Prepared 2026-09-21. Same format as `claude-extensions-submission.md`: verified facts
with sources first, then a filled-in draft, then what Tomislav must do himself. Nothing
here was invented without a citation or an explicit "assumption" note.

## 0. Validator run (2026-09-21)

`claude plugin validate` exists (`validate [options] <path> — Validate a plugin or
marketplace manifest`). Ran it against all three relevant targets:

```
$ claude plugin validate integrations/claude-plugin/daydeck        # private repo, plugin dir
Validating plugin manifest: .../Daydeck/integrations/claude-plugin/daydeck/.claude-plugin/plugin.json
✔ Validation passed

$ claude plugin validate /Users/tomislavkrnic/Documents/MyWay/daydeck-claude        # mirror root
Validating marketplace manifest: .../daydeck-claude/.claude-plugin/marketplace.json
✔ Validation passed

$ claude plugin validate /Users/tomislavkrnic/Documents/MyWay/daydeck-claude/claude-plugin/daydeck   # mirror, plugin dir
Validating plugin manifest: .../daydeck-claude/claude-plugin/daydeck/.claude-plugin/plugin.json
✔ Validation passed
```

All three pass. No errors, so no fixes were made to `plugin.json`, `marketplace.json`,
or skill frontmatter.

## 1. What I verified, and how

| Question | Answer | Verified via | Date checked |
|---|---|---|---|
| What the plugin directory is | A community-driven directory of plugins for **Cowork and Claude Code**. In Claude Code it's surfaced as the official **`claude-plugins-official`** marketplace, automatically available to all users. Separate from the Connectors Directory (which is MCP-connector-specific). | `https://claude.com/docs/plugins/submit` (fetched directly) | 2026-09-21 |
| How to submit | "To submit a plugin to the directory, share a GitHub link to your plugin." | Same page, "Submitting your plugin" section | 2026-09-21 |
| Repo visibility requirement | "The repo must be public—closed-source plugins are not accepted." | Same page | 2026-09-21 |
| Pre-submission step | "Before submitting, run `claude plugin validate` to check formatting and structure." | Same page | 2026-09-21 |
| Review time | "Review times vary with queue volume." No fixed SLA published. | Same page | 2026-09-21 |
| Submission forms (two paths) | **claude.ai**: `https://claude.ai/admin-settings/directory/submissions/plugins/new` — requires a Team or Enterprise org with directory management access (Organization Owners have this by default; Enterprise Owners can delegate via a custom role). **Console**: `https://platform.claude.com/plugins/submit` — requires Developer/Admin/Owner role on a Console organization. Individual authors not on a Team/Enterprise org can sign up for Console at `platform.claude.com` and submit there. | Same page, "Before you start" + "Submitting your plugin" sections | 2026-09-21 |
| Status tracking (claude.ai path) | After submitting on claude.ai, the org's **Directory** page (`claude.ai/admin-settings/directory/submissions`) lists submissions with review status. | Same page | 2026-09-21 |
| What happens after publish | "After your plugin is published, updates pushed to your GitHub repo are picked up automatically — CI mirrors changes to the public marketplace and runs automated screening on each update. You do not need to re-submit the form for updates." | Same page | 2026-09-21 |
| Terms that apply | Anthropic Software Directory Terms (`support.claude.com/en/articles/13145338-anthropic-software-directory-terms`) + Anthropic Software Directory Policy (`support.claude.com/en/articles/13145358-anthropic-software-directory-policy`) | Same page, "Directory terms & conditions" | 2026-09-21 |
| Badge system | Two tiers: **community** (default — Anthropic does "basic automated review" before listing) and **Anthropic Verified** (additional quality/safety review). Explicit: "There are no guarantees that any community plugin will become Anthropic Verified." | Same page, "Plugin Directory: Community vs. Anthropic Verified" | 2026-09-21 |
| Form-specific required fields (name char limits, tagline limit, category list, icon spec, etc.) | **Not published on this page.** Unlike the Connectors Directory submission page (which documents server name ≤100 chars, tagline ≤55 chars, description ≤2,000 chars, 1–5 categories), the plugin-submit page gives no field-by-field spec — submission is "share a GitHub link," and the in-app form (behind org auth, not fetchable by me) presumably derives most listing fields from `plugin.json`/`marketplace.json` plus whatever it asks at submit time. Treat §2 below as a content draft to paste into whatever the form asks for, not a confirmed field layout. | `https://claude.com/docs/plugins/submit` (full page read, no such section found) | 2026-09-21 |
| What a good plugin bundles | Skills, MCP connectors (local, remote, or MCPB), slash commands, sub-agents — "solves a specific job function or workflow end-to-end." Daydeck's plugin bundles exactly two of these: a skill and a local MCP connector. | Same page, "What makes a good plugin" | 2026-09-21 |
| Security review note relevant to us | Anthropic explicitly flags that plugins can load local MCP servers and tells reviewers/installers to check "which MCP connectors are included and what permissions they request." Our local-only, no-network, single-file-touching connector is a favorable case to state plainly in the description. | Same page, "Security" section | 2026-09-21 |
| Marketplace name to cite in install instructions | `daydeck` — confirmed from the mirror's actual `.claude-plugin/marketplace.json` (`"name": "daydeck"`), not `daydeck-claude` (that's only the GitHub repo name). The plugin's own `README.md` in the mirror already uses the correct form (`daydeck@daydeck`). | `/Users/tomislavkrnic/Documents/MyWay/daydeck-claude/.claude-plugin/marketplace.json`, `.../claude-plugin/daydeck/README.md` | 2026-09-21 |

**Bottom line on "what's real vs. assumed":** the submission mechanism (GitHub link, two
forms, validator step, auto-pickup of future pushes, terms links, badge system) is
directly quoted from Anthropic's own docs page. The exact submission-form field list is
not published anywhere I could fetch — the form itself sits behind claude.ai/Console org
auth — so §2 is a content draft built from `plugin.json` + `marketplace.json` + the
extensions-pack precedent, for Tomislav to paste field-by-field once the real form is
open in a browser.

## 2. Filled-in draft — every field

| Field | Draft value |
|---|---|
| Plugin name | **Daydeck** |
| Tagline | `A pacer for your projects, not another task list.` |
| Description | Daydeck is a calm macro timeline that lives on your desktop: one lane per project, a few big blocks per lane, recurring rhythms, and ongoing bars — never a to-do list. This plugin bundles a skill (seven pacing rules: at most two fixed projects a day, nothing on weekends, blocks 2–10 days long, at most six blocks per project in the two-week window, at most three lanes showing on any day, nothing starts on a Friday, one phase per project at a time) with a local MCP connector that reads and writes the same `data.json` the Daydeck app itself uses. No account, no cloud, no network calls — the connector only touches one local file on the user's Mac. |
| Category | No fixed category list found on the submit page (see §1) — closest fit is Productivity/Planning if the form offers a dropdown; note in the form's free text that Daydeck is explicitly *not* a task manager or calendar. |
| Homepage | `https://daydeck.krnic.be` |
| Support contact | `daydeck@krnic.be` |
| Privacy policy URL | `https://daydeck.krnic.be/privacy` |
| Author | Tomislav Krnic |
| Platform support | macOS only — the plugin's skill is platform-agnostic text, but the MCP connector only does anything useful once the (Mac-only) Daydeck app has seeded `data.json`; worth a line in the description so non-Mac users aren't surprised the tools return "launch Daydeck first." |
| GitHub link to submit | `https://github.com/Krnic-CommV/daydeck-claude` |
| Install command users get today (verified against mirror's `marketplace.json`) | `/plugin marketplace add Krnic-CommV/daydeck-claude` then `/plugin install daydeck@daydeck` |
| License | MIT (`integrations/LICENSE` in the mirror, and `plugin.json`'s `"license": "MIT"`) — satisfies the public/open-source requirement already. |

**Tone check on this pack:** no "productivity," "Mac," "macOS," or "Apple" in the name or
tagline; "Mac" appears once, correctly, inside the description/platform note, which the
extensions pack's precedent treats as allowed.

## 3. What Tomislav must do himself

1. Decide which submission path applies: if `tkrnic@gmail.com` or whichever account
   does this is on a claude.ai Team/Enterprise org with directory-management access, use
   `https://claude.ai/admin-settings/directory/submissions/plugins/new`. Otherwise, sign
   up for a Console org at `platform.claude.com` (Developer/Admin/Owner role) and use
   `https://platform.claude.com/plugins/submit`.
2. Open that form and paste the GitHub link `https://github.com/Krnic-CommV/daydeck-claude`,
   plus the fields in §2, adjusting to whatever the actual form asks — it wasn't
   fetchable by me (behind org auth).
3. Re-confirm right before submitting that `claude plugin validate` still passes against
   the mirror (it did as of 2026-09-21, verbatim output in §0) — the mirror is the repo
   being submitted, not this private one.
4. After submitting via claude.ai, check
   `https://claude.ai/admin-settings/directory/submissions` for review status. The
   Console path's equivalent status view wasn't documented on this page — check the
   Console UI directly once there.
5. No re-submission needed for future updates — once published, pushes to
   `Krnic-CommV/daydeck-claude` (via `integrations/publish-public.sh --push`) are picked
   up automatically and re-screened by Anthropic's CI.
6. Read the two linked terms documents before submitting if not already familiar:
   `support.claude.com/en/articles/13145338-anthropic-software-directory-terms` and
   `.../13145358-anthropic-software-directory-policy` (same terms already accepted for
   the desktop-extension submission, per `claude-extensions-submission.md`).
7. Don't expect an "Anthropic Verified" badge on first listing — it requires a separate,
   unguaranteed review pass; community-tier listing is the realistic first outcome.
