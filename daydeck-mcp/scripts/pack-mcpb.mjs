#!/usr/bin/env node
// Packs daydeck-mcp.mcpb from the single-file esbuild bundle instead of the
// raw package directory. Packing from `.` (via .mcpbignore) drags in
// node_modules and also strips @modelcontextprotocol/sdk/dist via the
// dist/ ignore rule, which breaks the extension in Claude Desktop. Packing
// a small staging dir containing only the bundled server.js + assets avoids
// all of that.
//
// Usage: npm run pack-mcpb   (run from integrations/daydeck-mcp)

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  existsSync,
  rmSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..'); // integrations/daydeck-mcp
const stageDir = join(pkgRoot, 'build', 'mcpb');

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

// 1. Build the single-file bundle.
run('npm', ['run', 'bundle'], pkgRoot);

// 2. Clean staging dir.
if (existsSync(stageDir)) {
  rmSync(stageDir, { recursive: true, force: true });
}
mkdirSync(stageDir, { recursive: true });

// 3. Copy files into the staging dir.
// server.js in the staged dir is the bundled output (renamed from
// dist/server.bundle.mjs), NOT the source server.js. The bundle loads
// SKILL.md relative to its own location via import.meta.url, so SKILL.md
// must sit right next to it.
const copies = [
  ['manifest.json', 'manifest.json'],
  [join('dist', 'server.bundle.mjs'), 'server.js'],
  ['SKILL.md', 'SKILL.md'],
  ['icon.png', 'icon.png'],
  ['README.md', 'README.md'],
  ['LICENSE', 'LICENSE'],
  ['package.json', 'package.json'],
];

for (const [src, dest] of copies) {
  const srcPath = join(pkgRoot, src);
  const destPath = join(stageDir, dest);
  copyFileSync(srcPath, destPath);
  console.log(`copied ${src} -> build/mcpb/${dest}`);
}

// 4. Pack the staging dir into the .mcpb archive.
run('npx', ['@anthropic-ai/mcpb', 'pack', 'build/mcpb', 'daydeck-mcp.mcpb'], pkgRoot);

console.log('\ndaydeck-mcp.mcpb packed from build/mcpb (single-file bundle).');
