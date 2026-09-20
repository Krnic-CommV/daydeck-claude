#!/usr/bin/env bash
# publish-public.sh — sync integrations/ from the private Daydeck app repo into
# the public mirror repo (tomislavkrnic/daydeck-claude, MIT-licensed).
#
# The private repo intentionally has NO .claude-plugin/marketplace.json at its
# root: a marketplace manifest can't be installed from a private repo (`/plugin
# marketplace add` needs a public source), and keeping a second copy here would
# just drift. The public mirror is the marketplace — this script writes its
# marketplace.json every run.
#
# Usage:
#   integrations/publish-public.sh [--private-repo PATH] [--mirror PATH] [--push] [--message "..."]
#
# Defaults:
#   --private-repo  this script's own repo root (git rev-parse --show-toplevel)
#   --mirror        ../daydeck-claude, relative to the private repo root
#
# Without --push, the script syncs, writes the mirror's marketplace.json and
# README.md (if missing), and prints `git status` in the mirror so you can
# review before committing. With --push, it also commits (using --message,
# required in that case) and pushes `main`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIVATE_REPO="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/.." && pwd)"
MIRROR=""
PUSH=false
MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --private-repo)
      PRIVATE_REPO="$2"
      shift 2
      ;;
    --mirror)
      MIRROR="$2"
      shift 2
      ;;
    --push)
      PUSH=true
      shift
      ;;
    --message)
      MESSAGE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MIRROR" ]]; then
  MIRROR="$(cd "$PRIVATE_REPO/.." && pwd)/daydeck-claude"
fi

if $PUSH && [[ -z "$MESSAGE" ]]; then
  echo "error: --push requires --message \"...\"" >&2
  exit 1
fi

if [[ ! -d "$MIRROR" ]]; then
  echo "error: mirror directory does not exist: $MIRROR" >&2
  echo "Create it first (mkdir + git init -b main) before running this script." >&2
  exit 1
fi

SRC="$PRIVATE_REPO/integrations"

echo "Syncing $SRC -> $MIRROR"

rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '*.mcpb' \
  --exclude '.DS_Store' \
  --exclude 'test-artifacts/' \
  --exclude 'coverage/' \
  "$SRC/" "$MIRROR/"
# publish-public.sh itself is fine to include in the mirror — it is not excluded above.

mkdir -p "$MIRROR/.claude-plugin"
cat > "$MIRROR/.claude-plugin/marketplace.json" <<'EOF'
{
  "name": "daydeck",
  "description": "Plan and pace your week on Daydeck, the macOS wallpaper timeline — skill + local MCP connector",
  "owner": {
    "name": "Tomislav Krnic",
    "url": "https://daydeck.krnic.be"
  },
  "plugins": [
    {
      "name": "daydeck",
      "source": "./claude-plugin/daydeck",
      "description": "Plan and pace your week on Daydeck, the macOS wallpaper timeline — skill + local MCP connector",
      "version": "0.1.0",
      "keywords": ["daydeck", "planning", "pacing", "wallpaper", "macos", "mcp"]
    }
  ]
}
EOF

if [[ ! -f "$MIRROR/README.md" ]]; then
  cat > "$MIRROR/README.md" <<'EOF'
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
/plugin marketplace add tomislavkrnic/daydeck-claude
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
EOF
fi

echo
echo "----- git status ($MIRROR) -----"
git -C "$MIRROR" status

if $PUSH; then
  git -C "$MIRROR" add -A
  git -C "$MIRROR" commit -m "$MESSAGE"
  env -u GITHUB_TOKEN git -C "$MIRROR" push origin main
fi
