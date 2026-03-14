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

// ---- Summary ----
console.log('');
console.log('All tests passed.');
