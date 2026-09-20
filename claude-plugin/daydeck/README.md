# daydeck (Claude Code plugin)

## Install

```
/plugin marketplace add Krnic-CommV/daydeck-claude
/plugin install daydeck@daydeck
```

## What it adds

- **Skill** `daydeck` — turns messy plans into a few calm macro blocks per
  project and enforces Daydeck's pacing rules (no overload, no weekends, a
  thinking day).
- **MCP server** `daydeck` — a local stdio server that reads and writes the
  same `data.json` the Daydeck app uses, so the skill can call `get_plan`,
  `add_block`, `check_pacing`, etc. directly instead of only producing a
  `daydeck://` link.

## Requirement

The [Daydeck](https://daydeck.krnic.be) macOS app must be installed and
launched at least once, so it has seeded its own `data.json`. Without that,
every MCP tool call returns a message asking you to launch Daydeck first.

## Who wrote what

Every task this server creates or updates is stamped with `"source": "<agent>"`,
and every write also stamps top-level `settings.agent = { "name": "<agent>",
"at": "<ISO-8601 UTC>" }` on the data file (other `settings` keys are kept).
`<agent>` comes from the connected MCP client's `clientInfo.name` (e.g.
`claude`, `cursor`, `windsurf`), so the Daydeck app can show attribution like
"added by Claude" on a task or "Claude updated your plan 4 min ago" instead
of guessing.

## The bundled MCP server

`mcp/server.js` is a single self-contained ESM file — `@modelcontextprotocol/sdk`
and `zod` are bundled directly into it, so there is no `package.json`, no
lockfile, and no `node_modules` anywhere in this plugin, and nothing needs
to be installed after `/plugin install`. `mcp/SKILL.md` sits next to it and
is loaded relative to the bundle's own location (`import.meta.url`) to
supply the MCP server's `instructions`.

Both files are generated from `integrations/daydeck-mcp` — never edit them
by hand. After changing `integrations/daydeck-mcp/server.js`, `lib.js`, or
`SKILL.md`, regenerate them with:

```
cd integrations/daydeck-mcp
npm run sync-plugin
```

That rebuilds the bundle with esbuild and copies `dist/server.bundle.mjs` and
`SKILL.md` into `mcp/` here.
