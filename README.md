# Daydeck + Claude

Daydeck is a calm macro timeline that lives on your desktop wallpaper: one lane
per project, a few big blocks, recurring rhythms, and ongoing bars. This repo
is the AI layer — the skill and connector that let Claude read and pace it.
The app itself is on the Mac App Store: https://daydeck.krnic.be.

## Install

### Claude Desktop

Download `daydeck-mcp.mcpb` from https://daydeck.krnic.be/download/daydeck-mcp.mcpb
and double-click it.

### Claude Code

```
/plugin marketplace add Krnic-CommV/daydeck-claude
/plugin install daydeck@daydeck
```

### Any MCP client

```
cd daydeck-mcp
npm install
node server.js
```

Or build the single-file bundle with `npm run bundle` in that folder.

## What's inside

- `daydeck-mcp` — the local MCP server (stdio), plus tests.
- `claude-skill` — the `daydeck` skill on its own, for pasting into a Claude
  Project or another assistant.
- `claude-plugin` — the Claude Code plugin (skill + bundled MCP server).
- `distribution` — submission notes and assets for the various stores.

## Pacing rules

Fixed blocks = blocks with a start and an end. Ongoing and recurring bars do
not count as load unless stated.

1. On any weekday, at most 2 projects have a fixed block covering that day.
2. No fixed block covers a weekend. Recurring rhythms may.
3. A fixed block is 2–10 days long.
4. A project has at most 6 fixed blocks in the 2-week window.
5. On any day, at most 3 lanes show anything (fixed + recurring + ongoing).
6. No fixed block starts on a Friday.
7. Two fixed blocks of the same project never overlap.

Requires Daydeck 1.3 or newer. The connector makes no network calls; it reads
and writes one local file.

## License

MIT — see [LICENSE](LICENSE).
