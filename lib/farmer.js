"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

/**
 * POST an activity event to farmer.
 * Graceful failure -- catch and warn, never crash.
 * @param {string} farmerUrl - Base URL of farmer (e.g. http://localhost:9090)
 * @param {object} event - Event object (e.g. { type: "scan", data: {...} })
 */
function notify(farmerUrl, event) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        tool: "orchard",
        event,
        timestamp: new Date().toISOString(),
      });

      const url = new URL(`${farmerUrl}/hooks/activity`);
      const transport = url.protocol === "https:" ? https : http;

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 5000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () =>
            resolve({ ok: res.statusCode < 400, status: res.statusCode, body }),
          );
        },
      );

      req.on("error", (err) => {
        console.error(`[orchard] farmer notify failed: ${err.message}`);
        resolve({ ok: false, error: err.message });
      });

      req.on("timeout", () => {
        req.destroy();
        console.error("[orchard] farmer notify timed out");
        resolve({ ok: false, error: "timeout" });
      });

      req.write(payload);
      req.end();
    } catch (err) {
      console.error(`[orchard] farmer notify failed: ${err.message}`);
      resolve({ ok: false, error: err.message });
    }
  });
}

/**
 * CLI handler for `orchard connect farmer`.
 * Reads/writes .farmer.json in targetDir.
 * @param {string} targetDir - Working directory
 * @param {string[]} args - CLI arguments (e.g. ["farmer", "--url", "http://..."])
 */
async function connect(targetDir, args) {
  const subcommand = args[0];
  if (subcommand !== "farmer") {
    console.error(
      "Usage: orchard connect farmer [--url http://localhost:9090]",
    );
    process.exit(1);
  }

  const configPath = path.join(targetDir, ".farmer.json");

  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    const url = args[urlIdx + 1];
    const config = { url };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    console.log(`Farmer connection saved to ${configPath}`);
    console.log(`  URL: ${url}`);

    // Test the connection
    const result = await notify(url, {
      type: "connect",
      data: { tool: "orchard" },
    });
    if (result.ok) {
      console.log("  Connection test: OK");
    } else {
      console.log(
        `  Connection test: failed (${result.error || "status " + result.status})`,
      );
      console.log(
        "  Farmer may not be running. The URL is saved and will be used when farmer is available.",
      );
    }
    return;
  }

  // Show current config
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log(`Farmer connection: ${config.url}`);
    console.log(`Config: ${configPath}`);
  } else {
    console.log("No farmer connection configured.");
    console.log("Usage: orchard connect farmer --url http://localhost:9090");
  }
}

module.exports = { connect, notify };
