'use strict';

const assert = require('node:assert');
const path = require('node:path');

// ---- Planner tests ----

const { topoSort, detectCycles, daysUntil, buildGraph } = require('../lib/planner.js');

// topoSort: empty config
{
  const result = topoSort({ sprints: [] });
  assert.deepStrictEqual(result, []);
  console.log('PASS: topoSort empty');
}

// topoSort: no dependencies
{
  const config = {
    sprints: [
      { path: 'a', depends_on: [] },
      { path: 'b', depends_on: [] },
    ],
  };
  const result = topoSort(config);
  assert.strictEqual(result.length, 2);
  assert(result.includes('a'));
  assert(result.includes('b'));
  console.log('PASS: topoSort no deps');
}

// topoSort: linear chain
{
  const config = {
    sprints: [
      { path: 'a', depends_on: [] },
      { path: 'b', depends_on: ['a'] },
      { path: 'c', depends_on: ['b'] },
    ],
  };
  const result = topoSort(config);
  assert.strictEqual(result.indexOf('a') < result.indexOf('b'), true);
  assert.strictEqual(result.indexOf('b') < result.indexOf('c'), true);
  console.log('PASS: topoSort linear chain');
}

// topoSort: diamond dependency
{
  const config = {
    sprints: [
      { path: 'a', depends_on: [] },
      { path: 'b', depends_on: ['a'] },
      { path: 'c', depends_on: ['a'] },
      { path: 'd', depends_on: ['b', 'c'] },
    ],
  };
  const result = topoSort(config);
  assert.strictEqual(result.indexOf('a'), 0);
  assert.strictEqual(result.indexOf('d'), 3);
  console.log('PASS: topoSort diamond');
}

// topoSort: cycle detection
{
  const config = {
    sprints: [
      { path: 'a', depends_on: ['b'] },
      { path: 'b', depends_on: ['a'] },
    ],
  };
  let threw = false;
  try {
    topoSort(config);
  } catch (err) {
    threw = true;
    assert(err.message.includes('cycle'));
  }
  assert(threw, 'Should throw on cycle');
  console.log('PASS: topoSort cycle detection');
}

// detectCycles: no cycles
{
  const config = {
    sprints: [
      { path: 'a', depends_on: [] },
      { path: 'b', depends_on: ['a'] },
    ],
  };
  assert.deepStrictEqual(detectCycles(config), []);
  console.log('PASS: detectCycles clean');
}

// buildGraph: returns correct structure
{
  const config = {
    sprints: [
      { path: 'x', depends_on: [] },
      { path: 'y', depends_on: ['x'] },
    ],
  };
  const { nodes, edges } = buildGraph(config);
  assert.strictEqual(nodes.size, 2);
  assert(edges.get('x').has('y'));
  console.log('PASS: buildGraph');
}

// ---- Conflicts tests ----

const { couldContradict } = require('../lib/conflicts.js');

// couldContradict: one negated
{
  assert.strictEqual(couldContradict('use SSE for streaming', 'do not use SSE for streaming'), true);
  console.log('PASS: couldContradict negated');
}

// couldContradict: both positive
{
  assert.strictEqual(couldContradict('use SSE', 'use websockets'), false);
  console.log('PASS: couldContradict both positive');
}

// couldContradict: empty strings
{
  assert.strictEqual(couldContradict('', ''), false);
  assert.strictEqual(couldContradict(null, 'text'), false);
  console.log('PASS: couldContradict edge cases');
}

// ---- Assignments tests ----

const { getWorkload, findOverloaded } = require('../lib/assignments.js');

// getWorkload: groups correctly
{
  const config = {
    sprints: [
      { path: 'a', assigned_to: 'alice' },
      { path: 'b', assigned_to: 'bob' },
      { path: 'c', assigned_to: 'alice' },
      { path: 'd' },
    ],
  };
  const wl = getWorkload(config);
  assert.strictEqual(wl.get('alice').length, 2);
  assert.strictEqual(wl.get('bob').length, 1);
  assert.strictEqual(wl.get('unassigned').length, 1);
  console.log('PASS: getWorkload');
}

// findOverloaded: detects overload
{
  const config = {
    sprints: [
      { path: 'a', assigned_to: 'alice', status: 'active' },
      { path: 'b', assigned_to: 'alice', status: 'active' },
      { path: 'c', assigned_to: 'alice', status: 'active' },
      { path: 'd', assigned_to: 'alice', status: 'active' },
      { path: 'e', assigned_to: 'bob', status: 'active' },
    ],
  };
  const overloaded = findOverloaded(config, 3);
  assert.strictEqual(overloaded.length, 1);
  assert.strictEqual(overloaded[0].person, 'alice');
  console.log('PASS: findOverloaded');
}

// ---- Sync tests ----

const { inferStatus } = require('../lib/sync.js');

{
  assert.strictEqual(inferStatus({ status: 'done' }, {}), 'done');
  assert.strictEqual(inferStatus({ status: 'blocked' }, {}), 'blocked');
  assert.strictEqual(inferStatus({}, { exists: false }), 'not-found');
  assert.strictEqual(inferStatus({}, { exists: true, claimsCount: 0 }), 'not-started');
  assert.strictEqual(inferStatus({}, { exists: true, claimsCount: 5, hasCompilation: true }), 'compiled');
  assert.strictEqual(inferStatus({}, { exists: true, claimsCount: 5, hasCompilation: false }), 'active');
  console.log('PASS: inferStatus');
}

// ---- Planner: additional tests ----

// topoSort: multiple roots
{
  const config = {
    sprints: [
      { path: 'a', depends_on: [] },
      { path: 'b', depends_on: [] },
      { path: 'c', depends_on: ['a', 'b'] },
    ],
  };
  const result = topoSort(config);
  assert.strictEqual(result.length, 3);
  assert(result.indexOf('c') > result.indexOf('a'));
  assert(result.indexOf('c') > result.indexOf('b'));
  console.log('PASS: topoSort multiple roots');
}

// topoSort: three-node cycle
{
  const config = {
    sprints: [
      { path: 'a', depends_on: ['c'] },
      { path: 'b', depends_on: ['a'] },
      { path: 'c', depends_on: ['b'] },
    ],
  };
  let threw = false;
  try {
    topoSort(config);
  } catch (err) {
    threw = true;
    assert(err.message.includes('cycle'));
    assert(err.message.includes('a'));
  }
  assert(threw, 'Should throw on 3-node cycle');
  console.log('PASS: topoSort 3-node cycle');
}

// detectCycles: returns non-empty for cycles
{
  const config = {
    sprints: [
      { path: 'x', depends_on: ['y'] },
      { path: 'y', depends_on: ['x'] },
    ],
  };
  const cycles = detectCycles(config);
  assert(cycles.length > 0, 'detectCycles returns paths for cyclic graph');
  console.log('PASS: detectCycles with cycle');
}

// buildGraph: no edges for isolated nodes
{
  const config = {
    sprints: [
      { path: 'solo1', depends_on: [] },
      { path: 'solo2', depends_on: [] },
    ],
  };
  const { nodes, edges } = buildGraph(config);
  assert.strictEqual(nodes.size, 2);
  assert.strictEqual(edges.get('solo1').size, 0);
  assert.strictEqual(edges.get('solo2').size, 0);
  console.log('PASS: buildGraph isolated nodes');
}

// buildGraph: edge ignores unknown dependency
{
  const config = {
    sprints: [
      { path: 'a', depends_on: ['nonexistent'] },
    ],
  };
  const { nodes, edges } = buildGraph(config);
  assert.strictEqual(nodes.size, 1);
  assert.strictEqual(edges.get('a').size, 0);
  console.log('PASS: buildGraph unknown dep ignored');
}

// daysUntil: future date is positive
{
  const future = new Date();
  future.setDate(future.getDate() + 10);
  const d = daysUntil(future.toISOString().split('T')[0]);
  assert(d > 0 && d <= 11, `daysUntil future: ${d}`);
  console.log('PASS: daysUntil future');
}

// daysUntil: past date is negative
{
  const past = new Date();
  past.setDate(past.getDate() - 5);
  const d = daysUntil(past.toISOString().split('T')[0]);
  assert(d < 0, `daysUntil past: ${d}`);
  console.log('PASS: daysUntil past');
}

// ---- Assignments: additional tests ----

// getWorkload: all unassigned
{
  const config = {
    sprints: [
      { path: 'a' },
      { path: 'b' },
    ],
  };
  const wl = getWorkload(config);
  assert.strictEqual(wl.get('unassigned').length, 2);
  assert.strictEqual(wl.size, 1);
  console.log('PASS: getWorkload all unassigned');
}

// findOverloaded: no one overloaded
{
  const config = {
    sprints: [
      { path: 'a', assigned_to: 'alice', status: 'active' },
      { path: 'b', assigned_to: 'bob', status: 'active' },
    ],
  };
  const overloaded = findOverloaded(config, 3);
  assert.strictEqual(overloaded.length, 0);
  console.log('PASS: findOverloaded none');
}

// findOverloaded: done sprints don't count
{
  const config = {
    sprints: [
      { path: 'a', assigned_to: 'alice', status: 'done' },
      { path: 'b', assigned_to: 'alice', status: 'done' },
      { path: 'c', assigned_to: 'alice', status: 'done' },
      { path: 'd', assigned_to: 'alice', status: 'done' },
      { path: 'e', assigned_to: 'alice', status: 'active' },
    ],
  };
  const overloaded = findOverloaded(config, 3);
  assert.strictEqual(overloaded.length, 0);
  console.log('PASS: findOverloaded done sprints excluded');
}

// findOverloaded: unassigned never overloaded
{
  const config = {
    sprints: [
      { path: 'a', status: 'active' },
      { path: 'b', status: 'active' },
      { path: 'c', status: 'active' },
      { path: 'd', status: 'active' },
      { path: 'e', status: 'active' },
    ],
  };
  const overloaded = findOverloaded(config, 1);
  assert.strictEqual(overloaded.length, 0);
  console.log('PASS: findOverloaded unassigned skipped');
}

// ---- Conflicts: additional tests ----

const { detectConflicts } = require('../lib/conflicts.js');

// detectConflicts: constraint vs recommendation across sprints
{
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchard-conflict-'));
  const sprintA = path.join(tmp, 'sprint-a');
  const sprintB = path.join(tmp, 'sprint-b');
  fs.mkdirSync(sprintA, { recursive: true });
  fs.mkdirSync(sprintB, { recursive: true });

  fs.writeFileSync(path.join(sprintA, 'claims.json'), JSON.stringify({
    claims: [{
      id: 'c001', type: 'constraint', text: 'Must use SSE',
      status: 'active', tags: ['streaming'],
    }],
  }));
  fs.writeFileSync(path.join(sprintB, 'claims.json'), JSON.stringify({
    claims: [{
      id: 'r001', type: 'recommendation', text: 'Avoid SSE, use websockets instead',
      status: 'active', tags: ['streaming'],
    }],
  }));

  const config = {
    sprints: [
      { path: sprintA },
      { path: sprintB },
    ],
  };
  const conflicts = detectConflicts(config, tmp);
  assert(conflicts.length > 0, 'cross-sprint constraint-recommendation detected');
  assert(conflicts.some(c => c.type === 'constraint-recommendation-tension'), 'has constraint-recommendation-tension type');
  fs.rmSync(tmp, { recursive: true });
  console.log('PASS: detectConflicts constraint vs recommendation');
}

// detectConflicts: no conflict within same sprint
{
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchard-same-'));
  const sprintA = path.join(tmp, 'sprint-a');
  fs.mkdirSync(sprintA, { recursive: true });

  fs.writeFileSync(path.join(sprintA, 'claims.json'), JSON.stringify({
    claims: [
      { id: 'r001', type: 'recommendation', text: 'Use SSE', status: 'active', tags: ['streaming'] },
      { id: 'r002', type: 'recommendation', text: 'Do not use WebSocket', status: 'active', tags: ['streaming'] },
    ],
  }));

  const config = { sprints: [{ path: sprintA }] };
  const conflicts = detectConflicts(config, tmp);
  assert.strictEqual(conflicts.length, 0, 'same-sprint claims do not conflict');
  fs.rmSync(tmp, { recursive: true });
  console.log('PASS: detectConflicts same-sprint ignored');
}

// ---- Sync: additional tests ----

// inferStatus: edge cases
{
  assert.strictEqual(inferStatus({ status: 'done' }, { exists: true, claimsCount: 100 }), 'done');
  assert.strictEqual(inferStatus({ status: 'blocked' }, { exists: true, claimsCount: 5 }), 'blocked');
  assert.strictEqual(inferStatus({}, { exists: false, claimsCount: 0 }), 'not-found');
  console.log('PASS: inferStatus priority overrides');
}

// ---- Tracker: readSprintState tests ----

const { readSprintState } = require('../lib/tracker.js');

// readSprintState: nonexistent directory
{
  const state = readSprintState('/nonexistent/path/abc', '/');
  assert.strictEqual(state.exists, false);
  assert.strictEqual(state.status, 'unknown');
  assert.strictEqual(state.claimsCount, 0);
  console.log('PASS: readSprintState nonexistent');
}

// readSprintState: directory with claims.json
{
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchard-tracker-'));
  fs.writeFileSync(path.join(tmp, 'claims.json'), JSON.stringify({
    claims: [
      { id: 'r001', text: 'test' },
      { id: 'r002', text: 'test2' },
    ],
  }));
  const state = readSprintState(tmp, '/');
  assert.strictEqual(state.exists, true);
  assert.strictEqual(state.claimsCount, 2);
  assert.strictEqual(state.hasCompilation, false);
  assert.strictEqual(state.status, 'in-progress');
  fs.rmSync(tmp, { recursive: true });
  console.log('PASS: readSprintState with claims');
}

// readSprintState: directory with claims.json + compilation.json
{
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchard-tracker2-'));
  fs.writeFileSync(path.join(tmp, 'claims.json'), JSON.stringify({
    claims: [{ id: 'r001', text: 'test' }],
  }));
  fs.writeFileSync(path.join(tmp, 'compilation.json'), '{}');
  const state = readSprintState(tmp, '/');
  assert.strictEqual(state.exists, true);
  assert.strictEqual(state.claimsCount, 1);
  assert.strictEqual(state.hasCompilation, true);
  assert.strictEqual(state.status, 'compiled');
  fs.rmSync(tmp, { recursive: true });
  console.log('PASS: readSprintState compiled');
}

// readSprintState: empty claims
{
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchard-tracker3-'));
  fs.writeFileSync(path.join(tmp, 'claims.json'), JSON.stringify({ claims: [] }));
  const state = readSprintState(tmp, '/');
  assert.strictEqual(state.exists, true);
  assert.strictEqual(state.claimsCount, 0);
  assert.strictEqual(state.status, 'not-started');
  fs.rmSync(tmp, { recursive: true });
  console.log('PASS: readSprintState not-started');
}

// ---- Sync: findReady tests ----

const { findReady } = require('../lib/sync.js');

// findReady: sprint with all deps done is ready
{
  const config = {
    sprints: [
      { path: 'a', status: 'done', depends_on: [] },
      { path: 'b', status: 'not-started', depends_on: ['a'] },
    ],
  };
  const ready = findReady(config, '/');
  assert.strictEqual(ready.length, 1);
  assert.strictEqual(ready[0].path, 'b');
  console.log('PASS: findReady deps met');
}

// findReady: sprint with unmet dep not ready
{
  const config = {
    sprints: [
      { path: 'a', status: 'active', depends_on: [] },
      { path: 'b', status: 'not-started', depends_on: ['a'] },
    ],
  };
  const ready = findReady(config, '/');
  assert.strictEqual(ready.length, 0);
  console.log('PASS: findReady deps unmet');
}

// findReady: compiled dep counts as done for dependents
{
  const config = {
    sprints: [
      { path: 'a', status: 'compiled', depends_on: [] },
      { path: 'b', status: 'not-started', depends_on: ['a'] },
    ],
  };
  const ready = findReady(config, '/');
  // Both 'a' (compiled, no deps) and 'b' (deps met via compiled 'a') are ready
  assert(ready.length >= 1, 'at least b is ready');
  assert(ready.some(s => s.path === 'b'), 'b is ready because a is compiled');
  console.log('PASS: findReady compiled dep counts');
}

// ---- Summary ----
console.log('');
console.log('All tests passed.');
