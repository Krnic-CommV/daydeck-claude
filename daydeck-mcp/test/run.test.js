import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Keep the write-verify wait out of the test suite's way — production code
// still defaults to a full 1s wait (see lib.js verifyDelayMs()), but the
// re-read/verify logic itself is exercised either way.
process.env.DAYDECK_MCP_VERIFY_DELAY_MS = '0';

import * as lib from '../lib.js';

function seedFile(seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daydeck-mcp-test-'));
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify(seed ?? { settings: {}, projects: [] }, null, 2));
  return file;
}

/** Point DAYDECK_DATA at a fresh temp file seeded with `seed` for this test only. */
function useData(t, seed) {
  const file = seedFile(seed);
  process.env.DAYDECK_DATA = file;
  t.after(() => {
    delete process.env.DAYDECK_DATA;
  });
  return file;
}

function readRaw(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function project(overrides = {}) {
  return { id: 'proj-seed1', name: 'Roko', color: '#C9BD93', status: 'active', tasks: [], ...overrides };
}

// -----------------------------------------------------------------------
// add_project
// -----------------------------------------------------------------------

test('add_project creates a project with a palette colour and active status', async (t) => {
  const file = useData(t, { settings: {}, projects: [] });
  const result = await lib.addProject({ name: 'Roko' });
  assert.equal(result.ok, true);
  assert.match(result.projectId, /^proj-/);

  const raw = readRaw(file);
  assert.equal(raw.projects.length, 1);
  assert.equal(raw.projects[0].name, 'Roko');
  assert.equal(raw.projects[0].status, 'active');
  assert.match(raw.projects[0].color, /^#[0-9a-fA-F]{6}$/);
});

test('add_project refuses a duplicate name case-insensitively and returns the existing id', async (t) => {
  const file = useData(t, { settings: {}, projects: [project({ name: 'Roko' })] });
  const result = await lib.addProject({ name: 'roko' });
  assert.equal(result.ok, false);
  assert.equal(result.refused, 'duplicate_name');
  assert.equal(result.existingId, 'proj-seed1');

  const raw = readRaw(file);
  assert.equal(raw.projects.length, 1); // nothing new written
});

test('add_project on a 3rd project returns the Free-plan warning', async (t) => {
  useData(t, {
    settings: {},
    projects: [project({ id: 'proj-1', name: 'A' }), project({ id: 'proj-2', name: 'B' })],
  });
  const result = await lib.addProject({ name: 'C' });
  assert.equal(result.ok, true);
  assert.match(result.freeWarning, /Daydeck Free shows 2 projects/);
});

// -----------------------------------------------------------------------
// add_block: fixed / ongoing / weekly / monthly
// -----------------------------------------------------------------------

test('add_block creates a fixed block', async (t) => {
  const file = useData(t, { settings: {}, projects: [project()] });
  const today = lib.todayStr();
  const start = lib.addDaysStr(today, 5);
  const end = lib.addDaysStr(today, 7);
  const result = await lib.addBlock({ project: 'Roko', label: 'beta', start, end });
  assert.equal(result.ok, true);
  assert.match(result.taskId, /^t/);

  const raw = readRaw(file);
  const task = raw.projects[0].tasks.find((tk) => tk.id === result.taskId);
  assert.equal(task.label, 'beta');
  assert.equal(task.start, start);
  assert.equal(task.end, end);
});

test('add_block creates an ongoing block', async (t) => {
  const file = useData(t, { settings: {}, projects: [project()] });
  const start = lib.todayStr();
  const result = await lib.addBlock({ project: 'Roko', label: 'training', start, ongoing: true });
  assert.equal(result.ok, true);

  const raw = readRaw(file);
  const task = raw.projects[0].tasks.find((tk) => tk.id === result.taskId);
  assert.equal(task.ongoing, true);
  assert.equal(task.start, start);
  assert.equal(task.end, undefined);
});

test('add_block creates a weekly recurrence', async (t) => {
  const file = useData(t, { settings: {}, projects: [project()] });
  const result = await lib.addBlock({ project: 'Roko', label: 'weekly issue', weekly: [1, 3] });
  assert.equal(result.ok, true);

  const raw = readRaw(file);
  const task = raw.projects[0].tasks.find((tk) => tk.id === result.taskId);
  assert.deepEqual(task.recurrence, { freq: 'weekly', weekdays: [1, 3] });
});

test('add_block creates a monthly recurrence, parsing ranges and "last"', async (t) => {
  const file = useData(t, { settings: {}, projects: [project()] });
  const result = await lib.addBlock({ project: 'Roko', label: 'social posts', monthly: '25-27, last' });
  assert.equal(result.ok, true);

  const raw = readRaw(file);
  const task = raw.projects[0].tasks.find((tk) => tk.id === result.taskId);
  assert.equal(task.recurrence.freq, 'monthly');
  assert.deepEqual(task.recurrence.daysOfMonth, [-1, 25, 26, 27]);
});

test('add_block creates the project when it does not exist yet, and says so', async (t) => {
  const file = useData(t, { settings: {}, projects: [] });
  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  const result = await lib.addBlock({ project: 'New Co', label: 'kickoff', start, end });
  assert.equal(result.ok, true);
  assert.equal(result.createdProject, true);

  const raw = readRaw(file);
  assert.equal(raw.projects.length, 1);
  assert.equal(raw.projects[0].name, 'New Co');
});

test('add_block requires exactly one of end/ongoing/weekly/monthly', async (t) => {
  useData(t, { settings: {}, projects: [project()] });
  await assert.rejects(() => lib.addBlock({ project: 'Roko', label: 'x', start: lib.todayStr() }));
  await assert.rejects(() =>
    lib.addBlock({ project: 'Roko', label: 'x', start: lib.todayStr(), end: lib.todayStr(), ongoing: true }),
  );
});

test('add_block rejects end before start', async (t) => {
  useData(t, { settings: {}, projects: [project()] });
  const start = lib.todayStr();
  const end = lib.addDaysStr(start, -1);
  await assert.rejects(() => lib.addBlock({ project: 'Roko', label: 'x', start, end }));
});

test('add_block truncates a note to 180 characters', async (t) => {
  const file = useData(t, { settings: {}, projects: [project()] });
  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  const longNote = 'x'.repeat(400);
  const result = await lib.addBlock({ project: 'Roko', label: 'beta', start, end, note: longNote });
  const raw = readRaw(file);
  const task = raw.projects[0].tasks.find((tk) => tk.id === result.taskId);
  assert.equal(task.note.length, 180);
});

// -----------------------------------------------------------------------
// update_block / remove_block / remove_project / set_project_status
// -----------------------------------------------------------------------

test('update_block changes fields and preserves unknown keys', async (t) => {
  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  const seedTask = { id: 't1', label: 'beta', start, end, custom: 'kept-me' };
  const file = useData(t, { settings: {}, projects: [project({ tasks: [seedTask] })] });

  const newEnd = lib.addDaysStr(start, 4);
  const result = await lib.updateBlock({ id: 't1', label: 'beta v2', end: newEnd });
  assert.equal(result.ok, true);

  const raw = readRaw(file);
  const task = raw.projects[0].tasks.find((tk) => tk.id === 't1');
  assert.equal(task.label, 'beta v2');
  assert.equal(task.end, newEnd);
  assert.equal(task.custom, 'kept-me'); // unknown key preserved
});

test('update_block can switch a fixed block to weekly', async (t) => {
  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  const file = useData(t, { settings: {}, projects: [project({ tasks: [{ id: 't1', label: 'beta', start, end }] })] });

  const result = await lib.updateBlock({ id: 't1', weekly: [2, 4] });
  assert.equal(result.ok, true);
  const raw = readRaw(file);
  const task = raw.projects[0].tasks.find((tk) => tk.id === 't1');
  assert.deepEqual(task.recurrence, { freq: 'weekly', weekdays: [2, 4] });
  assert.equal(task.end, undefined);
});

test('remove_block deletes the task', async (t) => {
  const start = lib.todayStr();
  const file = useData(t, {
    settings: {},
    projects: [project({ tasks: [{ id: 't1', label: 'beta', start, end: start }] })],
  });
  const result = await lib.removeBlock({ id: 't1' });
  assert.equal(result.ok, true);
  const raw = readRaw(file);
  assert.equal(raw.projects[0].tasks.length, 0);
});

test('remove_project deletes the project and its tasks', async (t) => {
  const start = lib.todayStr();
  const file = useData(t, {
    settings: {},
    projects: [project({ tasks: [{ id: 't1', label: 'beta', start, end: start }] })],
  });
  const result = await lib.removeProject({ project: 'Roko' });
  assert.equal(result.ok, true);
  const raw = readRaw(file);
  assert.equal(raw.projects.length, 0);
});

test('set_project_status updates status and validates the value', async (t) => {
  const file = useData(t, { settings: {}, projects: [project()] });
  const result = await lib.setProjectStatus({ project: 'Roko', status: 'off' });
  assert.equal(result.ok, true);
  const raw = readRaw(file);
  assert.equal(raw.projects[0].status, 'off');
  await assert.rejects(() => lib.setProjectStatus({ project: 'Roko', status: 'bogus' }));
});

// -----------------------------------------------------------------------
// unknown-key preservation, beyond the single-task case above
// -----------------------------------------------------------------------

test('unknown top-level and project-level keys survive a write', async (t) => {
  const file = useData(t, {
    settings: { pastDays: 7 },
    somethingWeDoNotKnowAbout: { keep: true },
    projects: [project({ theme: 'sunrise' })],
  });
  await lib.addProject({ name: 'Second' });
  const raw = readRaw(file);
  assert.deepEqual(raw.somethingWeDoNotKnowAbout, { keep: true });
  assert.equal(raw.projects[0].theme, 'sunrise');
  assert.equal(raw.settings.pastDays, 7);
});

// -----------------------------------------------------------------------
// check_pacing — each rule triggered once, and passing once
// -----------------------------------------------------------------------

const today = lib.todayStr();
// A Monday comfortably inside a 30-day check window, with room either side.
const mon = lib.nextDow(lib.addDaysStr(today, 3), 1);

function activeProject(id, name, tasks) {
  return { id, name, color: '#C9BD93', status: 'active', tasks };
}

function fixedTask(id, label, start, end) {
  return { id, label, start, end };
}

test('R1 triggers when 3 projects have fixed blocks on the same weekday, passes with 2', async (t) => {
  const wed = lib.addDaysStr(mon, 2);
  const bad = useData(t, {
    settings: {},
    projects: [
      activeProject('p1', 'A', [fixedTask('t1', 'a', mon, wed)]),
      activeProject('p2', 'B', [fixedTask('t2', 'b', mon, wed)]),
      activeProject('p3', 'C', [fixedTask('t3', 'c', mon, wed)]),
    ],
  });
  const badReport = await lib.checkPacing({ days: 30 });
  assert.ok(badReport.violations.some((v) => v.rule === 'R1'), 'expected an R1 violation');

  const good = useData(t, {
    settings: {},
    projects: [
      activeProject('p1', 'A', [fixedTask('t1', 'a', mon, wed)]),
      activeProject('p2', 'B', [fixedTask('t2', 'b', mon, wed)]),
    ],
  });
  const goodReport = await lib.checkPacing({ days: 30 });
  assert.ok(!goodReport.violations.some((v) => v.rule === 'R1'), 'expected no R1 violation');
});

test('R2 triggers when a fixed block covers a weekend, passes when it does not', async (t) => {
  const thu = lib.addDaysStr(mon, 3); // mon is a Monday, so mon+3 is that week's Thursday
  const throughMon = lib.addDaysStr(thu, 4); // Thu..Mon covers Sat+Sun
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', thu, throughMon)])] });
  const badReport = await lib.checkPacing({ days: 30 });
  assert.ok(badReport.violations.some((v) => v.rule === 'R2'));

  const wed = lib.addDaysStr(mon, 2);
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', mon, wed)])] });
  const goodReport = await lib.checkPacing({ days: 30 });
  assert.ok(!goodReport.violations.some((v) => v.rule === 'R2'));
});

test('R3 triggers on a 1-day block, passes on a 3-day block', async (t) => {
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', mon, mon)])] });
  const badReport = await lib.checkPacing({ days: 30 });
  assert.ok(badReport.violations.some((v) => v.rule === 'R3'));

  const wed = lib.addDaysStr(mon, 2);
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', mon, wed)])] });
  const goodReport = await lib.checkPacing({ days: 30 });
  assert.ok(!goodReport.violations.some((v) => v.rule === 'R3'));
});

test('R4 triggers with 7 fixed blocks in one project, passes with 5', async (t) => {
  const manyTasks = [];
  for (let i = 0; i < 7; i++) {
    const start = lib.addDaysStr(today, 1 + i * 2);
    manyTasks.push(fixedTask(`t${i}`, `b${i}`, start, lib.addDaysStr(start, 1)));
  }
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', manyTasks)] });
  const badReport = await lib.checkPacing({ days: 30 });
  assert.ok(badReport.violations.some((v) => v.rule === 'R4'));

  const fewTasks = manyTasks.slice(0, 5);
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', fewTasks)] });
  const goodReport = await lib.checkPacing({ days: 30 });
  assert.ok(!goodReport.violations.some((v) => v.rule === 'R4'));
});

test('R5 triggers with 4 visible lanes in one day, passes with 3', async (t) => {
  const ongoing = (id, name) => activeProject(id, name, [{ id: `${id}-t`, label: 'ongoing', start: today, ongoing: true }]);
  useData(t, { settings: {}, projects: [ongoing('p1', 'A'), ongoing('p2', 'B'), ongoing('p3', 'C'), ongoing('p4', 'D')] });
  const badReport = await lib.checkPacing({ days: 30 });
  assert.ok(badReport.violations.some((v) => v.rule === 'R5'));

  useData(t, { settings: {}, projects: [ongoing('p1', 'A'), ongoing('p2', 'B'), ongoing('p3', 'C')] });
  const goodReport = await lib.checkPacing({ days: 30 });
  assert.ok(!goodReport.violations.some((v) => v.rule === 'R5'));
});

test('R6 triggers when a fixed block starts on a Friday, passes when it starts on a Monday', async (t) => {
  const fri = lib.nextDow(mon, 5);
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', fri, lib.addDaysStr(fri, 1))])] });
  const badReport = await lib.checkPacing({ days: 30 });
  assert.ok(badReport.violations.some((v) => v.rule === 'R6'));

  const wed = lib.addDaysStr(mon, 2);
  useData(t, { settings: {}, projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', mon, wed)])] });
  const goodReport = await lib.checkPacing({ days: 30 });
  assert.ok(!goodReport.violations.some((v) => v.rule === 'R6'));
});

test('R7 triggers when two blocks of the same project overlap, passes when they do not', async (t) => {
  const aEnd = lib.addDaysStr(mon, 4);
  const bStart = lib.addDaysStr(mon, 2);
  const bEnd = lib.addDaysStr(mon, 6);
  useData(t, {
    settings: {},
    projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', mon, aEnd), fixedTask('t2', 'b', bStart, bEnd)])],
  });
  const badReport = await lib.checkPacing({ days: 30 });
  assert.ok(badReport.violations.some((v) => v.rule === 'R7'));

  const cStart = lib.addDaysStr(aEnd, 1);
  const cEnd = lib.addDaysStr(cStart, 2);
  useData(t, {
    settings: {},
    projects: [activeProject('p1', 'A', [fixedTask('t1', 'a', mon, aEnd), fixedTask('t3', 'c', cStart, cEnd)])],
  });
  const goodReport = await lib.checkPacing({ days: 30 });
  assert.ok(!goodReport.violations.some((v) => v.rule === 'R7'));
});

test('check_pacing defaults to a 14-day window', async (t) => {
  useData(t, { settings: {}, projects: [] });
  const report = await lib.checkPacing({});
  assert.equal(report.window.days, 14);
});

// -----------------------------------------------------------------------
// get_plan
// -----------------------------------------------------------------------

test('get_plan returns today, projects with tasks, and a day-by-day window', async (t) => {
  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  useData(t, { settings: {}, projects: [project({ tasks: [{ id: 't1', label: 'beta', start, end }] })] });
  const plan = lib.getPlan({ days: 5 });
  assert.equal(plan.today, start);
  assert.equal(plan.projects.length, 1);
  assert.equal(plan.projects[0].tasks[0].label, 'beta');
  assert.equal(plan.byDay.length, 5);
  assert.ok(plan.byDay[0].items.some((i) => i.taskId === 't1'));
});

// -----------------------------------------------------------------------
// agent attribution: mapAgentName, source on tasks, settings.agent on writes
// -----------------------------------------------------------------------

test('mapAgentName maps client names to short agent ids', () => {
  assert.equal(lib.mapAgentName('claude-ai'), 'claude');
  assert.equal(lib.mapAgentName('Claude Code'), 'claude');
  assert.equal(lib.mapAgentName('Cursor'), 'cursor');
  assert.equal(lib.mapAgentName('Windsurf'), 'windsurf');
  assert.equal(lib.mapAgentName('SomeOtherTool 2.0'), 'someothertool');
  assert.equal(lib.mapAgentName(undefined), 'claude');
});

test('add_block and update_block stamp the task with the current agent as source', async (t) => {
  lib.setAgentName('Cursor');
  t.after(() => lib.setAgentName('claude'));

  const file = useData(t, { settings: {}, projects: [project()] });
  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  const added = await lib.addBlock({ project: 'Roko', label: 'beta', start, end });
  let raw = readRaw(file);
  let task = raw.projects[0].tasks.find((tk) => tk.id === added.taskId);
  assert.equal(task.source, 'cursor');

  lib.setAgentName('Claude Desktop');
  await lib.updateBlock({ id: added.taskId, label: 'beta v2' });
  raw = readRaw(file);
  task = raw.projects[0].tasks.find((tk) => tk.id === added.taskId);
  assert.equal(task.source, 'claude');
});

test('every write kind stamps settings.agent with name and an ISO timestamp, preserving other settings keys', async (t) => {
  lib.setAgentName('Windsurf');
  t.after(() => lib.setAgentName('claude'));

  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  const file = useData(t, {
    settings: { pastDays: 7 },
    projects: [project({ tasks: [{ id: 't1', label: 'beta', start, end }] })],
  });

  const assertStamped = () => {
    const raw = readRaw(file);
    assert.equal(raw.settings.agent.name, 'windsurf');
    assert.match(raw.settings.agent.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(raw.settings.pastDays, 7); // other settings keys preserved
  };

  await lib.addProject({ name: 'Second' });
  assertStamped();

  const added = await lib.addBlock({ project: 'Roko', label: 'gamma', start, end });
  assertStamped();

  await lib.updateBlock({ id: added.taskId, label: 'gamma v2' });
  assertStamped();

  await lib.setProjectStatus({ project: 'Roko', status: 'draft' });
  assertStamped();

  await lib.removeBlock({ id: added.taskId });
  assertStamped();

  await lib.removeProject({ project: 'Second' });
  assertStamped();
});

test('get_plan surfaces settings.agent and per-task source when present', async (t) => {
  lib.setAgentName('claude-ai');
  t.after(() => lib.setAgentName('claude'));

  const start = lib.todayStr();
  const end = lib.addDaysStr(start, 2);
  useData(t, { settings: {}, projects: [project()] });
  const added = await lib.addBlock({ project: 'Roko', label: 'beta', start, end });

  const plan = lib.getPlan({ days: 3 });
  assert.equal(plan.settings.agent.name, 'claude');
  const task = plan.projects[0].tasks.find((tk) => tk.id === added.taskId);
  assert.equal(task.source, 'claude');
});

// -----------------------------------------------------------------------
// missing data file
// -----------------------------------------------------------------------

test('missing data file produces the documented error message', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daydeck-mcp-test-'));
  process.env.DAYDECK_DATA = path.join(dir, 'does-not-exist.json');
  t.after(() => {
    delete process.env.DAYDECK_DATA;
  });
  assert.throws(() => lib.getPlan({}), /Daydeck data file not found\. Launch Daydeck once \(App Store\) or set DAYDECK_DATA\./);
});
