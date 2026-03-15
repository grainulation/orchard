#!/usr/bin/env node
/**
 * orchard serve — local HTTP server for the orchard UI
 *
 * Multi-sprint portfolio dashboard with dependency tracking,
 * cross-sprint conflict detection, and timeline views.
 * SSE for live updates, POST endpoints for actions.
 * Zero npm dependencies (node:http only).
 *
 * Usage:
 *   orchard serve [--port 9097] [--root /path/to/repo]
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, watchFile } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = parseInt(arg('port', '9097'), 10);
const ROOT = resolve(arg('root', process.cwd()));

// ── State ─────────────────────────────────────────────────────────────────────

let state = {
  portfolio: [],
  dependencies: { nodes: [], edges: [] },
  conflicts: [],
  timeline: [],
  lastScan: null,
};

const sseClients = new Set();

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch { sseClients.delete(res); }
  }
}

// ── Scanner — find sprint directories ─────────────────────────────────────────

function scanForSprints(rootDir) {
  const sprints = [];
  const orchardJson = join(rootDir, 'orchard.json');

  // If there's an orchard.json, use its sprint list as hints
  let configSprints = [];
  if (existsSync(orchardJson)) {
    try {
      const config = JSON.parse(readFileSync(orchardJson, 'utf8'));
      configSprints = config.sprints || [];
    } catch { /* ignore */ }
  }

  // Also scan directory tree for claims.json files (up to 3 levels deep)
  const seen = new Set();
  function walk(dir, depth) {
    if (depth > 3) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const sub = join(dir, entry.name);
        const claimsPath = join(sub, 'claims.json');
        if (existsSync(claimsPath) && !seen.has(sub)) {
          seen.add(sub);
          sprints.push(readSprintDir(sub));
        }
        walk(sub, depth + 1);
      }
    } catch { /* permission errors, etc */ }
  }

  // Add configured sprints first
  for (const cs of configSprints) {
    const absPath = resolve(rootDir, cs.path || cs);
    if (existsSync(absPath) && !seen.has(absPath)) {
      seen.add(absPath);
      const info = readSprintDir(absPath);
      // Merge config metadata
      if (cs.assigned_to) info.assignedTo = cs.assigned_to;
      if (cs.deadline) info.deadline = cs.deadline;
      if (cs.status) info.configStatus = cs.status;
      if (cs.depends_on) info.dependsOn = cs.depends_on;
      sprints.push(info);
    }
  }

  walk(rootDir, 0);
  return sprints;
}

function readSprintDir(dir) {
  const name = dir.split('/').pop();
  const info = {
    path: dir,
    name,
    phase: 'unknown',
    status: 'unknown',
    claimCount: 0,
    claimTypes: {},
    hasCompilation: false,
    lastModified: null,
    question: null,
    assignedTo: null,
    deadline: null,
    dependsOn: [],
    configStatus: null,
    tags: [],
  };

  // Read claims.json
  const claimsPath = join(dir, 'claims.json');
  if (existsSync(claimsPath)) {
    try {
      const raw = JSON.parse(readFileSync(claimsPath, 'utf8'));
      const claims = Array.isArray(raw) ? raw : (raw.claims || []);
      info.claimCount = claims.length;

      // Count types
      for (const c of claims) {
        const t = c.type || 'unknown';
        info.claimTypes[t] = (info.claimTypes[t] || 0) + 1;
        // Collect tags
        for (const tag of c.tags || []) {
          if (!info.tags.includes(tag)) info.tags.push(tag);
        }
      }

      // Infer phase from claim ID prefixes
      const prefixes = claims.map(c => (c.id || '').replace(/\d+$/, '')).filter(Boolean);
      if (prefixes.some(p => p.startsWith('cal'))) info.phase = 'calibrate';
      else if (prefixes.some(p => p === 'f')) info.phase = 'feedback';
      else if (prefixes.some(p => p === 'e')) info.phase = 'evaluate';
      else if (prefixes.some(p => p === 'p')) info.phase = 'prototype';
      else if (prefixes.some(p => p === 'x' || p === 'w')) info.phase = 'challenge';
      else if (prefixes.some(p => p === 'r')) info.phase = 'research';
      else if (prefixes.some(p => p === 'd')) info.phase = 'define';

      const stat = statSync(claimsPath);
      info.lastModified = stat.mtime.toISOString();
    } catch { /* ignore parse errors */ }
  }

  // Check compilation
  const compilationPath = join(dir, 'compilation.json');
  if (existsSync(compilationPath)) {
    info.hasCompilation = true;
    try {
      const comp = JSON.parse(readFileSync(compilationPath, 'utf8'));
      if (comp.question) info.question = comp.question;
    } catch { /* ignore */ }
  }

  // Check CLAUDE.md for question
  if (!info.question) {
    const claudePath = join(dir, 'CLAUDE.md');
    if (existsSync(claudePath)) {
      try {
        const md = readFileSync(claudePath, 'utf8');
        const match = md.match(/\*\*Question:\*\*\s*(.+)/);
        if (match) info.question = match[1].trim();
      } catch { /* ignore */ }
    }
  }

  // Infer status
  if (info.claimCount === 0) info.status = 'not-started';
  else if (info.hasCompilation) info.status = 'compiled';
  else info.status = 'active';

  return info;
}

// ── Dependencies — detect cross-sprint references ─────────────────────────────

function buildDependencies(sprints) {
  const nodes = sprints.map(s => ({
    id: s.path,
    name: s.name,
    phase: s.phase,
    status: s.configStatus || s.status,
    claimCount: s.claimCount,
  }));

  const edges = [];
  const sprintPaths = new Set(sprints.map(s => s.path));

  for (const sprint of sprints) {
    // Check explicit depends_on from orchard.json
    for (const dep of sprint.dependsOn || []) {
      const resolved = resolve(ROOT, dep);
      if (sprintPaths.has(resolved)) {
        edges.push({ from: resolved, to: sprint.path, type: 'explicit' });
      }
    }

    // Check claims for cross-references (claim IDs from other sprints)
    const claimsPath = join(sprint.path, 'claims.json');
    if (!existsSync(claimsPath)) continue;

    try {
      const raw = JSON.parse(readFileSync(claimsPath, 'utf8'));
      const claims = Array.isArray(raw) ? raw : (raw.claims || []);
      const text = JSON.stringify(claims);

      for (const other of sprints) {
        if (other.path === sprint.path) continue;
        const otherName = other.name;
        // Check if claims mention other sprint by name or path
        if (text.includes(otherName) && otherName.length > 3) {
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

// ── Conflicts — find cross-sprint contradictions ──────────────────────────────

function detectConflicts(sprints) {
  const allClaims = [];

  for (const sprint of sprints) {
    const claimsPath = join(sprint.path, 'claims.json');
    if (!existsSync(claimsPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(claimsPath, 'utf8'));
      const claims = Array.isArray(raw) ? raw : (raw.claims || []);
      for (const c of claims) {
        allClaims.push({ ...c, _sprint: sprint.name, _sprintPath: sprint.path });
      }
    } catch { /* ignore */ }
  }

  const conflicts = [];
  const byTag = new Map();

  for (const claim of allClaims) {
    for (const tag of claim.tags || []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(claim);
    }
  }

  for (const [tag, claims] of byTag) {
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i];
        const b = claims[j];
        if (a._sprintPath === b._sprintPath) continue;

        // Opposing recommendations
        if (a.type === 'recommendation' && b.type === 'recommendation') {
          if (couldContradict(a.text, b.text)) {
            conflicts.push({
              type: 'opposing-recommendations',
              tag,
              claimA: { id: a.id, text: (a.text || '').substring(0, 120), sprint: a._sprint },
              claimB: { id: b.id, text: (b.text || '').substring(0, 120), sprint: b._sprint },
              severity: 'high',
            });
          }
        }

        // Constraint vs recommendation
        if (
          (a.type === 'constraint' && b.type === 'recommendation') ||
          (a.type === 'recommendation' && b.type === 'constraint')
        ) {
          conflicts.push({
            type: 'constraint-tension',
            tag,
            claimA: { id: a.id, text: (a.text || '').substring(0, 120), sprint: a._sprint, type: a.type },
            claimB: { id: b.id, text: (b.text || '').substring(0, 120), sprint: b._sprint, type: b.type },
            severity: 'medium',
          });
        }
      }
    }
  }

  return conflicts;
}

function couldContradict(textA, textB) {
  if (!textA || !textB) return false;
  const negators = ['not', 'no', 'never', 'avoid', 'instead', 'rather', 'without', "don't"];
  const aWords = new Set(textA.toLowerCase().split(/\s+/));
  const bWords = new Set(textB.toLowerCase().split(/\s+/));
  const aNeg = negators.some(n => aWords.has(n));
  const bNeg = negators.some(n => bWords.has(n));
  return aNeg !== bNeg;
}

// ── Timeline — extract phase transitions ──────────────────────────────────────

function buildTimeline(sprints) {
  return sprints.map(s => {
    const phases = [];
    const claimsPath = join(s.path, 'claims.json');

    if (existsSync(claimsPath)) {
      try {
        const raw = JSON.parse(readFileSync(claimsPath, 'utf8'));
        const claims = Array.isArray(raw) ? raw : (raw.claims || []);

        // Group claims by prefix to detect phase transitions
        const phaseMap = new Map();
        for (const c of claims) {
          const prefix = (c.id || '').replace(/\d+$/, '');
          const date = c.created || c.date || null;
          if (!prefix) continue;

          const phaseName =
            prefix === 'd' ? 'define' :
            prefix === 'r' ? 'research' :
            prefix === 'p' ? 'prototype' :
            prefix === 'e' ? 'evaluate' :
            prefix === 'f' ? 'feedback' :
            prefix === 'x' ? 'challenge' :
            prefix === 'w' ? 'witness' :
            prefix.startsWith('cal') ? 'calibrate' :
            'other';

          if (!phaseMap.has(phaseName)) {
            phaseMap.set(phaseName, { name: phaseName, claimCount: 0, firstDate: date, lastDate: date });
          }
          const p = phaseMap.get(phaseName);
          p.claimCount++;
          if (date && (!p.firstDate || date < p.firstDate)) p.firstDate = date;
          if (date && (!p.lastDate || date > p.lastDate)) p.lastDate = date;
        }

        phases.push(...phaseMap.values());
      } catch { /* ignore */ }
    }

    return {
      name: s.name,
      path: s.path,
      status: s.configStatus || s.status,
      deadline: s.deadline,
      phases,
      lastModified: s.lastModified,
    };
  });
}

// ── Refresh state ─────────────────────────────────────────────────────────────

function refreshState() {
  const sprints = scanForSprints(ROOT);
  state.portfolio = sprints.map(s => ({
    name: s.name,
    path: s.path,
    phase: s.phase,
    status: s.configStatus || s.status,
    claimCount: s.claimCount,
    claimTypes: s.claimTypes,
    hasCompilation: s.hasCompilation,
    question: s.question,
    assignedTo: s.assignedTo,
    deadline: s.deadline,
    lastModified: s.lastModified,
    tags: s.tags.slice(0, 10),
  }));
  state.dependencies = buildDependencies(sprints);
  state.conflicts = detectConflicts(sprints);
  state.timeline = buildTimeline(sprints);
  state.lastScan = new Date().toISOString();
  broadcast({ type: 'state', data: state });
}

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── SSE ──
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'state', data: state })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── API: portfolio ──
  if (req.method === 'GET' && url.pathname === '/api/portfolio') {
    json(res, { portfolio: state.portfolio, lastScan: state.lastScan });
    return;
  }

  // ── API: dependencies ──
  if (req.method === 'GET' && url.pathname === '/api/dependencies') {
    json(res, state.dependencies);
    return;
  }

  // ── API: conflicts ──
  if (req.method === 'GET' && url.pathname === '/api/conflicts') {
    json(res, { conflicts: state.conflicts, count: state.conflicts.length });
    return;
  }

  // ── API: timeline ──
  if (req.method === 'GET' && url.pathname === '/api/timeline') {
    json(res, { timeline: state.timeline });
    return;
  }

  // ── API: scan ──
  if (req.method === 'POST' && url.pathname === '/api/scan') {
    refreshState();
    json(res, { ok: true, sprintCount: state.portfolio.length, lastScan: state.lastScan });
    return;
  }

  // ── Static files ──
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const resolved = resolve(PUBLIC_DIR, '.' + filePath);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  if (existsSync(resolved) && statSync(resolved).isFile()) {
    const ext = extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(readFileSync(resolved));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

// ── Watch for changes ─────────────────────────────────────────────────────────

// Watch orchard.json
const orchardJsonPath = join(ROOT, 'orchard.json');
if (existsSync(orchardJsonPath)) {
  watchFile(orchardJsonPath, { interval: 3000 }, () => refreshState());
}

// ── Start ─────────────────────────────────────────────────────────────────────

refreshState();

server.listen(PORT, () => {
  console.log(`orchard: serving on http://localhost:${PORT}`);
  console.log(`  sprints: ${state.portfolio.length} found`);
  console.log(`  conflicts: ${state.conflicts.length} detected`);
  console.log(`  root: ${ROOT}`);
});
