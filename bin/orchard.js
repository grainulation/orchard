#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const COMMANDS = {
  init: 'Initialize orchard.json in the current directory',
  plan: 'Show sprint dependency graph as ASCII',
  status: 'Show status of all tracked sprints',
  assign: 'Assign a person to a sprint',
  sync: 'Sync sprint states from their directories',
  dashboard: 'Generate unified HTML dashboard',
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
  console.log('  Config: orchard.json in project root');
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (!COMMANDS[command]) {
    console.error(`Unknown command: ${command}`);
    console.error(`Run "orchard help" to see available commands.`);
    process.exit(1);
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
      console.error('orchard.json already exists');
      process.exit(1);
    }
    const defaultConfig = { sprints: [], settings: { sync_interval: 'manual' } };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
    console.log('Initialized orchard.json — add sprints with `orchard plan`');
    process.exit(0);
  }

  const root = findOrchardRoot();
  if (!root && command !== 'help') {
    console.error('No orchard.json found. Run from a directory with orchard.json or a subdirectory.');
    console.error('');
    console.error('Create one:');
    console.error('  { "sprints": [] }');
    process.exit(1);
  }

  const config = root ? loadConfig(root) : { sprints: [] };

  switch (command) {
    case 'plan': {
      const { printDependencyGraph } = require('../lib/planner.js');
      printDependencyGraph(config, root);
      break;
    }
    case 'status': {
      const { printStatus } = require('../lib/tracker.js');
      printStatus(config, root);
      break;
    }
    case 'assign': {
      const { assignSprint } = require('../lib/assignments.js');
      const sprintPath = args[1];
      const person = args[2];
      if (!sprintPath || !person) {
        console.error('Usage: orchard assign <sprint-path> <person>');
        process.exit(1);
      }
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
  console.error(err.message);
  process.exit(1);
});
