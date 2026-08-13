#!/usr/bin/env node

/**
 * Outbound local Runtime agent for the hosted Suhuang MCP control plane.
 *
 * The agent never accepts inbound connections. It polls the configured
 * control plane, invokes the bundled local stdio bridge with an allow-listed
 * tool call, and posts the structured result back over HTTPS. Set
 * SUHUANG_AGENT_ONCE=1 for a single diagnostic poll in tests or installers.
 */

import { accessSync, constants } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const AGENT_VERSION = "0.1.0";
const DEFAULT_POLL_MS = 2_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 45_000;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const LOCAL_TOOL_NAMES = new Set([
  "suhuang_runtime_status",
  "suhuang_doctor",
  "suhuang_list_specs",
  "suhuang_validate_spec",
  "suhuang_list_adapters",
  "suhuang_list_providers",
  "suhuang_get_status",
  "suhuang_get_stats",
  "suhuang_prepare_grading",
  "suhuang_start_grading",
  "suhuang_control_grading",
]);
const REMOTE_ARGUMENT_KEYS = {
  suhuang_runtime_status: [],
  suhuang_doctor: ["module"],
  suhuang_list_specs: ["root"],
  suhuang_validate_spec: ["specPath"],
  suhuang_list_adapters: [],
  suhuang_list_providers: [],
  suhuang_get_status: [],
  suhuang_get_stats: ["runDir", "sessionId"],
  suhuang_prepare_grading: ["specPath", "adapter", "provider", "model", "confidenceThreshold", "runDir"],
  suhuang_start_grading: ["specPath", "confirm", "adapter", "provider", "model", "confidenceThreshold", "runDir"],
  suhuang_control_grading: ["action", "confirm"],
};

const agentDir = dirname(fileURLToPath(import.meta.url));

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function envInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function controlPlaneUrl() {
  const raw = process.env.SUHUANG_CONTROL_PLANE_URL || process.env.SUHUANG_MCP_URL;
  if (!raw) throw new Error("Set SUHUANG_CONTROL_PLANE_URL to the hosted control-plane origin");
  const url = new URL(raw);
  if (url.protocol !== "https:" && process.env.SUHUANG_ALLOW_INSECURE_HTTP !== "1") {
    throw new Error("The Runtime agent requires an HTTPS control-plane URL (set SUHUANG_ALLOW_INSECURE_HTTP=1 only for local tests)");
  }
  return url.toString().replace(/\/$/, "");
}

function localBridgePath() {
  const configured = process.env.SUHUANG_LOCAL_MCP;
  if (configured) return resolve(configured);
  return resolve(agentDir, "server.mjs");
}

function ensureRelativePath(value, key) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Argument ${key} must be a non-empty string`);
  if (isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
    throw new Error(`Remote Runtime agent accepts only relative ${key} paths`);
  }
}

function redactString(value) {
  return value
    .replace(/(?:\/Users\/|\/private\/|\/var\/folders\/|\/home\/)[^\s"'`]+/g, "<local-path>")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "<local-path>");
}

function redactPageContext(value) {
  if (!value || typeof value !== "object") return null;
  return {
    site: value.site || null,
    paperIndex: value.paperIndex ?? null,
    questionId: value.questionId || null,
  };
}

function redactQuestion(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: value.id || null,
    subject: value.subject || null,
    type: value.type || null,
    maxScore: value.maxScore ?? null,
    blankCount: Array.isArray(value.blanks) ? value.blanks.length : null,
    criteriaCount: Array.isArray(value.criteria) ? value.criteria.length : null,
  };
}

function redactPendingDecision(value) {
  if (!value || typeof value !== "object") return null;
  return {
    page_context: redactPageContext(value.page_context),
    suggested_score: value.suggested_score ?? null,
    confidence: value.confidence ?? null,
    review_flags: redactObject(value.review_flags || []),
    model_diagnostics: redactObject(value.model_diagnostics || null),
    timing_diagnostics: redactObject(value.timing_diagnostics || null),
  };
}

function redactLastRecord(value) {
  if (!value || typeof value !== "object") return null;
  return {
    timestamp: value.timestamp || null,
    page_context: redactPageContext(value.page_context),
    question_id: value.question_id || null,
    suggested_score: value.suggested_score ?? null,
    confidence: value.confidence ?? null,
    review_flags: redactObject(value.review_flags || []),
    status: value.status || null,
    reason: value.reason || null,
  };
}

function validateCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)) throw new Error("Invalid command payload");
  if (!LOCAL_TOOL_NAMES.has(command.tool)) throw new Error(`Tool is not allowed by the local Runtime agent: ${command.tool}`);
  const args = command.arguments || {};
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Command arguments must be an object");
  const allowed = new Set(REMOTE_ARGUMENT_KEYS[command.tool] || []);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) throw new Error(`Argument is not allowed by the local Runtime agent: ${key}`);
  }
  for (const key of ["root", "specPath", "runDir"]) ensureRelativePath(args[key], key);
  if (args.includeRecords === true) throw new Error("The hosted Runtime agent does not return per-student record rows");
  if (["suhuang_start_grading", "suhuang_control_grading"].includes(command.tool)) {
    if (args.confirm !== true) throw new Error("Live grading commands require confirm=true");
  }
  if (command.tool === "suhuang_control_grading" && !["pause", "resume", "stop", "retry", "submit"].includes(args.action)) {
    throw new Error("Unsupported grading control action");
  }
  return { tool: command.tool, arguments: args };
}

function redactObject(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => redactObject(item));
  if (typeof value === "string") return redactString(value);
  if (!value || typeof value !== "object") return value;
  const lowerKey = key.toLowerCase();
  if (lowerKey === "page_context" || lowerKey === "pagecontext") return redactPageContext(value);
  if (lowerKey === "question") return redactQuestion(value);
  if (lowerKey === "pending_decision" || lowerKey === "pendingdecision") return redactPendingDecision(value);
  if (lowerKey === "last_record" || lowerKey === "lastrecord") return redactLastRecord(value);
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const lower = childKey.toLowerCase();
    if ([
      "clipath",
      "cwd",
      "path",
      "root",
      "rundir",
      "extension_dir",
      "manifest_path",
      "package_path",
      "sidepanel_path",
      "dist_path",
      "user_config_path",
      "student_id",
      "studentid",
      "ocr_text",
      "ocrtext",
      "grade_payload",
      "gradepayload",
      "image_data",
      "imagedata",
      "image_url",
      "imageurl",
      "saved_image_path",
      "submit_result",
      "submitresult",
      "page_url",
      "pageurl",
      "pagetitle",
      "answer",
      "content_markdown",
      "contentmarkdown",
      "api_key",
      "apikey",
      "vision_api_key",
      "visionapikey",
      "openai_api_key",
      "model_api_key",
      "access_token",
      "accesstoken",
      "bot_token",
      "bottoken",
      "sign_secret",
      "signsecret",
      "webhook_url",
      "webhookurl",
      "cookies",
      "authorization",
    ].includes(lower)) continue;
    if (childKey === "text" && typeof childValue === "string") {
      try {
        result[childKey] = JSON.stringify(redactObject(JSON.parse(childValue)));
      } catch {
        result[childKey] = redactString(childValue);
      }
      continue;
    }
    result[childKey] = redactObject(childValue, childKey);
  }
  return result;
}

function redactResult(result) {
  const value = redactObject(result);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RESULT_BYTES) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: "Local Runtime result exceeded the relay size limit" }) }],
    };
  }
  return value;
}

function localMcpCall(tool, args) {
  const bridge = localBridgePath();
  try {
    accessSync(bridge, constants.R_OK);
  } catch {
    return Promise.resolve({
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: `Local MCP bridge not found: ${bridge}` }) }],
    });
  }

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [bridge], {
      cwd: process.env.SUHUANG_ROOT ? resolve(process.env.SUHUANG_ROOT) : agentDir,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    const input = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    let settled = false;
    let initialized = false;
    let stderr = "";
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.close();
      child.kill();
      resolvePromise(redactResult(result));
    };
    const timer = setTimeout(() => finish({
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: "Local MCP bridge timed out", stderr: stderr.trim() || null }) }],
    }), envInteger("SUHUANG_LOCAL_COMMAND_TIMEOUT_MS", DEFAULT_COMMAND_TIMEOUT_MS));

    input.on("line", (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === 1 && message.result && !initialized) {
        initialized = true;
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } })}\n`);
        return;
      }
      if (message.id === 2) {
        if (message.result) finish(message.result);
        else finish({ isError: true, content: [{ type: "text", text: JSON.stringify(message.error || { error: "Local MCP call failed" }) }] });
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString().slice(-4096); });
    child.on("error", (error) => finish({
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: error.message, bridge: basename(bridge) }) }],
    }));
    child.on("close", (code) => {
      if (!settled && code !== 0) finish({
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: `Local MCP bridge exited with code ${code}`, stderr: stderr.trim() || null }) }],
      });
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "suhuang-scroll-agent", version: AGENT_VERSION } },
    })}\n`);
  });
}

async function request(base, path, token, body = undefined) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Control plane returned HTTP ${response.status}`);
  return payload;
}

async function acquireAgentToken(base) {
  const configured = process.env.SUHUANG_AGENT_TOKEN || null;
  if (configured) return { token: configured, pairing: null };
  const code = process.env.SUHUANG_PAIRING_CODE;
  if (!code) throw new Error("Set SUHUANG_AGENT_TOKEN or SUHUANG_PAIRING_CODE before starting the Runtime agent");
  const pairing = await request(base, "/v1/runtime/pair", null, { code });
  if (!pairing.agentToken) throw new Error("Control plane pairing did not return a Runtime Agent token");
  return { token: pairing.agentToken, pairing };
}

async function run() {
  const base = controlPlaneUrl();
  const acquired = await acquireAgentToken(base);
  const token = acquired.token;
  if (acquired.pairing) {
    const pairing = acquired.pairing;
    process.stdout.write(`${JSON.stringify({ paired: true, tenant: pairing.tenant, expiresAt: pairing.expiresAt })}\n`);
  }
  const pollMs = envInteger("SUHUANG_AGENT_POLL_MS", DEFAULT_POLL_MS);
  const once = process.env.SUHUANG_AGENT_ONCE === "1";
  process.stdout.write(`${JSON.stringify({ agent: "suhuang-scroll", version: AGENT_VERSION, controlPlane: base, once })}\n`);
  do {
    try {
      const payload = await request(base, "/v1/runtime/poll", token, {});
      if (payload.command) {
        let result;
        try {
          const command = validateCommand(payload.command);
          result = await localMcpCall(command.tool, command.arguments);
        } catch (error) {
          result = {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
          };
        }
        await request(base, `/v1/runtime/commands/${encodeURIComponent(payload.command.id)}/result`, token, { result });
      }
    } catch (error) {
      process.stderr.write(`suhuang Runtime agent: ${error instanceof Error ? error.message : String(error)}\n`);
      if (once) process.exitCode = 1;
    }
    if (!once) await delay(pollMs);
  } while (!once);
}

export { acquireAgentToken, localMcpCall, redactResult, validateCommand };

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
