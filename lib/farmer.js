"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

/** Track whether we have already warned about missing token */
let _warnedNoToken = false;

/**
 * POST an activity event to farmer.
 * Graceful failure -- catch and warn, never crash.
 * @param {string} farmerUrl - Base URL of farmer (e.g. http://localhost:9090)
 * @param {object} event - Event object (e.g. { type: "scan", data: {...} })
 * @param {object} [opts] - Options
 * @param {string} [opts.token] - Bearer token for Authorization header
 */
function notify(farmerUrl, event, opts) {
  const token = (opts && opts.token) || null;

  if (!token && !_warnedNoToken) {
    _warnedNoToken = true;
    process.stderr.write(
      "[orchard] no farmer token configured -- requests are unauthenticated\n",
    );
  }

  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        tool: "orchard",
        event,
        timestamp: new Date().toISOString(),
      });

      const url = new URL(`${farmerUrl}/hooks/activity`);
      const transport = url.protocol === "https:" ? https : http;

      const headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers,
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
      "Usage: orchard connect farmer --url http://localhost:9090 [--token <t>]",
    );
    process.exit(1);
  }

  const configPath = path.join(targetDir, ".farmer.json");

  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    const url = args[urlIdx + 1];

    // Read optional --token flag
    const tokenIdx = args.indexOf("--token");
    const token = tokenIdx !== -1 && args[tokenIdx + 1] ? args[tokenIdx + 1] : null;

    const config = token ? { url, token } : { url };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    console.log(`Farmer connection saved to ${configPath}`);
    console.log(`  URL: ${url}`);
    if (token) {
      console.log("  Token: configured");
    } else {
      console.log(
        "  Token: not configured (use --token <t> to enable authenticated requests)",
      );
    }

    // Test the connection
    const result = await notify(
      url,
      { type: "connect", data: { tool: "orchard" } },
      { token },
    );
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
    if (config.token) {
      console.log("  Token: configured");
    } else {
      console.log("  Token: not configured");
    }
    console.log(`Config: ${configPath}`);
  } else {
    console.log("No farmer connection configured.");
    console.log(
      "Usage: orchard connect farmer --url http://localhost:9090 [--token <t>]",
    );
  }
}

/**
 * Read .farmer.json from a directory.
 * @param {string} dir - Directory containing .farmer.json
 * @returns {{ url: string, token?: string } | null}
 */
function loadConfig(dir) {
  const configPath = path.join(dir, ".farmer.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Convenience: read .farmer.json and notify with auth if token exists.
 * @param {string} dir - Directory containing .farmer.json
 * @param {object} event - Event object
 * @returns {Promise<{ok: boolean, status?: number, body?: string, error?: string}>}
 */
function notifyFromConfig(dir, event) {
  const config = loadConfig(dir);
  if (!config || !config.url) {
    return Promise.resolve({ ok: false, error: "no farmer configured" });
  }
  return notify(config.url, event, { token: config.token || null });
}

module.exports = { connect, notify, loadConfig, notifyFromConfig };
