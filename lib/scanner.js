/**
 * scanner.js — scan a root directory for wheat sprint directories
 *
 * Looks for claims.json files to identify sprint directories.
 * Also reads orchard.json for explicitly configured sprints.
 * Zero npm dependencies.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Scan a root directory for sprint directories.
 * A sprint directory is any directory containing claims.json.
 *
 * @param {string} rootDir - absolute path to scan
 * @param {object} [opts] - options
 * @param {number} [opts.maxDepth=3] - max directory depth to scan
 * @returns {Array<object>} array of sprint info objects
 */
export function scan(rootDir, opts = {}) {
  const maxDepth = opts.maxDepth ?? 3;
  const sprints = [];
  const seen = new Set();

  // Check orchard.json first for configured sprints
  const orchardPath = join(rootDir, 'orchard.json');
  if (existsSync(orchardPath)) {
    try {
      const config = JSON.parse(readFileSync(orchardPath, 'utf8'));
      for (const entry of config.sprints || []) {
        const p = typeof entry === 'string' ? entry : entry.path;
        const absPath = resolve(rootDir, p);
        if (existsSync(join(absPath, 'claims.json')) && !seen.has(absPath)) {
          seen.add(absPath);
          sprints.push(readSprint(absPath, entry));
        }
      }
    } catch { /* ignore */ }
  }

  // Walk directory tree
  walk(rootDir, 0);
  return sprints;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const sub = join(dir, entry.name);
        if (existsSync(join(sub, 'claims.json')) && !seen.has(sub)) {
          seen.add(sub);
          sprints.push(readSprint(sub));
        }
        walk(sub, depth + 1);
      }
    } catch { /* permission errors */ }
  }
}

/**
 * Read sprint metadata from a directory.
 */
function readSprint(dir, configEntry) {
  const name = dir.split('/').pop();
  const info = {
    path: dir,
    name,
    claimCount: 0,
    claimTypes: {},
    hasCompilation: false,
    lastModified: null,
    question: null,
  };

  // Merge config
  if (configEntry && typeof configEntry === 'object') {
    if (configEntry.assigned_to) info.assignedTo = configEntry.assigned_to;
    if (configEntry.deadline) info.deadline = configEntry.deadline;
    if (configEntry.status) info.status = configEntry.status;
    if (configEntry.depends_on) info.dependsOn = configEntry.depends_on;
  }

  // Read claims
  const claimsPath = join(dir, 'claims.json');
  if (existsSync(claimsPath)) {
    try {
      const raw = JSON.parse(readFileSync(claimsPath, 'utf8'));
      const claims = Array.isArray(raw) ? raw : (raw.claims || []);
      info.claimCount = claims.length;
      for (const c of claims) {
        const t = c.type || 'unknown';
        info.claimTypes[t] = (info.claimTypes[t] || 0) + 1;
      }
      info.lastModified = statSync(claimsPath).mtime.toISOString();
    } catch { /* ignore */ }
  }

  // Check compilation
  info.hasCompilation = existsSync(join(dir, 'compilation.json'));

  return info;
}
