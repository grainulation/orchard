'use strict';

/**
 * orchard -> mill edge: export trigger for completed sprints.
 *
 * When orchard detects a sprint is "done", it can trigger mill's
 * export API to produce formatted output. Probes mill via localhost
 * or filesystem. Graceful fallback if mill is not available.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const MILL_PORT = 9094;
const MILL_SIBLINGS = [
  path.join(__dirname, '..', '..', 'mill'),
  path.join(__dirname, '..', '..', '..', 'mill'),
];

/**
 * Check if mill is reachable (HTTP or filesystem).
 * Returns { available: true, method, formats? } or { available: false }.
 */
function detectMill() {
  for (const dir of MILL_SIBLINGS) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const meta = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (meta.name === '@grainulation/mill') {
          return { available: true, method: 'filesystem', path: dir };
        }
      } catch { continue; }
    }
  }
  return { available: false };
}

/**
 * Trigger an export via mill's HTTP API.
 * @param {string} sprintPath — absolute path to the sprint directory
 * @param {string} format — export format name (e.g. "markdown", "csv", "json-ld")
 * @returns {Promise<{ok: boolean, job?, error?}>}
 */
function exportSprint(sprintPath, format) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ format, options: { source: sprintPath } });
    const req = http.request({
      hostname: '127.0.0.1',
      port: MILL_PORT,
      path: '/api/export',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.error ? { ok: false, error: result.error } : { ok: true, job: result.job });
        } catch {
          resolve({ ok: false, error: 'Invalid response from mill' });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'mill not reachable on port ' + MILL_PORT }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'mill request timed out' }); });
    req.write(body);
    req.end();
  });
}

/**
 * List available export formats from mill's API.
 * @returns {Promise<{available: boolean, formats?: Array}>}
 */
function listFormats() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${MILL_PORT}/api/formats`, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ available: true, formats: data.formats || [] });
        } catch {
          resolve({ available: false });
        }
      });
    });
    req.on('error', () => resolve({ available: false }));
    req.on('timeout', () => { req.destroy(); resolve({ available: false }); });
  });
}

module.exports = { detectMill, exportSprint, listFormats, MILL_PORT };
