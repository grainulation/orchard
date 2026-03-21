#!/usr/bin/env node
"use strict";

const path = require("node:path");
const fs = require("node:fs");

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] orchard: ${a.join(" ")}\n`);
}

const COMMANDS = {
  init: "Initialize orchard.json in the current directory",
  plan: "Show sprint dependency graph (--format mermaid|ascii, --mermaid)",
  status: "Show status of all tracked sprints",
  conflicts: "Show cross-sprint conflicts (--severity critical|warning|info)",
  assign: "Assign a person to a sprint",
  sync: "Sync sprint states from their directories",
  decompose: "Auto-decompose a question into sub-sprints",
  hackathon: "Hackathon coordinator (init|team|status|end)",
  dashboard: "Generate unified HTML dashboard",
  serve: "Start the portfolio dashboard web server",
  connect: "Connect to a farmer instance",
  doctor: "Check health of orchard setup",
  help: "Show this help message",
};

function loadConfig(dir) {
  const configPath = path.join(dir, "orchard.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function findOrchardRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "orchard.json"))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function printHelp() {
  console.log("");
  console.log("  orchard - Multi-sprint research orchestrator");
  console.log("");
  console.log("  Usage: orchard <command> [options]");
  console.log("");
  console.log("  Commands:");
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`    ${cmd.padEnd(12)} ${desc}`);
  }
  console.log("");
  console.log("  Serve options:");
  console.log("    --port 9097    Port for the web server (default: 9097)");
  console.log("    --root <dir>   Root directory to scan for sprints");
  console.log("");
  console.log("  Connect:");
  console.log("    orchard connect farmer --url http://localhost:9090");
  console.log("");
  console.log("  Config: orchard.json in project root");
  console.log("");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  vlog("startup", `command=${command}`, `cwd=${process.cwd()}`);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (!COMMANDS[command]) {
    console.error(`orchard: unknown command: ${command}`);
    console.error(`Run "orchard help" to see available commands.`);
    process.exit(1);
  }

  // Serve command — start the HTTP server (ESM module)
  if (command === "serve") {
    const serverPath = path.join(__dirname, "..", "lib", "server.js");
    const { spawn } = require("node:child_process");

    // Forward remaining args to the server
    const serverArgs = args.slice(1);
    const child = spawn(process.execPath, [serverPath, ...serverArgs], {
      stdio: "inherit",
    });

    child.on("close", (code) => process.exit(code ?? 0));
    child.on("error", (err) => {
      console.error(`orchard: failed to start server: ${err.message}`);
      process.exit(1);
    });
    process.on("SIGTERM", () => child.kill("SIGTERM"));
    process.on("SIGINT", () => child.kill("SIGINT"));
    return;
  }

  if (command === "connect") {
    const { connect: farmerConnect } = require("../lib/farmer.js");
    const connectArgs = process.argv.slice(process.argv.indexOf("connect") + 1);
    const rootIdx = connectArgs.indexOf("--root");
    let targetDir = process.cwd();
    if (rootIdx !== -1 && connectArgs[rootIdx + 1]) {
      targetDir = path.resolve(connectArgs[rootIdx + 1]);
    }
    await farmerConnect(targetDir, connectArgs);
    return;
  }

  if (command === "init") {
    const { parseArgs } = require("node:util");
    let rootDir = process.cwd();
    try {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: { root: { type: "string" } },
        allowPositionals: true,
      });
      if (values.root) rootDir = path.resolve(values.root);
    } catch (_) {
      /* ignore parse errors for init */
    }
    const configPath = path.join(rootDir, "orchard.json");
    if (fs.existsSync(configPath)) {
      console.error("orchard: orchard.json already exists");
      process.exit(1);
    }
    const defaultConfig = {
      sprints: [],
      settings: { sync_interval: "manual" },
    };
    fs.writeFileSync(
      configPath,
      JSON.stringify(defaultConfig, null, 2) + "\n",
      "utf8",
    );
    console.log("Initialized orchard.json — add sprints with `orchard plan`");
    process.exit(0);
  }

  const root = findOrchardRoot();
  if (!root && command !== "help" && command !== "doctor") {
    console.error(
      "orchard: no orchard.json found. Run from a directory with orchard.json or a subdirectory.",
    );
    console.error("");
    console.error("Create one:");
    console.error('  { "sprints": [] }');
    process.exit(1);
  }

  const config = root ? loadConfig(root) : { sprints: [] };
  const jsonMode = args.includes("--json");

  switch (command) {
    case "plan": {
      if (jsonMode) {
        const {
          buildGraph,
          topoSort,
          detectCycles,
        } = require("../lib/planner.js");
        const graph = buildGraph(config);
        const order = topoSort(config);
        const cycles = detectCycles(config);
        console.log(JSON.stringify({ graph, order, cycles }, null, 2));
        break;
      }
      const fmtIdx = args.indexOf("--format");
      const planFormat =
        fmtIdx !== -1 && args[fmtIdx + 1] ? args[fmtIdx + 1] : null;
      if (args.includes("--mermaid") || planFormat === "mermaid") {
        const { generateMermaid } = require("../lib/planner.js");
        console.log(generateMermaid(config));
        break;
      }
      if (planFormat === "ascii" || !planFormat) {
        const { printDependencyGraph } = require("../lib/planner.js");
        printDependencyGraph(config, root);
        break;
      }
      console.error(
        `orchard: unknown plan format: ${planFormat}. Supported: ascii, mermaid`,
      );
      process.exit(1);
      break;
    }
    case "status": {
      if (jsonMode) {
        const { getStatusData } = require("../lib/tracker.js");
        const data = getStatusData(config, root);
        console.log(JSON.stringify(data, null, 2));
        break;
      }
      const { printStatus } = require("../lib/tracker.js");
      printStatus(config, root);
      break;
    }
    case "assign": {
      const sprintPath = args[1];
      const person = args[2];
      if (!sprintPath || !person) {
        console.error("orchard: usage: orchard assign <sprint-path> <person>");
        process.exit(1);
      }
      const { assignSprint } = require("../lib/assignments.js");
      assignSprint(config, root, sprintPath, person);
      break;
    }
    case "sync": {
      const { syncAll } = require("../lib/sync.js");
      syncAll(config, root);
      break;
    }
    case "dashboard": {
      const { generateDashboard } = require("../lib/dashboard.js");
      const outPath = args[1] || path.join(root, "orchard-dashboard.html");
      generateDashboard(config, root, outPath);
      break;
    }
    case "conflicts": {
      const {
        detectConflicts,
        filterBySeverity,
        printConflicts,
      } = require("../lib/conflicts.js");
      const sevIdx = args.indexOf("--severity");
      const severity =
        sevIdx !== -1 && args[sevIdx + 1] ? args[sevIdx + 1] : "info";
      if (jsonMode) {
        const all = detectConflicts(config, root);
        const filtered = filterBySeverity(all, severity);
        console.log(
          JSON.stringify(
            { conflicts: filtered, count: filtered.length },
            null,
            2,
          ),
        );
        break;
      }
      printConflicts(config, root, { severity });
      break;
    }
    case "decompose": {
      const question = args
        .filter((a) => !a.startsWith("--"))
        .slice(1)
        .join(" ");
      if (!question) {
        console.error(
          'orchard: usage: orchard decompose "<question>" [--apply] [--max <n>]',
        );
        process.exit(1);
      }
      const maxIdx = args.indexOf("--max");
      const maxSprints =
        maxIdx !== -1 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 5;
      if (args.includes("--apply")) {
        const { applyDecomposition } = require("../lib/decompose.js");
        const sprints = applyDecomposition(root, question, { maxSprints });
        console.log(`Created ${sprints.length} sub-sprints for: "${question}"`);
        for (const s of sprints) {
          console.log(`  ${s.path}`);
        }
      } else {
        const { printDecomposition } = require("../lib/decompose.js");
        printDecomposition(question, { maxSprints });
      }
      break;
    }
    case "hackathon": {
      const sub = args[1];
      const hack = require("../lib/hackathon.js");
      switch (sub) {
        case "init": {
          const nameIdx = args.indexOf("--name");
          const durIdx = args.indexOf("--duration");
          const name =
            nameIdx !== -1 && args[nameIdx + 1] ? args[nameIdx + 1] : undefined;
          const duration =
            durIdx !== -1 && args[durIdx + 1]
              ? parseInt(args[durIdx + 1], 10)
              : undefined;
          const h = hack.initHackathon(root, { name, duration });
          console.log(`Hackathon "${h.name}" started — ends at ${h.endTime}`);
          break;
        }
        case "team": {
          const teamName = args[2];
          const qIdx = args.indexOf("--question");
          const question =
            qIdx !== -1 ? args.slice(qIdx + 1).join(" ") : undefined;
          if (!teamName) {
            console.error(
              'orchard: usage: orchard hackathon team <name> [--question "..."]',
            );
            process.exit(1);
          }
          const result = hack.addTeam(root, teamName, question);
          console.log(
            `Team "${result.teamName}" added — sprint: ${result.sprintPath}`,
          );
          break;
        }
        case "end": {
          const board = hack.endHackathon(root);
          console.log("Hackathon ended! Final leaderboard:");
          for (let i = 0; i < board.length; i++) {
            const t = board[i];
            console.log(
              `  ${i + 1}. ${t.team} — ${t.score}pts (${t.claimCount} claims)`,
            );
          }
          break;
        }
        default: {
          if (jsonMode) {
            const timer = hack.timerStatus(root);
            const board = hack.leaderboard(root);
            console.log(JSON.stringify({ timer, leaderboard: board }, null, 2));
          } else {
            hack.printHackathon(root);
          }
          break;
        }
      }
      break;
    }
    case "doctor": {
      const { runChecks, printReport } = require("../lib/doctor.js");
      const result = runChecks(root || process.cwd());
      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printReport(result);
      }
      if (!result.ok) process.exit(1);
      break;
    }
  }
}

main().catch((err) => {
  console.error(`orchard: ${err.message}`);
  process.exit(1);
});
