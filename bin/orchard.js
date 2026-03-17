#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] orchard: ${a.join(' ')}\n`);
}

const COMMANDS = {
  init: 'Initialize orchard.json in the current directory',
  plan: 'Show sprint dependency graph as ASCII',
  status: 'Show status of all tracked sprints',
  assign: 'Assign a person to a sprint',
  sync: 'Sync sprint states from their directories',
  dashboard: 'Generate unified HTML dashboard',
  serve: 'Start the portfolio dashboard web server',
  help: 'Show this help message',
};

function loadConfig(dir) {
  const configPath = path.join(dir, 'orchard.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function findOrchardRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'orchard.json'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function printHelp() {
  console.log('');
  console.log('  orchard - Multi-sprint research orchestrator');
  console.log('');
  console.log('  Usage: orchard <command> [options]');
  console.log('');
  console.log('  Commands:');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`    ${cmd.padEnd(12)} ${desc}`);
  }
  console.log('');
  console.log('  Serve options:');
  console.log('    --port 9097    Port for the web server (default: 9097)');
  console.log('    --root <dir>   Root directory to scan for sprints');
  console.log('');
  console.log('  Config: orchard.json in project root');
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  vlog('startup', `command=${command}`, `cwd=${process.cwd()}`);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (!COMMANDS[command]) {
    console.error(`orchard: unknown command: ${command}`);
    console.error(`Run "orchard help" to see available commands.`);
    process.exit(1);
  }

  // Serve command — start the HTTP server (ESM module)
  if (command === 'serve') {
    const serverPath = path.join(__dirname, '..', 'lib', 'server.js');
    const { spawn } = require('node:child_process');

    // Forward remaining args to the server
    const serverArgs = args.slice(1);
    const child = spawn(process.execPath, [serverPath, ...serverArgs], {
      stdio: 'inherit',
    });

    child.on('close', (code) => process.exit(code ?? 0));
    child.on('error', (err) => {
      console.error(`orchard: failed to start server: ${err.message}`);
      process.exit(1);
    });
    return;
  }

  if (command === 'init') {
    const { parseArgs } = require('node:util');
    let rootDir = process.cwd();
    try {
      const { values } = parseArgs({ args: process.argv.slice(3), options: { root: { type: 'string' } }, allowPositionals: true });
      if (values.root) rootDir = path.resolve(values.root);
    } catch (_) { /* ignore parse errors for init */ }
    const configPath = path.join(rootDir, 'orchard.json');
    if (fs.existsSync(configPath)) {
      console.error('orchard: orchard.json already exists');
      process.exit(1);
    }
    const defaultConfig = { sprints: [], settings: { sync_interval: 'manual' } };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
    console.log('Initialized orchard.json — add sprints with `orchard plan`');
    process.exit(0);
  }

  const root = findOrchardRoot();
  if (!root && command !== 'help') {
    console.error('orchard: no orchard.json found. Run from a directory with orchard.json or a subdirectory.');
    console.error('');
    console.error('Create one:');
    console.error('  { "sprints": [] }');
    process.exit(1);
  }

  const config = root ? loadConfig(root) : { sprints: [] };
  const jsonMode = args.includes('--json');

  switch (command) {
    case 'plan': {
      if (jsonMode) {
        const { buildGraph, topoSort, detectCycles } = require('../lib/planner.js');
        const graph = buildGraph(config);
        const order = topoSort(config);
        const cycles = detectCycles(config);
        console.log(JSON.stringify({ graph, order, cycles }, null, 2));
        break;
      }
      const { printDependencyGraph } = require('../lib/planner.js');
      printDependencyGraph(config, root);
      break;
    }
    case 'status': {
      if (jsonMode) {
        const { getStatusData } = require('../lib/tracker.js');
        const data = getStatusData(config, root);
        console.log(JSON.stringify(data, null, 2));
        break;
      }
      const { printStatus } = require('../lib/tracker.js');
      printStatus(config, root);
      break;
    }
    case 'assign': {
      const sprintPath = args[1];
      const person = args[2];
      if (!sprintPath || !person) {
        console.error('orchard: usage: orchard assign <sprint-path> <person>');
        process.exit(1);
      }
      const { assignSprint } = require('../lib/assignments.js');
      assignSprint(config, root, sprintPath, person);
      break;
    }
    case 'sync': {
      const { syncAll } = require('../lib/sync.js');
      syncAll(config, root);
      break;
    }
    case 'dashboard': {
      const { generateDashboard } = require('../lib/dashboard.js');
      const outPath = args[1] || path.join(root, 'orchard-dashboard.html');
      generateDashboard(config, root, outPath);
      break;
    }
  }
}

main().catch((err) => {
  console.error(`orchard: ${err.message}`);
  process.exit(1);
});
