#!/usr/bin/env node
// daydeck-mcp: a local stdio MCP server that reads and edits the Daydeck
// plan (data.json). All logic lives in lib.js so it can be unit-tested
// directly — this file only wires that logic up to the Model Context
// Protocol (McpServer + StdioServerTransport, @modelcontextprotocol/sdk).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  getPlan,
  addProject,
  addBlock,
  updateBlock,
  removeBlock,
  removeProject,
  setProjectStatus,
  checkPacing,
  setAgentName,
  WEEKLY_PLANNING_PROMPT,
} from './lib.js';

// The Daydeck skill ships inside the connector: the client receives it as server
// instructions at connect time, so users install one bundle and Claude already knows
// how Daydeck plans and paces. Source of truth: integrations/claude-skill/daydeck/SKILL.md
// (copied here at release time); the YAML front matter is dropped.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
function loadSkill() {
  try {
    const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'SKILL.md'), 'utf8');
    return raw.replace(/^---[\s\S]*?---\s*/, '').trim();
  } catch { return undefined; }
}
const server = new McpServer({ name: 'daydeck-mcp', version: '0.1.0' }, { instructions: loadSkill() });

// The SDK's low-level Server (McpServer wraps it as `.server`) records the
// client's clientInfo (name/version) while handling the "initialize" request,
// and fires oninitialized once the client confirms via the "initialized"
// notification — the first point at which getClientVersion() is reliably
// populated for every transport. We use that client name (e.g. "claude-ai",
// "Claude Code", "Cursor") to attribute writes: see lib.js setAgentName /
// mapAgentName and the README's "Who wrote what" section.
server.server.oninitialized = () => {
  const clientInfo = server.server.getClientVersion();
  setAgentName(clientInfo && clientInfo.name);
};

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function errorResult(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

/** Wrap a (possibly async) lib call: turn thrown errors into an MCP error result. */
function tool(fn) {
  return async (args) => {
    try {
      const result = await fn(args);
      return textResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } catch (err) {
      return errorResult(err);
    }
  };
}

/** Render a lib write-result (message + structured fields) as readable text + JSON. */
function renderWriteResult(result) {
  const lines = [result.message];
  if (result.freeWarning) lines.push(`Note: ${result.freeWarning}`);
  if (result.pacingViolations !== undefined) {
    if (result.pacingViolations.length) {
      lines.push('');
      lines.push(`Pacing check (next 14 days) found ${result.pacingViolations.length} issue(s):`);
      for (const v of result.pacingViolations) {
        lines.push(`- [${v.rule}] ${v.message} Suggestion: ${v.suggestion}`);
      }
    } else {
      lines.push('');
      lines.push('Pacing check (next 14 days): no issues.');
    }
  }
  lines.push('');
  lines.push(JSON.stringify(result, null, 2));
  return lines.join('\n');
}

function writeTool(fn) {
  return async (args) => {
    try {
      const result = await fn(args);
      return textResult(renderWriteResult(result));
    } catch (err) {
      return errorResult(err);
    }
  };
}

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const statusField = z.enum(['active', 'draft', 'off']);
const weeklyField = z.array(z.number().int().min(0).max(6)).describe('weekdays, 0=Sun..6=Sat');

server.registerTool(
  'get_plan',
  {
    description:
      "Read the current Daydeck plan: today's date and every project with its tasks (fixed blocks, ongoing bars, " +
      'weekly/monthly recurrences), ids included. Pass `days` to also get a day-by-day breakdown of what is ' +
      'visible on each date from today through today+days-1 (default 14). Read-only.',
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('how many days ahead to expand into a day-by-day view (default 14)'),
    },
  },
  tool((args) => getPlan(args)),
);

server.registerTool(
  'add_project',
  {
    description:
      'Create a new project (lane) in the Daydeck plan. Refuses to create a duplicate if a project with the same ' +
      'name (case-insensitive) already exists, and returns that project\'s id instead. Daydeck Free only displays ' +
      'the first 2 projects, so creating a 3rd+ still writes it but comes back with a warning.',
    inputSchema: {
      name: z.string().min(1).describe('project name, e.g. "Roko"'),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('hex color #RRGGBB; omit to auto-pick from the palette'),
      status: statusField.optional().describe('active (default), draft, or off'),
    },
  },
  writeTool((args) => addProject(args)),
);

server.registerTool(
  'add_block',
  {
    description:
      'Add one task (block) to a project: a fixed date range, an ongoing bar, or a weekly/monthly recurrence. ' +
      'Pass exactly one of end / ongoing / weekly / monthly. If the named project does not exist yet it is created. ' +
      'Automatically runs check_pacing afterwards and includes any new violations in the result.',
    inputSchema: {
      project: z.string().min(1).describe('project name or id; created if it does not exist'),
      label: z.string().min(1).describe('short task label, e.g. "beta" (shown as "Project • label")'),
      start: dateField.optional().describe('YYYY-MM-DD, required for a fixed block or an ongoing block'),
      end: dateField.optional().describe('YYYY-MM-DD, makes this a fixed block; must be >= start'),
      ongoing: z.boolean().optional().describe('true for a bar with no end date'),
      weekly: weeklyField.optional().describe('makes this a weekly recurrence on these weekdays'),
      monthly: z.string().optional().describe('makes this a monthly recurrence, e.g. "25-30, last"'),
      from: dateField.optional().describe('optional lower bound for a weekly/monthly recurrence'),
      to: dateField.optional().describe('optional upper bound for a weekly/monthly recurrence'),
      note: z.string().max(180).optional().describe('optional note, truncated to 180 characters'),
    },
  },
  writeTool((args) => addBlock(args)),
);

server.registerTool(
  'update_block',
  {
    description:
      'Edit an existing task by id: change its label/note, move it, resize it, or switch it to a different kind of ' +
      'block by passing end / ongoing / weekly / monthly (at most one at a time). Fields left out are unchanged. ' +
      'Automatically runs check_pacing afterwards and includes any new violations in the result.',
    inputSchema: {
      id: z.string().min(1).describe('task id, as returned by get_plan or add_block'),
      label: z.string().min(1).optional(),
      start: dateField.optional(),
      end: dateField.optional().describe('switches this block to a fixed date range'),
      ongoing: z.boolean().optional().describe('switches this block to an ongoing bar'),
      weekly: weeklyField.optional().describe('switches this block to a weekly recurrence'),
      monthly: z.string().optional().describe('switches this block to a monthly recurrence, e.g. "25-30, last"'),
      from: dateField.optional(),
      to: dateField.optional(),
      note: z.string().max(180).optional(),
    },
  },
  writeTool((args) => updateBlock(args)),
);

server.registerTool(
  'remove_block',
  {
    description: 'Delete one task (block) by id.',
    inputSchema: { id: z.string().min(1) },
  },
  writeTool((args) => removeBlock(args)),
);

server.registerTool(
  'remove_project',
  {
    description: 'Delete a project and all of its tasks. Identify it by name or id.',
    inputSchema: { project: z.string().min(1).describe('project name or id') },
  },
  writeTool((args) => removeProject(args)),
);

server.registerTool(
  'set_project_status',
  {
    description: 'Change a project\'s visibility: active (shown), draft (editor only), or off (hidden everywhere).',
    inputSchema: {
      project: z.string().min(1).describe('project name or id'),
      status: statusField,
    },
  },
  writeTool((args) => setProjectStatus(args)),
);

server.registerTool(
  'check_pacing',
  {
    description:
      'Check the plan for pacing problems over the next `days` (default 14): more than 2 projects with fixed ' +
      'blocks on one weekday, fixed blocks touching a weekend, blocks outside the 2-10 day range, a project with ' +
      'more than 6 fixed blocks, more than 3 visible lanes on one day, blocks starting on a Friday, and overlapping ' +
      'blocks within a project. Read-only; returns each violation with a concrete suggestion.',
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('how many days ahead to check (default 14)'),
    },
  },
  tool((args) => checkPacing(args)),
);

server.registerPrompt(
  'daydeck_weekly_planning',
  {
    title: 'Daydeck weekly planning',
    description: 'Run a weekly planning conversation: review what changed, propose moves, apply them, and check pacing.',
  },
  async () => ({
    messages: [{ role: 'user', content: { type: 'text', text: WEEKLY_PLANNING_PROMPT } }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('daydeck-mcp failed to start:', err);
  process.exit(1);
});
