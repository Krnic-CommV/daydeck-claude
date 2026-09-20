// Core logic for daydeck-mcp. No MCP/transport code here so it can be
// unit-tested directly (see test/run.test.js) — server.js only wires this
// up to the Model Context Protocol.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------
// Data file resolution
// ---------------------------------------------------------------------

export const DATA_NOT_FOUND_MESSAGE =
  'Daydeck data file not found. Launch Daydeck once (App Store) or set DAYDECK_DATA.';

function masDataPath() {
  return path.join(
    os.homedir(),
    'Library', 'Containers', 'com.krnic.daydeck', 'Data',
    'Library', 'Application Support', 'Daydeck', 'data.json',
  );
}

function directDataPath() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'Daydeck', 'data.json');
}

/**
 * Resolve the Daydeck data.json path following the documented priority:
 * env DAYDECK_DATA, then the Mac App Store container, then the plain
 * Application Support path. We never create the file — only report a path
 * that already exists (or null / the explicit env path if it does not).
 */
export function resolveDataPath() {
  if (process.env.DAYDECK_DATA) return process.env.DAYDECK_DATA;
  if (fs.existsSync(masDataPath())) return masDataPath();
  if (fs.existsSync(directDataPath())) return directDataPath();
  return null;
}

/** Like resolveDataPath(), but throws the exact "not found" error tools must surface. */
export function requireDataPath() {
  const p = resolveDataPath();
  if (!p || !fs.existsSync(p)) throw new Error(DATA_NOT_FOUND_MESSAGE);
  return p;
}

// ---------------------------------------------------------------------
// Agent identification (who is writing) — see README "Who wrote what".
// ---------------------------------------------------------------------

const KNOWN_AGENTS = ['claude', 'cursor', 'windsurf'];

/**
 * Map an MCP client's clientInfo.name (e.g. "claude-ai", "Cursor", "Windsurf")
 * to the short agent id stamped into `source` / `settings.agent.name`.
 * Lowercased; anything containing a known agent's name maps to that agent;
 * otherwise the first word, truncated to 32 chars; falls back to "claude"
 * for anything blank or unrecognizable, since Claude Desktop/Code are the
 * primary clients.
 */
export function mapAgentName(rawName) {
  if (typeof rawName !== 'string') return 'claude';
  const lower = rawName.trim().toLowerCase();
  if (!lower) return 'claude';
  for (const known of KNOWN_AGENTS) {
    if (lower.includes(known)) return known;
  }
  const firstWord = lower.split(/[^a-z0-9]+/).find(Boolean);
  return firstWord ? firstWord.slice(0, 32) : 'claude';
}

let currentAgentName = 'claude';

/** Called once by server.js when the SDK exposes the connected client's clientInfo. */
export function setAgentName(rawName) {
  currentAgentName = mapAgentName(rawName);
}

/** The agent name currently stamped into `source` / `settings.agent.name` on writes. */
export function getAgentName() {
  return currentAgentName;
}

// ---------------------------------------------------------------------
// Low-level read / atomic write
// ---------------------------------------------------------------------

function readData(dataPath) {
  const raw = fs.readFileSync(dataPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Daydeck data file is not valid JSON: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
  if (!Array.isArray(parsed.projects)) parsed.projects = [];
  if (!parsed.settings || typeof parsed.settings !== 'object') parsed.settings = {};
  return parsed;
}

function writeAtomic(dataPath, data) {
  const dir = path.dirname(dataPath);
  const tmp = path.join(
    dir,
    `.${path.basename(dataPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, dataPath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * How long to wait, after writing, before re-reading to check the Daydeck
 * editor's ~400ms save debounce did not clobber our change. Real usage
 * waits a full second (per spec); tests can shrink this via
 * DAYDECK_MCP_VERIFY_DELAY_MS so the suite doesn't take minutes.
 */
function verifyDelayMs() {
  const v = process.env.DAYDECK_MCP_VERIFY_DELAY_MS;
  if (v !== undefined) {
    const n = Number(v);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 1000;
}

/**
 * Stamp `settings.agent = { name, at }` (current agent, ISO-8601 UTC now)
 * onto every write, preserving any other settings keys already there.
 */
function stampAgent(data) {
  data.settings = {
    ...(data.settings || {}),
    agent: { name: getAgentName(), at: new Date().toISOString() },
  };
  return data;
}

/**
 * read -> modify -> write atomically -> wait -> re-read -> verify.
 * If the change is missing, re-apply once (re-reading fresh data first,
 * in case Daydeck's editor saved something else in the meantime) and
 * report whether that second attempt stuck.
 *
 * `mutator(data)` must return `{ data, meta }` (the new full document and
 * whatever bookkeeping `verifier` / the caller needs) and may be called
 * twice, so it should be safe to re-run against a freshly re-read document.
 * `verifier(data, meta)` returns true if the change is present.
 *
 * Every write stamps `settings.agent` (see stampAgent) so the app can show
 * who last touched the plan and when.
 */
async function transactionalWrite(dataPath, mutator, verifier) {
  const attempt1 = mutator(readData(dataPath));
  writeAtomic(dataPath, stampAgent(attempt1.data));
  await sleep(verifyDelayMs());
  if (verifier(readData(dataPath), attempt1.meta)) {
    return { meta: attempt1.meta, reapplied: false, failed: false };
  }

  const attempt2 = mutator(readData(dataPath));
  writeAtomic(dataPath, stampAgent(attempt2.data));
  const ok = verifier(readData(dataPath), attempt2.meta);
  return { meta: attempt2.meta, reapplied: true, failed: !ok };
}

// ---------------------------------------------------------------------
// Ids and colours (matching web/app.js conventions)
// ---------------------------------------------------------------------

// web/app.js PALETTE (web/app.js:127) — kept in sync by hand, it's 8 fixed pastels.
const PALETTE = ['#C9BD93', '#A3A4D8', '#A9CFCB', '#B3CB9B', '#CBA0C8', '#D6B58C', '#9FC1D6', '#C9A8A0'];

let idCounter = 0;
function genId(prefix) {
  idCounter += 1;
  // matches app.js Date_now_safe(): timestamp base-36 + a monotonic counter
  return prefix + Date.now().toString(36) + idCounter;
}
function genProjectId() {
  return genId('proj-');
}
function genTaskId() {
  return genId('t');
}

function pickColor(data) {
  const used = new Set(data.projects.map((p) => p.color));
  return PALETTE.find((c) => !used.has(c)) || PALETTE[data.projects.length % PALETTE.length];
}

const FREE_PROJECT_LIMIT = 2;

// ---------------------------------------------------------------------
// Date helpers (UTC-based date-only arithmetic; "today" itself uses the
// local calendar date, matching what someone looking at their desktop sees)
// ---------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isValidDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validateDate(s, label = 'date') {
  if (!isValidDateStr(s)) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date, got: ${JSON.stringify(s)}`);
  }
}

function parseUTC(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtUTC(dt) {
  return dt.toISOString().slice(0, 10);
}

export function addDaysStr(s, n) {
  const dt = parseUTC(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtUTC(dt);
}

export function dowOf(s) {
  return parseUTC(s).getUTCDay(); // 0=Sun .. 6=Sat, matches recurrence.weekdays convention
}

function dayDiff(a, b) {
  return Math.round((parseUTC(b) - parseUTC(a)) / 86400000);
}

function fmtNice(s) {
  const dt = parseUTC(s);
  return `${WD[dt.getUTCDay()]} ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`;
}

function lastDayOfMonthFor(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Next date on/after `from` (inclusive) that falls on weekday `dow` (0=Sun..6=Sat). */
export function nextDow(from, dow) {
  let d = from;
  let guard = 0;
  while (dowOf(d) !== dow) {
    d = addDaysStr(d, 1);
    guard += 1;
    if (guard > 14) throw new Error('nextDow: could not find weekday');
  }
  return d;
}

// ---------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------

function findProject(data, identifier) {
  if (!identifier) return null;
  const id = String(identifier);
  return (
    data.projects.find((p) => p.id === id) ||
    data.projects.find((p) => (p.name || '').trim().toLowerCase() === id.trim().toLowerCase()) ||
    null
  );
}

function findTaskById(data, id) {
  for (const project of data.projects) {
    const index = project.tasks.findIndex((t) => t.id === id);
    if (index !== -1) return { project, task: project.tasks[index], index };
  }
  return null;
}

function groupBy(arr, fn) {
  const map = new Map();
  for (const item of arr) {
    const key = fn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

// ---------------------------------------------------------------------
// Task field parsing / validation (shared by add_block and update_block)
// ---------------------------------------------------------------------

function validateWeekdays(arr) {
  if (!Array.isArray(arr) || !arr.length) {
    throw new Error('weekly must be a non-empty array of weekdays 0-6 (0=Sun..6=Sat)');
  }
  for (const d of arr) {
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      throw new Error(`invalid weekday: ${JSON.stringify(d)} (use 0-6, 0=Sun)`);
    }
  }
  return Array.from(new Set(arr)).sort((a, b) => a - b);
}

function parseMonthlySpec(spec) {
  if (typeof spec !== 'string' || !spec.trim()) {
    throw new Error('monthly must be a non-empty string like "25-30, last"');
  }
  const days = new Set();
  for (let token of spec.split(',')) {
    token = token.trim();
    if (!token) continue;
    if (/^last$/i.test(token)) {
      days.add(-1);
      continue;
    }
    let m = token.match(/^(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a < 1 || a > 31 || b < 1 || b > 31 || a > b) {
        throw new Error(`invalid monthly range: "${token}"`);
      }
      for (let d = a; d <= b; d++) days.add(d);
      continue;
    }
    m = token.match(/^(\d{1,2})$/);
    if (m) {
      const d = Number(m[1]);
      if (d < 1 || d > 31) throw new Error(`invalid monthly day: "${token}"`);
      days.add(d);
      continue;
    }
    throw new Error(`invalid monthly token: "${token}" (use days 1-31, ranges like 25-30, or "last")`);
  }
  if (!days.size) throw new Error('monthly must specify at least one day');
  return Array.from(days).sort((a, b) => a - b);
}

function applyNote(t, note) {
  if (note === undefined) return;
  if (note === null) {
    delete t.note;
    return;
  }
  t.note = String(note).slice(0, 180);
}

/**
 * Build (existing = null) or update (existing = task) a task object.
 * Preserves any keys we don't know about (spreads the existing task first),
 * and enforces "exactly one of end/ongoing/weekly/monthly" on create,
 * "at most one" on update.
 */
function applyTaskFields(existing, params) {
  const isNew = !existing;
  const t = isNew ? {} : { ...existing };

  if (isNew && (!params.label || !String(params.label).trim())) {
    throw new Error('label is required');
  }
  if (params.label !== undefined) {
    if (!String(params.label).trim()) throw new Error('label cannot be empty');
    t.label = params.label;
  }
  if (params.note !== undefined) applyNote(t, params.note);

  const typeKeys = ['end', 'ongoing', 'weekly', 'monthly'];
  const provided = typeKeys.filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== false);

  if (isNew && provided.length !== 1) {
    throw new Error('exactly one of end, ongoing, weekly, monthly is required');
  }
  if (!isNew && provided.length > 1) {
    throw new Error('at most one of end, ongoing, weekly, monthly may be set at a time');
  }

  if (provided.length === 1) {
    const type = provided[0];
    delete t.end;
    delete t.ongoing;
    delete t.recurrence;
    delete t.from;
    delete t.to;

    if (type === 'end') {
      const start = params.start !== undefined ? params.start : isNew ? undefined : existing.start;
      if (!start) throw new Error('start is required for a fixed block');
      validateDate(start, 'start');
      validateDate(params.end, 'end');
      if (params.end < start) throw new Error('end must be on or after start');
      t.start = start;
      t.end = params.end;
    } else if (type === 'ongoing') {
      const start = params.start !== undefined ? params.start : isNew ? undefined : existing.start;
      if (!start) throw new Error('start is required for an ongoing block');
      validateDate(start, 'start');
      t.start = start;
      t.ongoing = true;
    } else if (type === 'weekly') {
      const weekdays = validateWeekdays(params.weekly);
      t.recurrence = { freq: 'weekly', weekdays };
      if (params.from !== undefined) {
        validateDate(params.from, 'from');
        t.from = params.from;
      }
      if (params.to !== undefined) {
        validateDate(params.to, 'to');
        t.to = params.to;
      }
    } else if (type === 'monthly') {
      const daysOfMonth = parseMonthlySpec(params.monthly);
      t.recurrence = { freq: 'monthly', daysOfMonth };
      if (params.from !== undefined) {
        validateDate(params.from, 'from');
        t.from = params.from;
      }
      if (params.to !== undefined) {
        validateDate(params.to, 'to');
        t.to = params.to;
      }
    }
  } else if (!isNew) {
    // No type switch requested: allow nudging start (fixed/ongoing) or from/to (recurring).
    if (params.start !== undefined) {
      if (t.recurrence) throw new Error('start does not apply to a recurring block; use from/to instead');
      validateDate(params.start, 'start');
      if (t.end !== undefined && t.end !== null && params.start > t.end) {
        throw new Error('start must be on or before end');
      }
      t.start = params.start;
    }
    if (t.recurrence) {
      if (params.from !== undefined) {
        validateDate(params.from, 'from');
        t.from = params.from;
      }
      if (params.to !== undefined) {
        validateDate(params.to, 'to');
        t.to = params.to;
      }
    }
  }

  // Every task this connector creates or touches is stamped with who wrote it,
  // so the app can show "added by Claude" / "Claude updated your plan N min ago".
  t.source = getAgentName();

  return t;
}

function freeWarningFor(index) {
  return index >= FREE_PROJECT_LIMIT
    ? 'Daydeck Free shows 2 projects; this one stays hidden until Pro.'
    : null;
}

// ---------------------------------------------------------------------
// Visibility (shared by get_plan's byDay and check_pacing's R5)
// ---------------------------------------------------------------------

function isTaskVisibleOnDay(t, dateStr) {
  if (t.recurrence) {
    if (t.from && dateStr < t.from) return false;
    if (t.to && dateStr > t.to) return false;
    if (t.recurrence.freq === 'weekly') {
      return (t.recurrence.weekdays || []).includes(dowOf(dateStr));
    }
    if (t.recurrence.freq === 'monthly') {
      const dom = Number(dateStr.slice(8, 10));
      const isLast = dom === lastDayOfMonthFor(dateStr);
      return (t.recurrence.daysOfMonth || []).some((d) => d === dom || (d === -1 && isLast));
    }
    return false;
  }
  if (t.ongoing) return !!t.start && dateStr >= t.start;
  if (t.start && t.end) return dateStr >= t.start && dateStr <= t.end;
  if (t.start && !t.end) return dateStr === t.start; // README: end optional -> single day
  return false;
}

function buildByDay(data, today, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysStr(today, i);
    const items = [];
    for (const p of data.projects) {
      if (p.status !== 'active') continue;
      for (const t of p.tasks) {
        if (isTaskVisibleOnDay(t, date)) {
          items.push({ projectId: p.id, projectName: p.name, taskId: t.id, label: t.label });
        }
      }
    }
    out.push({ date, weekday: WD[dowOf(date)], items });
  }
  return out;
}

// ---------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------

export function getPlan(params = {}, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  const data = readData(dataPath);
  const today = todayStr();
  const days = params.days !== undefined ? Number(params.days) : 14;

  const result = {
    today,
    projects: data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      tasks: p.tasks,
    })),
  };

  if (data.settings && data.settings.agent) {
    result.settings = { agent: data.settings.agent };
  }

  if (Number.isFinite(days) && days > 0) {
    result.window = { from: today, to: addDaysStr(today, days - 1), days };
    result.byDay = buildByDay(data, today, days);
  }

  return result;
}

export async function addProject(params, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  const name = (params.name || '').toString().trim();
  if (!name) throw new Error('name is required');
  const status = params.status || 'active';
  if (!['active', 'draft', 'off'].includes(status)) {
    throw new Error('status must be one of active, draft, off');
  }
  if (params.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(params.color)) {
    throw new Error('color must be a #RRGGBB hex string');
  }

  const data0 = readData(dataPath);
  const dup = data0.projects.find((p) => (p.name || '').trim().toLowerCase() === name.toLowerCase());
  if (dup) {
    return {
      ok: false,
      refused: 'duplicate_name',
      existingId: dup.id,
      message: `A project named "${dup.name}" already exists (id: ${dup.id}). Not creating a duplicate — use that id instead.`,
    };
  }

  const newId = genProjectId();
  const mutator = (data) => {
    const chosenColor = params.color || pickColor(data);
    const project = { id: newId, name, color: chosenColor, status, tasks: [] };
    data.projects.push(project);
    return {
      data,
      meta: { projectId: newId, name, color: chosenColor, status, index: data.projects.length - 1 },
    };
  };
  const verifier = (data, meta) => data.projects.some((p) => p.id === meta.projectId);

  const { meta, reapplied, failed } = await transactionalWrite(dataPath, mutator, verifier);
  return {
    ok: !failed,
    projectId: meta.projectId,
    name: meta.name,
    color: meta.color,
    status: meta.status,
    reapplied,
    failed,
    freeWarning: freeWarningFor(meta.index),
    message: failed
      ? `Wrote project "${name}" but could not verify it stuck after retry — check the data file.`
      : `Created project "${name}" (id: ${meta.projectId}, color ${meta.color}).`,
  };
}

export async function addBlock(params, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  if (!params.project || !String(params.project).trim()) throw new Error('project is required');
  applyTaskFields(null, params); // validate up front, before touching the file

  const projectName = String(params.project).trim();
  const newTaskId = genTaskId();
  const newProjectId = genProjectId();

  const mutator = (data) => {
    let project = findProject(data, projectName);
    let createdProject = false;
    if (!project) {
      project = { id: newProjectId, name: projectName, color: pickColor(data), status: 'active', tasks: [] };
      data.projects.push(project);
      createdProject = true;
    }
    const task = applyTaskFields(null, params);
    task.id = newTaskId;
    project.tasks.push(task);
    return {
      data,
      meta: {
        taskId: newTaskId,
        projectId: project.id,
        projectName: project.name,
        createdProject,
        index: data.projects.indexOf(project),
      },
    };
  };
  const verifier = (data, meta) => {
    const p = data.projects.find((pr) => pr.id === meta.projectId);
    return !!p && p.tasks.some((t) => t.id === meta.taskId);
  };

  const { meta, reapplied, failed } = await transactionalWrite(dataPath, mutator, verifier);

  let pacing = null;
  if (!failed) pacing = await checkPacing({ days: 14 }, { dataPath });

  return {
    ok: !failed,
    taskId: meta.taskId,
    projectId: meta.projectId,
    projectName: meta.projectName,
    createdProject: meta.createdProject,
    reapplied,
    failed,
    freeWarning: freeWarningFor(meta.index),
    message: failed
      ? 'Wrote the block but could not verify it stuck after retry — check the data file.'
      : `Added "${params.label}" to ${meta.projectName}${meta.createdProject ? ' (new project)' : ''}.`,
    pacingViolations: pacing ? pacing.violations : undefined,
  };
}

export async function updateBlock(params, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  if (!params.id) throw new Error('id is required');

  const data0 = readData(dataPath);
  const found0 = findTaskById(data0, params.id);
  if (!found0) throw new Error(`No task with id ${params.id}`);
  applyTaskFields(found0.task, params); // validate up front

  const mutator = (data) => {
    const found = findTaskById(data, params.id);
    if (!found) throw new Error(`No task with id ${params.id} (it may have been removed)`);
    const updated = applyTaskFields(found.task, params);
    found.project.tasks[found.index] = updated;
    return { data, meta: { taskId: params.id, projectId: found.project.id, projectName: found.project.name } };
  };
  const verifier = (data, meta) => {
    const p = data.projects.find((pr) => pr.id === meta.projectId);
    return !!p && p.tasks.some((t) => t.id === meta.taskId);
  };

  const { meta, reapplied, failed } = await transactionalWrite(dataPath, mutator, verifier);

  let pacing = null;
  if (!failed) pacing = await checkPacing({ days: 14 }, { dataPath });

  return {
    ok: !failed,
    taskId: meta.taskId,
    projectId: meta.projectId,
    projectName: meta.projectName,
    reapplied,
    failed,
    message: failed
      ? `Updated block ${meta.taskId} but could not verify it stuck after retry.`
      : `Updated block ${meta.taskId} in ${meta.projectName}.`,
    pacingViolations: pacing ? pacing.violations : undefined,
  };
}

export async function removeBlock(params, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  if (!params.id) throw new Error('id is required');

  const data0 = readData(dataPath);
  const found0 = findTaskById(data0, params.id);
  if (!found0) throw new Error(`No task with id ${params.id}`);
  const label = found0.task.label;
  const projectName = found0.project.name;

  const mutator = (data) => {
    const found = findTaskById(data, params.id);
    if (found) found.project.tasks.splice(found.index, 1);
    return { data, meta: { taskId: params.id } };
  };
  const verifier = (data, meta) => !findTaskById(data, meta.taskId);

  const { reapplied, failed } = await transactionalWrite(dataPath, mutator, verifier);
  return {
    ok: !failed,
    taskId: params.id,
    reapplied,
    failed,
    message: failed
      ? `Tried to remove block ${params.id} but could not verify removal after retry.`
      : `Removed "${label}" from ${projectName}.`,
  };
}

export async function removeProject(params, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  if (!params.project) throw new Error('project is required');

  const data0 = readData(dataPath);
  const proj0 = findProject(data0, params.project);
  if (!proj0) throw new Error(`No project matching "${params.project}"`);
  const name = proj0.name;
  const id = proj0.id;
  const taskCount = proj0.tasks.length;

  const mutator = (data) => {
    const idx = data.projects.findIndex((p) => p.id === id);
    if (idx !== -1) data.projects.splice(idx, 1);
    return { data, meta: { projectId: id } };
  };
  const verifier = (data, meta) => !data.projects.some((p) => p.id === meta.projectId);

  const { reapplied, failed } = await transactionalWrite(dataPath, mutator, verifier);
  return {
    ok: !failed,
    projectId: id,
    reapplied,
    failed,
    message: failed
      ? `Tried to remove project "${name}" but could not verify removal after retry.`
      : `Removed project "${name}" and its ${taskCount} task(s).`,
  };
}

export async function setProjectStatus(params, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  if (!params.project) throw new Error('project is required');
  if (!['active', 'draft', 'off'].includes(params.status)) {
    throw new Error('status must be active, draft, or off');
  }

  const data0 = readData(dataPath);
  const proj0 = findProject(data0, params.project);
  if (!proj0) throw new Error(`No project matching "${params.project}"`);
  const id = proj0.id;
  const name = proj0.name;

  const mutator = (data) => {
    const p = data.projects.find((pr) => pr.id === id);
    if (!p) throw new Error(`Project ${id} no longer exists`);
    p.status = params.status;
    return { data, meta: { projectId: id, status: params.status } };
  };
  const verifier = (data, meta) => {
    const p = data.projects.find((pr) => pr.id === meta.projectId);
    return !!p && p.status === meta.status;
  };

  const { reapplied, failed } = await transactionalWrite(dataPath, mutator, verifier);
  return {
    ok: !failed,
    projectId: id,
    status: params.status,
    reapplied,
    failed,
    message: failed
      ? `Set "${name}" to ${params.status} but could not verify it stuck after retry.`
      : `Set "${name}" to ${params.status}.`,
  };
}

// ---------------------------------------------------------------------
// check_pacing
// ---------------------------------------------------------------------

export async function checkPacing(params = {}, opts = {}) {
  const dataPath = opts.dataPath || requireDataPath();
  const data = readData(dataPath);
  const today = todayStr();
  const days = params.days !== undefined ? Number(params.days) : 14;

  const windowDates = [];
  for (let i = 0; i < days; i++) windowDates.push(addDaysStr(today, i));
  const windowStart = windowDates[0];
  const windowEnd = windowDates[windowDates.length - 1];

  const activeProjects = data.projects.filter((p) => p.status === 'active');

  const fixedBlocks = [];
  for (const p of activeProjects) {
    for (const t of p.tasks) {
      if (!t.recurrence && !t.ongoing && t.start && t.end) {
        fixedBlocks.push({ projectId: p.id, projectName: p.name, taskId: t.id, label: t.label, start: t.start, end: t.end });
      }
    }
  }
  const overlapsWindow = (b) => b.start <= windowEnd && b.end >= windowStart;
  const windowBlocks = fixedBlocks.filter(overlapsWindow);

  const violations = [];

  // R3: 2-10 day fixed blocks
  for (const b of fixedBlocks) {
    const len = dayDiff(b.start, b.end) + 1;
    if (len === 1) {
      violations.push({
        rule: 'R3',
        blockIds: [b.taskId],
        date: b.start,
        message: `"${b.projectName} • ${b.label}" is a single day (${fmtNice(b.start)}) — fixed blocks should be 2-10 days.`,
        suggestion: `Extend "${b.label}" to end ${fmtNice(addDaysStr(b.start, 1))} or later, or track it as a micro task outside Daydeck.`,
      });
    } else if (len > 10) {
      const mid = addDaysStr(b.start, Math.floor(len / 2) - 1);
      violations.push({
        rule: 'R3',
        blockIds: [b.taskId],
        date: b.start,
        message: `"${b.projectName} • ${b.label}" runs ${len} days (${fmtNice(b.start)}–${fmtNice(b.end)}) — split into phases (max 10 days each).`,
        suggestion: `Split "${b.label}" into two phases: ${fmtNice(b.start)}–${fmtNice(mid)} and ${fmtNice(addDaysStr(mid, 1))}–${fmtNice(b.end)}.`,
      });
    }
  }

  // R6: no fixed block starts on a Friday (only for blocks starting inside the window)
  for (const b of windowBlocks) {
    if (b.start >= windowStart && dowOf(b.start) === 5) {
      violations.push({
        rule: 'R6',
        blockIds: [b.taskId],
        date: b.start,
        message: `"${b.projectName} • ${b.label}" starts on Friday ${fmtNice(b.start)} — keep Fridays for thinking, not kickoffs.`,
        suggestion: `Start "${b.label}" on Monday ${fmtNice(addDaysStr(b.start, 3))} instead.`,
      });
    }
  }

  // R7: no two fixed blocks of the same project overlap (checked project-wide, not just the window)
  for (const [, blocks] of groupBy(fixedBlocks, (b) => b.projectId)) {
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        if (a.start <= b.end && b.start <= a.end) {
          violations.push({
            rule: 'R7',
            blockIds: [a.taskId, b.taskId],
            date: a.start > b.start ? a.start : b.start,
            message: `"${a.label}" (${fmtNice(a.start)}–${fmtNice(a.end)}) overlaps "${b.label}" (${fmtNice(b.start)}–${fmtNice(b.end)}) in ${a.projectName}.`,
            suggestion: `Move "${b.label}" to start ${fmtNice(addDaysStr(a.end, 1))}, right after "${a.label}" ends.`,
          });
        }
      }
    }
  }

  // R4: at most 6 fixed blocks per project inside the window
  for (const [, blocks] of groupBy(windowBlocks, (b) => b.projectId)) {
    if (blocks.length > 6) {
      violations.push({
        rule: 'R4',
        blockIds: blocks.map((b) => b.taskId),
        date: windowStart,
        message: `${blocks[0].projectName} has ${blocks.length} fixed blocks in the next ${days} days (max 6).`,
        suggestion: `Consolidate some of ${blocks.map((b) => `"${b.label}"`).join(', ')} into fewer, bigger phases.`,
      });
    }
  }

  // Per-day checks: R1 (>2 projects/day), R2 (weekend coverage), R5 (>3 visible lanes/day)
  for (const date of windowDates) {
    const dow = dowOf(date);

    const coveringByProject = new Map();
    for (const b of windowBlocks) {
      if (date >= b.start && date <= b.end) {
        if (!coveringByProject.has(b.projectId)) coveringByProject.set(b.projectId, []);
        coveringByProject.get(b.projectId).push(b);
      }
    }

    if (dow !== 0 && dow !== 6 && coveringByProject.size > 2) {
      const groups = [...coveringByProject.values()];
      const names = groups.map((bs) => bs[0].projectName);
      const ids = groups.flatMap((bs) => bs.map((b) => b.taskId));
      const mover = groups.flat().sort((x, y) => (x.start < y.start ? 1 : -1))[0];
      violations.push({
        rule: 'R1',
        blockIds: ids,
        date,
        message: `${fmtNice(date)}: ${coveringByProject.size} projects have fixed blocks (${names.join(', ')}) — max 2 per day.`,
        suggestion: `Move "${mover.label}" (${mover.projectName}) to start ${fmtNice(addDaysStr(mover.end, 1))}.`,
      });
    }

    if (dow === 0 || dow === 6) {
      for (const [, blocks] of coveringByProject) {
        for (const b of blocks) {
          const fridayBefore = addDaysStr(date, dow === 0 ? -2 : -1);
          violations.push({
            rule: 'R2',
            blockIds: [b.taskId],
            date,
            message: `"${b.projectName} • ${b.label}" covers ${fmtNice(date)}, a weekend day.`,
            suggestion: `End "${b.label}" by ${fmtNice(fridayBefore)} and resume the following Monday.`,
          });
        }
      }
    }

    const visibleProjectNames = [];
    for (const p of activeProjects) {
      if (p.tasks.some((t) => isTaskVisibleOnDay(t, date))) visibleProjectNames.push(p.name);
    }
    if (visibleProjectNames.length > 3) {
      violations.push({
        rule: 'R5',
        blockIds: [],
        date,
        message: `${fmtNice(date)}: ${visibleProjectNames.length} lanes have something visible (${visibleProjectNames.join(', ')}) — max 3 per day.`,
        suggestion: `Move or pause one project's item on ${fmtNice(date)}, e.g. mark "${visibleProjectNames[visibleProjectNames.length - 1]}" draft that day, or shift its block.`,
      });
    }
  }

  violations.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.rule.localeCompare(b.rule));

  return {
    ok: violations.length === 0,
    window: { from: windowStart, to: windowEnd, days },
    violations,
    message: violations.length
      ? `${violations.length} pacing issue(s) in the next ${days} days.`
      : `No pacing issues in the next ${days} days.`,
  };
}

// ---------------------------------------------------------------------
// daydeck_weekly_planning prompt text (also used by server.js's registerPrompt)
// ---------------------------------------------------------------------

export const WEEKLY_PLANNING_PROMPT = `You're running a weekly planning check-in for Daydeck, a calm macro timeline
(NOT a task manager — no micro tasks, just a few big blocks per project).

1. Ask what changed since last week: new projects, finished phases, shifted deadlines.
2. Call get_plan (days: 14) to see the current plan and what's already on each day.
3. Propose concrete moves: new blocks, phase splits, status changes — always as
   "Project • phase" from a start date to an end date (or ongoing/weekly/monthly).
4. Apply the agreed changes with add_block / update_block / remove_block /
   set_project_status.
5. Run check_pacing (days: 14) and walk through any violations with the suggested fix.
6. Summarise in two short lists: "what I feel good about this week" (calm, paced,
   nothing overloaded) and "what I don't" (anything still crowded, unpaced, or vague
   enough it should have been a micro task elsewhere).

Keep it to a handful of blocks per project — Daydeck is a glanceable wallpaper, not a
backlog.`;
