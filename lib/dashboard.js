'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getStatusData } = require('./tracker.js');
const { detectConflicts } = require('./conflicts.js');

/**
 * Generate a self-contained HTML dashboard for all sprints.
 */
function generateDashboard(config, root, outPath) {
  const sprints = getStatusData(config, root);
  const conflicts = detectConflicts(config, root);
  const now = new Date().toISOString().split('T')[0];

  const active = sprints.filter((s) => s.effectiveStatus === 'active').length;
  const done = sprints.filter((s) => s.effectiveStatus === 'done').length;
  const blocked = sprints.filter((s) => s.effectiveStatus === 'blocked').length;
  const totalClaims = sprints.reduce((sum, s) => sum + s.state.claimsCount, 0);

  // Load template if available, otherwise use inline
  const templatePath = path.join(__dirname, '..', 'templates', 'orchard-dashboard.html');
  let html;

  if (fs.existsSync(templatePath)) {
    html = fs.readFileSync(templatePath, 'utf8');
    html = html
      .replace('{{GENERATED_DATE}}', now)
      .replace('{{TOTAL_SPRINTS}}', sprints.length.toString())
      .replace('{{ACTIVE_SPRINTS}}', active.toString())
      .replace('{{DONE_SPRINTS}}', done.toString())
      .replace('{{BLOCKED_SPRINTS}}', blocked.toString())
      .replace('{{TOTAL_CLAIMS}}', totalClaims.toString())
      .replace('{{CONFLICT_COUNT}}', conflicts.length.toString())
      .replace('{{SPRINT_ROWS}}', buildSprintRows(sprints))
      .replace('{{CONFLICT_ROWS}}', buildConflictRows(conflicts));
  } else {
    html = buildInlineDashboard(sprints, conflicts, {
      now, active, done, blocked, totalClaims,
    });
  }

  fs.writeFileSync(outPath, html);
  console.log(`Dashboard written to ${outPath}`);
}

function buildSprintRows(sprints) {
  return sprints
    .map((s) => {
      const name = path.basename(s.path);
      const status = s.effectiveStatus;
      const statusClass =
        status === 'active' ? 'status-active' :
        status === 'done' ? 'status-done' :
        status === 'blocked' ? 'status-blocked' :
        'status-unknown';
      const assignee = s.assigned_to || '-';
      const deadline = s.deadline || '-';
      const claims = s.state.claimsCount;

      return `<tr>
        <td>${name}</td>
        <td><span class="${statusClass}">${status}</span></td>
        <td>${claims}</td>
        <td>${assignee}</td>
        <td>${deadline}</td>
        <td title="${s.question || ''}">${(s.question || '-').substring(0, 60)}</td>
      </tr>`;
    })
    .join('\n');
}

function buildConflictRows(conflicts) {
  if (conflicts.length === 0) {
    return '<tr><td colspan="4">No conflicts detected</td></tr>';
  }

  return conflicts
    .map((c) => {
      return `<tr>
        <td>${c.type}</td>
        <td>${c.tag}</td>
        <td>${path.basename(c.claimA._source)} vs ${path.basename(c.claimB._source)}</td>
        <td>${c.reason}</td>
      </tr>`;
    })
    .join('\n');
}

function buildInlineDashboard(sprints, conflicts, stats) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orchard Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
  h1 { color: #a16207; margin-bottom: 0.5rem; }
  .subtitle { color: #737373; margin-bottom: 2rem; }
  .stats { display: flex; gap: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .stat { background: #171717; border: 1px solid #262626; border-radius: 8px; padding: 1rem 1.5rem; min-width: 120px; }
  .stat-value { font-size: 2rem; font-weight: 700; }
  .stat-label { color: #737373; font-size: 0.85rem; }
  .stat-active .stat-value { color: #22c55e; }
  .stat-done .stat-value { color: #a16207; }
  .stat-blocked .stat-value { color: #ef4444; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  th { text-align: left; padding: 0.75rem; border-bottom: 2px solid #262626; color: #a16207; font-size: 0.85rem; text-transform: uppercase; }
  td { padding: 0.75rem; border-bottom: 1px solid #1a1a1a; }
  tr:hover { background: #171717; }
  .status-active { color: #22c55e; font-weight: 600; }
  .status-done { color: #a16207; }
  .status-blocked { color: #ef4444; font-weight: 600; }
  .status-unknown { color: #737373; }
  .section { margin-bottom: 2rem; }
  .section h2 { color: #d4d4d4; margin-bottom: 1rem; font-size: 1.1rem; }
  footer { color: #525252; font-size: 0.8rem; margin-top: 3rem; }
</style>
</head>
<body>
<h1>Orchard Dashboard</h1>
<p class="subtitle">Generated ${stats.now}</p>

<div class="stats">
  <div class="stat"><div class="stat-value">${sprints.length}</div><div class="stat-label">Total Sprints</div></div>
  <div class="stat stat-active"><div class="stat-value">${stats.active}</div><div class="stat-label">Active</div></div>
  <div class="stat stat-done"><div class="stat-value">${stats.done}</div><div class="stat-label">Done</div></div>
  <div class="stat stat-blocked"><div class="stat-value">${stats.blocked}</div><div class="stat-label">Blocked</div></div>
  <div class="stat"><div class="stat-value">${stats.totalClaims}</div><div class="stat-label">Total Claims</div></div>
</div>

<div class="section">
<h2>Sprints</h2>
<table>
<thead><tr><th>Sprint</th><th>Status</th><th>Claims</th><th>Assigned</th><th>Deadline</th><th>Question</th></tr></thead>
<tbody>
${buildSprintRows(sprints)}
</tbody>
</table>
</div>

<div class="section">
<h2>Cross-Sprint Conflicts (${conflicts.length})</h2>
<table>
<thead><tr><th>Type</th><th>Tag</th><th>Sprints</th><th>Reason</th></tr></thead>
<tbody>
${buildConflictRows(conflicts)}
</tbody>
</table>
</div>

<footer>@grainulator/orchard</footer>
</body>
</html>`;
}

module.exports = {
  generateDashboard,
};
