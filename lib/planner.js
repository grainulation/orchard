'use strict';

const path = require('node:path');

/**
 * Build an adjacency list from sprint dependencies.
 * Returns { nodes: Map<path, sprint>, edges: Map<path, Set<path>> }
 */
function buildGraph(config) {
  const nodes = new Map();
  const edges = new Map();

  for (const sprint of config.sprints || []) {
    nodes.set(sprint.path, sprint);
    edges.set(sprint.path, new Set());
  }

  for (const sprint of config.sprints || []) {
    for (const dep of sprint.depends_on || []) {
      if (edges.has(dep)) {
        edges.get(dep).add(sprint.path);
      }
    }
  }

  return { nodes, edges };
}

/**
 * Topological sort of sprints. Returns ordered array of sprint paths.
 * Throws if a cycle is detected.
 */
function topoSort(config) {
  const sprints = config.sprints || [];
  const inDegree = new Map();
  const adj = new Map();

  for (const s of sprints) {
    inDegree.set(s.path, 0);
    adj.set(s.path, []);
  }

  for (const s of sprints) {
    for (const dep of s.depends_on || []) {
      if (adj.has(dep)) {
        adj.get(dep).push(s.path);
        inDegree.set(s.path, (inDegree.get(s.path) || 0) + 1);
      }
    }
  }

  const queue = [];
  for (const [p, deg] of inDegree) {
    if (deg === 0) queue.push(p);
  }

  const order = [];
  while (queue.length > 0) {
    const curr = queue.shift();
    order.push(curr);
    for (const next of adj.get(curr) || []) {
      const newDeg = inDegree.get(next) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (order.length !== sprints.length) {
    const remaining = sprints.map((s) => s.path).filter((p) => !order.includes(p));
    throw new Error(`Dependency cycle detected involving: ${remaining.join(', ')}`);
  }

  return order;
}

/**
 * Detect dependency cycles. Returns array of cycle paths, empty if acyclic.
 */
function detectCycles(config) {
  try {
    topoSort(config);
    return [];
  } catch {
    return config.sprints.map((s) => s.path);
  }
}

/**
 * Print the dependency graph as ASCII art to stdout.
 */
function printDependencyGraph(config, root) {
  const sprints = config.sprints || [];

  if (sprints.length === 0) {
    console.log('No sprints configured in field.json.');
    return;
  }

  console.log('');
  console.log(`  Sprint Dependency Graph (${sprints.length} sprints)`);
  console.log('  ' + '='.repeat(50));
  console.log('');

  // Build lookup
  const byPath = new Map();
  for (const s of sprints) byPath.set(s.path, s);

  let order;
  try {
    order = topoSort(config);
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return;
  }

  // Compute depth (longest path from root)
  const depth = new Map();
  for (const p of order) {
    const s = byPath.get(p);
    let maxDepth = 0;
    for (const dep of s.depends_on || []) {
      if (depth.has(dep)) {
        maxDepth = Math.max(maxDepth, depth.get(dep) + 1);
      }
    }
    depth.set(p, maxDepth);
  }

  // Group by depth
  const levels = new Map();
  for (const [p, d] of depth) {
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d).push(p);
  }

  const maxLevel = Math.max(...levels.keys(), 0);

  for (let level = 0; level <= maxLevel; level++) {
    const items = levels.get(level) || [];
    const prefix = level === 0 ? 'ROOT' : `L${level}  `;

    for (const p of items) {
      const s = byPath.get(p);
      const name = path.basename(p);
      const status = s.status || 'unknown';
      const assignee = s.assigned_to || 'unassigned';
      const indent = '  '.repeat(level + 1);

      const marker =
        status === 'active' ? '[*]' :
        status === 'done' ? '[x]' :
        status === 'blocked' ? '[!]' :
        '[ ]';

      console.log(`${indent}${marker} ${name} (${assignee})`);

      // Show what it depends on
      for (const dep of s.depends_on || []) {
        console.log(`${indent}    <- ${path.basename(dep)}`);
      }
    }

    if (level < maxLevel) {
      console.log('  ' + ' '.repeat(level * 2) + '  |');
    }
  }

  console.log('');

  // Show deadline summary
  const withDeadlines = sprints.filter((s) => s.deadline);
  if (withDeadlines.length > 0) {
    console.log('  Deadlines:');
    withDeadlines
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .forEach((s) => {
        const name = path.basename(s.path);
        const days = daysUntil(s.deadline);
        const urgency = days < 0 ? 'OVERDUE' : days <= 3 ? 'URGENT' : `${days}d`;
        console.log(`    ${name}: ${s.deadline} (${urgency})`);
      });
    console.log('');
  }
}

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

module.exports = {
  buildGraph,
  topoSort,
  detectCycles,
  printDependencyGraph,
  daysUntil,
};
