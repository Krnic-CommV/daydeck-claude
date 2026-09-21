# daydeck-mcp

A local MCP server (stdio) that lets an LLM read and edit your [Daydeck](../../web/README.md)
plan — the calm macro timeline that lives on your desktop wallpaper.
It reads and writes the same `data.json` Daydeck itself uses, so changes
show up on the wallpaper as soon as it next refreshes.

Daydeck is **not** a task manager: this server only deals in a few big
blocks per project ("Project • phase"), ongoing bars, and weekly/monthly
rhythms — not to-do lists.

## Install

### Install with npx

No local checkout needed — `npx` fetches the package from npm each time.

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "daydeck": {
      "command": "npx",
      "args": ["-y", "daydeck-mcp"]
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add daydeck -- npx -y daydeck-mcp
```

**Cursor** — Settings → MCP → Add new MCP server, type `command`:

```json
{
  "mcpServers": {
    "daydeck": {
      "command": "npx",
      "args": ["-y", "daydeck-mcp"]
    }
  }
}
```

### Claude Desktop — double-click install

Double-click `daydeck-mcp.mcpb` (built with `npm run pack-mcpb`
in this folder) and Claude Desktop will install it.

### Claude Desktop — manual config

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "daydeck": {
      "command": "node",
      "args": ["/abs/path/to/daydeck-mcp/server.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add daydeck -- node /abs/path/to/daydeck-mcp/server.js
```

### Cursor

Settings → MCP → Add new MCP server, type `command`:

```json
{
  "mcpServers": {
    "daydeck": {
      "command": "node",
      "args": ["/abs/path/to/daydeck-mcp/server.js"]
    }
  }
}
```

## Run it locally

```bash
npm install
node server.js
```

It speaks MCP over stdio — there's nothing to see until a client (Claude
Desktop, Claude Code, Cursor, or `npx @modelcontextprotocol/inspector node
server.js`) connects to it.

## Data file

Resolved in this order, and never created by this server:

1. `DAYDECK_DATA` environment variable, if set.
2. `~/Library/Containers/com.krnic.daydeck/Data/Library/Application Support/Daydeck/data.json`
   (Mac App Store build).
3. `~/Library/Application Support/Daydeck/data.json`.

If none of those exist, every tool returns: *"Daydeck data file not found.
Launch Daydeck once (App Store) or set DAYDECK_DATA."* — launch Daydeck once
so it can seed its own file, then reconnect.

Writes are read → modify → write atomically (temp file + rename in the same
directory), then re-verified a second later in case Daydeck's own editor
saved over the change during its ~400ms debounce; a single retry is applied
if that happens, and the tool result says so if it still didn't stick.

## Who wrote what

Every task this server creates or updates is stamped with `"source": "<agent>"`,
and every write (block or project add/update/remove, status change) also
stamps top-level `settings.agent = { "name": "<agent>", "at": "<ISO-8601 UTC>" }`
on the data file, preserving any other `settings` keys. `<agent>` is derived
from the connected MCP client's `clientInfo.name` at connect time (e.g.
`claude`, `cursor`, `windsurf`), falling back to `claude` when the client is
unrecognized. This is how the Daydeck app can show attribution like "added by
Claude" on a task or "Claude updated your plan 4 min ago" without guessing —
`get_plan` returns both `source` (per task, when present) and the top-level
`settings.agent` (when present).

## Free plan

Daydeck Free only *displays* the first 2 projects (the app enforces this).
`add_project` / `add_block` still write a 3rd+ project or its blocks, but
the result comes back with: *"Daydeck Free shows 2 projects; this one stays
hidden until Pro."*

## Tools

| Tool | Purpose |
|---|---|
| `get_plan` | Today's date and every project with its tasks (ids included). Pass `days` (default 14) for a day-by-day breakdown. Read-only. |
| `add_project` | Create a project. Refuses a duplicate name (case-insensitive) and returns the existing id instead. |
| `add_block` | Add a fixed / ongoing / weekly / monthly task to a project. Creates the project if it doesn't exist. Runs `check_pacing` afterwards and includes any new violations. |
| `update_block` | Edit a task by id — label, dates, note, or switch it to a different kind of block. Runs `check_pacing` afterwards too. |
| `remove_block` | Delete a task by id. |
| `remove_project` | Delete a project and all its tasks. |
| `set_project_status` | Set a project to `active`, `draft`, or `off`. |
| `check_pacing` | Report pacing violations over the next `days` (default 14) with concrete suggestions. Read-only, never modifies data. |

A `daydeck_weekly_planning` prompt is also registered: it walks through a
weekly planning conversation (what changed → `get_plan` → propose moves →
apply them → `check_pacing` → summarise what feels good and what doesn't).

## Pacing rules (`check_pacing`)

Checked over fixed blocks (tasks with `start`/`end`); ongoing bars and
recurring tasks don't count as load unless a rule says otherwise.

| Rule | Check |
|---|---|
| R1 | At most 2 projects have a fixed block covering any given weekday. |
| R2 | No fixed block covers a Saturday or Sunday (recurring is fine). |
| R3 | A fixed block is 2–10 days long (1 day is a micro task; >10 days should be split into phases). |
| R4 | A project has at most 6 fixed blocks inside the checked window. |
| R5 | At most 3 lanes have anything visible (fixed + recurring + ongoing) on any given day. |
| R6 | No fixed block *starts* on a Friday (kept for thinking, not kickoffs). |
| R7 | Two fixed blocks of the same project never overlap. |

Each violation reports `{ rule, date, blockIds, message, suggestion }` with a
concrete suggestion (a specific date to move to, or how to split a block).

## Privacy

This connector makes no network calls of its own. It reads and writes exactly
one local file — the same `data.json` the Daydeck app uses (see "Data file"
above). No analytics, telemetry, or usage tracking of any kind, and nothing
is shared with any third party. Data never leaves your Mac through this
connector. Questions: daydeck@krnic.be.

## Tests

```bash
npm test
```

Runs `test/run.test.js` (node's built-in `node:test`) against a temp data
file — no real Daydeck installation required.
