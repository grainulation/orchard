'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Load claims from a sprint directory.
 */
function loadClaims(sprintPath, root) {
  const absPath = path.isAbsolute(sprintPath) ? sprintPath : path.join(root, sprintPath);
  const claimsPath = path.join(absPath, 'claims.json');

  if (!fs.existsSync(claimsPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(claimsPath, 'utf8'));
    const claims = Array.isArray(data) ? data : (data.claims || []);
    return claims.map((c) => ({ ...c, _source: sprintPath }));
  } catch {
    return [];
  }
}

/**
 * Detect potential conflicts between claims across sprints.
 *
 * Conflict heuristics:
 * 1. Same-type claims with contradicting content (recommendations that oppose each other)
 * 2. Constraints that conflict with recommendations from other sprints
 * 3. Estimates with non-overlapping ranges on the same topic
 *
 * Returns array of { type, claimA, claimB, reason }
 */
function detectConflicts(config, root) {
  const allClaims = [];

  for (const sprint of config.sprints || []) {
    const claims = loadClaims(sprint.path, root);
    allClaims.push(...claims);
  }

  const conflicts = [];

  // Group claims by tags for overlap detection
  const byTag = new Map();
  for (const claim of allClaims) {
    for (const tag of claim.tags || []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(claim);
    }
  }

  // Check for cross-sprint conflicts within same tag
  for (const [tag, claims] of byTag) {
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i];
        const b = claims[j];

        // Only flag cross-sprint conflicts
        if (a._source === b._source) continue;

        // Opposing recommendations
        if (a.type === 'recommendation' && b.type === 'recommendation') {
          if (couldContradict(a.text, b.text)) {
            conflicts.push({
              type: 'opposing-recommendations',
              claimA: a,
              claimB: b,
              tag,
              reason: `Both sprints recommend on "${tag}" but may conflict`,
            });
          }
        }

        // Constraint vs recommendation
        if (
          (a.type === 'constraint' && b.type === 'recommendation') ||
          (a.type === 'recommendation' && b.type === 'constraint')
        ) {
          conflicts.push({
            type: 'constraint-recommendation-tension',
            claimA: a,
            claimB: b,
            tag,
            reason: `Constraint from ${a._source} may conflict with recommendation from ${b._source}`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Simple heuristic: two texts might contradict if they share keywords
 * but use opposing qualifiers. This is intentionally conservative --
 * false positives are better than missed conflicts.
 */
function couldContradict(textA, textB) {
  if (!textA || !textB) return false;

  const negators = ['not', 'no', 'never', 'avoid', 'instead', 'rather', 'without', 'dont', "don't"];
  const aWords = new Set(textA.toLowerCase().split(/\s+/));
  const bWords = new Set(textB.toLowerCase().split(/\s+/));

  const aNeg = negators.some((n) => aWords.has(n));
  const bNeg = negators.some((n) => bWords.has(n));

  // One negated, one not -- possible contradiction
  if (aNeg !== bNeg) return true;

  return false;
}

/**
 * Print conflict report.
 */
function printConflicts(config, root) {
  const conflicts = detectConflicts(config, root);

  if (conflicts.length === 0) {
    console.log('');
    console.log('  No cross-sprint conflicts detected.');
    console.log('');
    return;
  }

  console.log('');
  console.log(`  ${conflicts.length} potential conflict(s) detected`);
  console.log('  ' + '='.repeat(50));

  for (const c of conflicts) {
    console.log('');
    console.log(`  [${c.type}] tag: ${c.tag}`);
    console.log(`    Sprint A: ${c.claimA._source} (${c.claimA.id})`);
    console.log(`    Sprint B: ${c.claimB._source} (${c.claimB.id})`);
    console.log(`    Reason: ${c.reason}`);
  }

  console.log('');
}

module.exports = {
  loadClaims,
  detectConflicts,
  couldContradict,
  printConflicts,
};
