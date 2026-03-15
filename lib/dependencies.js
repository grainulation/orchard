/**
 * dependencies.js — detect cross-sprint references
 *
 * Finds explicit (orchard.json depends_on) and implicit
 * (claim text references) dependencies between sprints.
 * Zero npm dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Build a dependency graph from a list of scanned sprints.
 *
 * @param {Array} sprints - from scanner.scan()
 * @param {string} rootDir - root directory for resolving relative paths
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildGraph(sprints, rootDir) {
  const nodes = sprints.map(s => ({
    id: s.path,
    name: s.name,
    claimCount: s.claimCount,
    status: s.status || (s.hasCompilation ? 'compiled' : s.claimCount > 0 ? 'active' : 'not-started'),
  }));

  const edges = [];
  const sprintPaths = new Set(sprints.map(s => s.path));

  for (const sprint of sprints) {
    // Explicit dependencies from orchard.json
    for (const dep of sprint.dependsOn || []) {
      const abs = resolve(rootDir, dep);
      if (sprintPaths.has(abs)) {
        edges.push({ from: abs, to: sprint.path, type: 'explicit' });
      }
    }

    // Implicit: claim text mentioning another sprint by name
    const claimsPath = join(sprint.path, 'claims.json');
    if (!existsSync(claimsPath)) continue;

    try {
      const raw = JSON.parse(readFileSync(claimsPath, 'utf8'));
      const claims = Array.isArray(raw) ? raw : (raw.claims || []);
      const text = JSON.stringify(claims);

      for (const other of sprints) {
        if (other.path === sprint.path) continue;
        if (other.name.length <= 3) continue; // skip short names to avoid false positives
        if (text.includes(other.name)) {
          const exists = edges.some(e =>
            e.from === other.path && e.to === sprint.path && e.type === 'reference'
          );
          if (!exists) {
            edges.push({ from: other.path, to: sprint.path, type: 'reference' });
          }
        }
      }
    } catch { /* ignore */ }
  }

  return { nodes, edges };
}

/**
 * Find sprints with no upstream dependencies (root nodes).
 */
export function findRoots(graph) {
  const targets = new Set(graph.edges.map(e => e.to));
  return graph.nodes.filter(n => !targets.has(n.id));
}

/**
 * Find sprints with no downstream dependents (leaf nodes).
 */
export function findLeaves(graph) {
  const sources = new Set(graph.edges.map(e => e.from));
  return graph.nodes.filter(n => !sources.has(n.id));
}
