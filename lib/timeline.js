/**
 * timeline.js — extract phase transitions and dates from sprint metadata
 *
 * Builds a timeline view suitable for Gantt-style rendering.
 * Zero npm dependencies.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase order for sorting.
 */
const PHASE_ORDER = ['define', 'research', 'prototype', 'evaluate', 'challenge', 'witness', 'feedback', 'calibrate'];

/**
 * Map claim ID prefix to phase name.
 */
function prefixToPhase(prefix) {
  const map = {
    d: 'define',
    r: 'research',
    p: 'prototype',
    e: 'evaluate',
    f: 'feedback',
    x: 'challenge',
    w: 'witness',
  };
  if (prefix.startsWith('cal')) return 'calibrate';
  if (prefix.startsWith('burn')) return 'control-burn';
  return map[prefix] || 'other';
}

/**
 * Build timeline data from a list of scanned sprints.
 *
 * @param {Array} sprints - from scanner.scan()
 * @returns {Array} timeline entries with phase breakdown
 */
export function buildTimeline(sprints) {
  return sprints.map(sprint => {
    const entry = {
      name: sprint.name,
      path: sprint.path,
      status: sprint.status || 'unknown',
      deadline: sprint.deadline || null,
      phases: [],
      totalClaims: sprint.claimCount,
      lastModified: sprint.lastModified,
    };

    const claimsPath = join(sprint.path, 'claims.json');
    if (!existsSync(claimsPath)) return entry;

    try {
      const raw = JSON.parse(readFileSync(claimsPath, 'utf8'));
      const claims = Array.isArray(raw) ? raw : (raw.claims || []);

      const phaseMap = new Map();

      for (const c of claims) {
        const prefix = (c.id || '').replace(/\d+$/, '');
        if (!prefix) continue;

        const phaseName = prefixToPhase(prefix);
        const date = c.created || c.date || null;

        if (!phaseMap.has(phaseName)) {
          phaseMap.set(phaseName, {
            name: phaseName,
            claimCount: 0,
            firstDate: date,
            lastDate: date,
          });
        }

        const p = phaseMap.get(phaseName);
        p.claimCount++;
        if (date && (!p.firstDate || date < p.firstDate)) p.firstDate = date;
        if (date && (!p.lastDate || date > p.lastDate)) p.lastDate = date;
      }

      // Sort phases by canonical order
      entry.phases = [...phaseMap.values()].sort((a, b) => {
        const ai = PHASE_ORDER.indexOf(a.name);
        const bi = PHASE_ORDER.indexOf(b.name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    } catch { /* ignore */ }

    return entry;
  });
}

/**
 * Get the current phase of a sprint (the latest phase with claims).
 */
export function currentPhase(timelineEntry) {
  if (!timelineEntry.phases.length) return 'unknown';
  return timelineEntry.phases[timelineEntry.phases.length - 1].name;
}
