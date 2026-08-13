#!/usr/bin/env node
/**
 * Suhuang Scroll local MCP bridge.
 *
 * The bridge owns only MCP transport, argument validation, and process
 * isolation. Grading contracts and provider behavior remain in the installed
 * Python Runtime. Live actions are limited to an explicitly confirmed,
 * manual-confirmation workflow; automatic submission is never exposed here.
 */

import { accessSync, constants, existsSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname, basename, join } from "node:path";
import readline from "node:readline";

const SERVER_VERSION = "0.1.0";
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const MODERN_PROTOCOL_VERSION = "2026-07-28";
const SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, "2025-11-25", "2025-06-18", "2025-03-26", DEFAULT_PROTOCOL_VERSION];
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

const textProperty = (description) => ({ type: "string", description });
const booleanProperty = (description) => ({ type: "boolean", description });

const readOnly = {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
};

const operatorAction = {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: true,
};

const TOOL_DEFINITIONS = [
  {
    name: "suhuang_runtime_status",
    title: "Check Runtime status",
    description:
      "Check whether the local Suhuang Scroll CLI is discoverable. This does not start Python, the API, Chrome, or a grading run.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: readOnly,
  },
  {
    name: "suhuang_doctor",
    title: "Diagnose Runtime",
    description:
      "Run structured local diagnostics for Python, the API, model configuration, adapters, and the Chrome extension. No grading run is started.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        module: {
          type: "string",
          enum: ["python", "api", "models", "extension", "telegram", "feishu"],
          description: "Optional doctor module filter.",
        },
      },
    },
    annotations: readOnly,
  },
  {
    name: "suhuang_list_specs",
    title: "List grading Specs",
    description:
      "List local Markdown question specs and their validation status without returning full answer content.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        root: {
          type: "string",
          description: "Optional repository root or workspace/specs directory.",
        },
      },
    },
    annotations: readOnly,
  },
  {
    name: "suhuang_validate_spec",
    title: "Validate a grading Spec",
    description:
      "Validate one Markdown question spec using the Runtime's parser. It does not start grading or send the spec to a model.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["specPath"],
      properties: {
        specPath: textProperty("Absolute or user-selected local path to a Markdown question spec."),
      },
    },
    annotations: readOnly,
  },
  {
    name: "suhuang_list_adapters",
    title: "List site adapters",
    description:
      "List registered site adapters and their lifecycle/capability metadata. It does not enable or invoke an adapter.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: readOnly,
  },
  {
    name: "suhuang_list_providers",
    title: "List vision providers",
    description:
      "Read the Runtime's configured vision-provider registry and current model configuration without probing a remote provider.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: readOnly,
  },
  {
    name: "suhuang_get_status",
    title: "Read grading status",
    description:
      "Read the current local automation status. It does not create, pause, resume, stop, or submit a run.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: readOnly,
  },
  {
    name: "suhuang_get_stats",
    title: "Read grading statistics",
    description:
      "Read an aggregate grading statistics snapshot. Per-student/OCR records are excluded unless the caller explicitly requests them.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        runDir: { type: "string", description: "Optional local run directory." },
        sessionId: { type: "string", description: "Optional question-session id." },
        includeRecords: booleanProperty("Include normalized record rows; may contain student/OCR data."),
        limitRecords: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum records when includeRecords is true.",
        },
      },
    },
    annotations: readOnly,
  },
  {
    name: "suhuang_prepare_grading",
    title: "Prepare a grading plan",
    description:
      "Validate a spec and adapter and return a grading plan. This is a dry preparation step; it never starts automation, calls a model, writes a score, or submits to a website.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["specPath"],
      properties: {
        specPath: textProperty("Local Markdown question spec path."),
        adapter: { type: "string", description: "Optional site adapter id; defaults to Runtime selection." },
        provider: { type: "string", description: "Optional vision provider id to record in the plan." },
        model: { type: "string", description: "Optional vision model id to record in the plan." },
        confidenceThreshold: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Review threshold to record in the plan; does not change Runtime configuration.",
        },
        runDir: { type: "string", description: "Optional run directory to record in the plan." },
      },
    },
    annotations: readOnly,
  },
  {
    name: "suhuang_start_grading",
    title: "Start manual-confirmation grading",
    description:
      "Start one local grading run in manual-confirmation mode after the operator explicitly confirms. The Runtime may call the configured vision provider, but it never auto-submits scores; the Chrome Extension remains the browser execution boundary.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["specPath", "confirm"],
      properties: {
        specPath: textProperty("Local Markdown question spec path."),
        confirm: {
          type: "boolean",
          description: "Must be true: the operator has explicitly confirmed starting this grading run.",
        },
        adapter: { type: "string", description: "Optional site adapter id; defaults to Runtime selection." },
        provider: { type: "string", description: "Optional vision provider id." },
        model: { type: "string", description: "Optional vision model id." },
        confidenceThreshold: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence threshold used by the manual-confirmation workflow.",
        },
        runDir: { type: "string", description: "Optional local run directory." },
      },
    },
    annotations: operatorAction,
  },
  {
    name: "suhuang_control_grading",
    title: "Control manual grading",
    description:
      "Pause, resume, stop, retry, or explicitly submit the current pending manual grading decision. Every action requires an explicit operator confirmation; submit is the only action that can write a score through the paired Chrome adapter.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["action", "confirm"],
      properties: {
        action: {
          type: "string",
          enum: ["pause", "resume", "stop", "retry", "submit"],
          description: "Manual run action to execute.",
        },
        confirm: {
          type: "boolean",
          description: "Must be true: the operator has explicitly confirmed this action.",
        },
      },
    },
    annotations: operatorAction,
  },
];

function jsonRpcResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function textResult(value, { isError = false } = {}) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const result = { resultType: "complete", content: [{ type: "text", text: serialized }] };
  if (isError) result.isError = true;
  if (!isError && value && typeof value === "object" && !Array.isArray(value)) {
    result.structuredContent = value;
  }
  return result;
}

function errorResult(message, details = undefined) {
  return textResult(details === undefined ? { error: message } : { error: message, details }, { isError: true });
}

function pathIsPython(path) {
  return basename(path).endsWith(".py");
}

function existingCandidate(path) {
  if (!path || !existsSync(path)) return null;
  let candidate = resolve(path);
  try {
    candidate = realpathSync(candidate);
  } catch {
    // Keep the resolved path when the platform cannot dereference it.
  }
  if (pathIsPython(candidate)) return candidate;
  try {
    accessSync(candidate, constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function findOnPath(command) {
  if (!command || command.includes("/")) return null;
  const entries = (process.env.PATH || "").split(":").filter(Boolean);
  for (const entry of entries) {
    for (const suffix of ["", ".cmd", ".exe"]) {
      const candidate = join(entry, `${command}${suffix}`);
      try {
        accessSync(candidate, constants.X_OK);
        return resolve(candidate);
      } catch {
        // Continue searching the remaining PATH entries.
      }
    }
  }
  return null;
}

function runtimeCandidates() {
  const root = process.env.SUHUANG_ROOT ? resolve(process.env.SUHUANG_ROOT) : null;
  const candidates = [];
  if (process.env.SUHUANG_CLI) candidates.push(existingCandidate(process.env.SUHUANG_CLI));
  if (root) {
    candidates.push(existingCandidate(join(root, "core", "bin", "suhuang")));
    candidates.push(existingCandidate(join(root, "core", "python", ".venv", "bin", "suhuang")));
    candidates.push(existingCandidate(join(root, "core", "python", "cli.py")));
  }
  if (process.env.SUHUANG_RUNTIME) candidates.push(existingCandidate(process.env.SUHUANG_RUNTIME));
  return candidates.filter(Boolean);
}

function resolveRuntime() {
  const candidates = runtimeCandidates();
  if (candidates.length > 0) {
    const executable = candidates[0];
    if (pathIsPython(executable)) {
      return {
        command: process.env.SUHUANG_PYTHON || process.env.PYTHON || "python3",
        prefixArgs: [executable],
        path: executable,
        source: "local-python",
        cwd: dirname(executable),
      };
    }
    return { command: executable, prefixArgs: [], path: executable, source: "local-cli", cwd: dirname(executable) };
  }

  const command = process.env.SUHUANG_CLI || "suhuang";
  const pathCommand = findOnPath(command);
  return {
    command: pathCommand || command,
    prefixArgs: [],
    path: pathCommand,
    source: "PATH",
    cwd: process.env.SUHUANG_ROOT ? resolve(process.env.SUHUANG_ROOT) : process.cwd(),
  };
}

function resolveInputPath(value) {
  if (value.startsWith("/")) return resolve(value);
  const candidates = [];
  if (process.env.SPEC_DIR) candidates.push(resolve(process.env.SPEC_DIR, value));
  if (process.env.SUHUANG_WORKSPACE_DIR) candidates.push(resolve(process.env.SUHUANG_WORKSPACE_DIR, value));
  if (process.env.SUHUANG_ROOT) candidates.push(resolve(process.env.SUHUANG_ROOT, value));
  candidates.push(resolve(process.cwd(), value));
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function apiPort() {
  const value = Number(process.env.SUHUANG_API_PORT || process.env.API_PORT || 8000);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8000;
}

function apiHealthUrl() {
  return `http://127.0.0.1:${apiPort()}/api/health`;
}

async function backendReachable() {
  try {
    const response = await fetch(apiHealthUrl(), { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

function backendCandidates() {
  const root = process.env.SUHUANG_ROOT ? resolve(process.env.SUHUANG_ROOT) : null;
  const candidates = [];
  for (const value of [process.env.SUHUANG_BACKEND_BIN, process.env.SUHUANG_BACKEND]) {
    if (value) candidates.push(existingCandidate(value));
  }
  if (root) {
    candidates.push(existingCandidate(join(root, "bin", "suhuang-backend")));
    candidates.push(existingCandidate(join(root, "bin", "suhuang-backend.exe")));
    candidates.push(existingCandidate(join(root, "core", "python", "backend_launcher.py")));
  }
  const runtime = resolveRuntime();
  if (runtime.path && !pathIsPython(runtime.path)) {
    candidates.push(existingCandidate(join(dirname(runtime.path), "suhuang-backend")));
    candidates.push(existingCandidate(join(dirname(runtime.path), "suhuang-backend.exe")));
    candidates.push(existingCandidate(join(dirname(runtime.path), "..", "python", "backend_launcher.py")));
    candidates.push(existingCandidate(join(dirname(runtime.path), "..", "..", "backend_launcher.py")));
  }
  return candidates.filter(Boolean);
}

function backendSpec(candidate) {
  if (pathIsPython(candidate)) {
    const python = process.env.SUHUANG_PYTHON || process.env.PYTHON || "python3";
    return { command: python, args: [candidate], cwd: dirname(candidate), path: candidate };
  }
  return { command: candidate, args: [], cwd: dirname(candidate), path: candidate };
}

let backendStarting = null;

async function ensureBackend() {
  if (await backendReachable()) return { started: false, api: apiHealthUrl() };
  if (!backendStarting) {
    backendStarting = (async () => {
      const candidate = backendCandidates()[0];
      if (!candidate) {
        throw new Error(
          `Local API is offline and no backend was found. Set SUHUANG_BACKEND_BIN or install the Runtime; expected ${apiHealthUrl()}`,
        );
      }
      const backend = backendSpec(candidate);
      let child;
      let launchError = null;
      try {
        child = spawn(backend.command, backend.args, {
          cwd: backend.cwd,
          env: { ...process.env },
          detached: true,
          stdio: "ignore",
          shell: false,
          windowsHide: true,
        });
        child.once("error", (error) => { launchError = error; });
        child.unref();
      } catch (error) {
        throw new Error(`Cannot start local API: ${error.message}`);
      }
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (launchError) throw new Error(`Cannot start local API: ${launchError.message}`);
        if (await backendReachable()) return { started: true, api: apiHealthUrl(), backend: backend.path };
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
      throw new Error(`Local API did not become ready at ${apiHealthUrl()}`);
    })().finally(() => {
      backendStarting = null;
    });
  }
  return backendStarting;
}

function spawnRuntime(args) {
  const runtime = resolveRuntime();
  return { runtime, child: spawn(runtime.command, [...runtime.prefixArgs, ...args], {
    cwd: runtime.cwd,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  }) };
}

function runRuntime(args) {
  return new Promise((resolvePromise) => {
    let spawned;
    try {
      spawned = spawnRuntime(args);
    } catch (error) {
      resolvePromise({ ok: false, error: String(error) });
      return;
    }

    const { runtime, child } = spawned;
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const append = (current, chunk) => {
      const value = chunk.toString();
      outputBytes += Buffer.byteLength(value);
      return outputBytes > MAX_OUTPUT_BYTES ? `${current}${value}`.slice(-MAX_OUTPUT_BYTES) : `${current}${value}`;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      resolvePromise({
        ok: false,
        runtime,
        error: `Cannot start Suhuang Runtime: ${error.message}`,
        stderr: stderr.trim(),
      });
    });
    child.on("close", (code, signal) => {
      const output = stdout.trim();
      let data = null;
      let parseError = null;
      if (output) {
        try {
          data = JSON.parse(output);
        } catch (error) {
          parseError = error.message;
        }
      }
      if (code !== 0) {
        resolvePromise({
          ok: false,
          runtime,
          code,
          signal,
          error: stderr.trim() || (parseError ? `Runtime returned non-JSON output: ${output.slice(0, 1000)}` : `Runtime exited with code ${code}`),
          data,
        });
        return;
      }
      if (parseError) {
        resolvePromise({
          ok: false,
          runtime,
          code,
          error: `Runtime returned non-JSON output: ${output.slice(0, 1000)}`,
          stderr: stderr.trim(),
        });
        return;
      }
      resolvePromise({ ok: true, runtime, code, data });
    });
  });
}

function requireString(args, key) {
  const value = args?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Argument ${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(args, key) {
  const value = args?.[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`Argument ${key} must be a string`);
  return value.trim() || null;
}

function optionalNumber(args, key, minimum, maximum) {
  const value = args?.[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Argument ${key} must be a number between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalBoolean(args, key, fallback = false) {
  const value = args?.[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error(`Argument ${key} must be a boolean`);
  return value;
}

function requireOperatorConfirmation(args) {
  if (args?.confirm !== true) {
    throw new Error("This live grading action requires confirm=true after explicit operator confirmation");
  }
}

function runtimeFailure(result) {
  return errorResult(result.error || "Suhuang Runtime command failed", {
    code: result.code ?? null,
    signal: result.signal ?? null,
    stderr: result.stderr || null,
    runtime: result.runtime?.path || result.runtime?.source || null,
  });
}

async function callTool(name, args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Tool arguments must be an object");
  }

  if (name === "suhuang_runtime_status") {
    const runtime = resolveRuntime();
    const configuredPath = runtime.path;
    const pathLooksAvailable = Boolean(configuredPath);
    return textResult({
      available: pathLooksAvailable,
      apiAvailable: await backendReachable(),
      source: runtime.source,
      cliPath: configuredPath,
      command: runtime.command,
      cwd: runtime.cwd,
      configured: Boolean(process.env.SUHUANG_CLI || process.env.SUHUANG_ROOT || process.env.SUHUANG_RUNTIME),
      install: {
        message: "Install the local Runtime separately, then expose its executable to this plugin.",
        environment: [
          "SUHUANG_CLI=/absolute/path/to/suhuang",
          "SUHUANG_ROOT=/absolute/path/to/agentic-grading",
        ],
        sourceInstall: "cd core/python && python -m pip install -e .",
      },
    });
  }

  if (name === "suhuang_doctor") {
    const module = optionalString(args, "module");
    const command = ["doctor", "--format", "json"];
    if (module) command.push("--module", module);
    const result = await runRuntime(command);
    return result.ok ? textResult(result.data) : runtimeFailure(result);
  }

  if (name === "suhuang_list_specs") {
    const rootValue = optionalString(args, "root");
    const root = rootValue ? resolveInputPath(rootValue) : null;
    const command = ["specs", "list"];
    if (root) command.push("--root", root);
    const result = await runRuntime(command);
    return result.ok ? textResult(result.data) : runtimeFailure(result);
  }

  if (name === "suhuang_validate_spec") {
    const specPath = resolveInputPath(requireString(args, "specPath"));
    const result = await runRuntime(["validate-spec", "--spec", specPath]);
    return result.ok ? textResult(result.data) : runtimeFailure(result);
  }

  if (name === "suhuang_list_adapters") {
    const result = await runRuntime(["adapters", "list"]);
    return result.ok ? textResult(result.data) : runtimeFailure(result);
  }

  if (name === "suhuang_list_providers") {
    const result = await runRuntime(["providers", "list"]);
    return result.ok ? textResult(result.data) : runtimeFailure(result);
  }

  if (name === "suhuang_get_status") {
    const result = await runRuntime(["status"]);
    return result.ok ? textResult(result.data) : runtimeFailure(result);
  }

  if (name === "suhuang_start_grading") {
    requireOperatorConfirmation(args);
    const backend = await ensureBackend();
    const specPath = resolveInputPath(requireString(args, "specPath"));
    const command = ["start", "--spec", specPath, "--dev", "--no-watch"];
    const adapter = optionalString(args, "adapter");
    const provider = optionalString(args, "provider");
    const model = optionalString(args, "model");
    const confidenceThreshold = optionalNumber(args, "confidenceThreshold", 0, 1);
    const runDir = optionalString(args, "runDir");
    if (adapter) command.push("--adapter", adapter);
    if (provider) command.push("--provider", provider);
    if (model) command.push("--model", model);
    if (confidenceThreshold !== null) command.push("--confidence-threshold", String(confidenceThreshold));
    if (runDir) command.push("--run-dir", resolveInputPath(runDir));
    const result = await runRuntime(command);
    if (!result.ok) return runtimeFailure(result);
    return textResult({
      action: "start_manual_confirmation",
      run: result.data,
      api: backend,
      safety: {
        operatorConfirmed: true,
        gradingStarted: true,
        autoSubmit: false,
        scoreWritten: false,
        scoreSubmitted: false,
      },
      nextStep: "Use suhuang_get_status to inspect the pending decision, then call suhuang_control_grading with explicit confirmation.",
    });
  }

  if (name === "suhuang_control_grading") {
    requireOperatorConfirmation(args);
    const backend = await ensureBackend();
    const action = requireString(args, "action");
    if (!["pause", "resume", "stop", "retry", "submit"].includes(action)) {
      throw new Error(`Unsupported grading action: ${action}`);
    }
    const command = action === "submit" || action === "retry"
      ? ["manual-action", action]
      : [action];
    const result = await runRuntime(command);
    if (!result.ok) return runtimeFailure(result);
    return textResult({
      action,
      run: result.data,
      api: backend,
      safety: {
        operatorConfirmed: true,
        autoSubmit: false,
        scoreSubmissionRequested: action === "submit",
      },
    });
  }

  if (name === "suhuang_get_stats") {
    const command = ["stats", "--format", "json"];
    const runDir = optionalString(args, "runDir");
    const sessionId = optionalString(args, "sessionId");
    const includeRecords = optionalBoolean(args, "includeRecords", false);
    if (runDir) command.push("--run-dir", runDir);
    if (sessionId) command.push("--session-id", sessionId);
    if (includeRecords) {
      command.push("--include-records");
      const limit = args.limitRecords === undefined ? 20 : args.limitRecords;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("Argument limitRecords must be an integer between 1 and 100");
      }
      command.push("--limit-records", String(limit));
    }
    const result = await runRuntime(command);
    return result.ok ? textResult(result.data) : runtimeFailure(result);
  }

  if (name === "suhuang_prepare_grading") {
    const specPath = resolveInputPath(requireString(args, "specPath"));
    const adapter = optionalString(args, "adapter");
    const provider = optionalString(args, "provider");
    const model = optionalString(args, "model");
    const confidenceThreshold = optionalNumber(args, "confidenceThreshold", 0, 1);
    const runDir = optionalString(args, "runDir");

    const validation = await runRuntime(["validate-spec", "--spec", specPath]);
    if (!validation.ok) return runtimeFailure(validation);

    const adapterList = await runRuntime(["adapters", "list"]);
    if (!adapterList.ok) return runtimeFailure(adapterList);
    const adapterPayload = adapterList.data || {};
    const selectedAdapter = adapter || adapterPayload.default_adapter || null;
    let adapterDetails = null;
    if (selectedAdapter) {
      const inspected = await runRuntime(["adapters", "inspect", selectedAdapter]);
      if (!inspected.ok) return runtimeFailure(inspected);
      adapterDetails = inspected.data;
    }

    return textResult({
      ready: true,
      action: "prepare_only",
      safety: {
        gradingStarted: false,
        modelCalled: false,
        scoreWritten: false,
        scoreSubmitted: false,
      },
      spec: {
        path: specPath,
        question: validation.data,
      },
      adapter: {
        id: selectedAdapter,
        details: adapterDetails,
      },
      execution: {
        provider,
        model,
        confidenceThreshold,
        runDir,
      },
      nextStep: "Ask the operator for explicit confirmation before invoking a live grading command.",
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleMessage(message) {
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const id = message.id;
  const method = message.method;
  if (typeof method !== "string") {
    if (hasId) writeMessage(jsonRpcError(id, -32600, "Invalid Request"));
    return;
  }

  const metadata = message.params?._meta;
  const modern = metadata?.["io.modelcontextprotocol/protocolVersion"] === MODERN_PROTOCOL_VERSION;

  if (method === "server/discover") {
    if (hasId) {
      writeMessage(jsonRpcResponse(id, {
        resultType: "complete",
        supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
        capabilities: { tools: {} },
        _meta: {
          "io.modelcontextprotocol/serverInfo": { name: "suhuang-scroll", version: SERVER_VERSION },
        },
        instructions: "Use suhuang_prepare_grading first. Live grading requires confirm=true and always runs in manual-confirmation mode; automatic submission is unavailable.",
      }));
    }
    return;
  }

  if (method === "initialize") {
    if (modern) {
      if (hasId) writeMessage(jsonRpcError(id, -32601, "Method not found: initialize"));
      return;
    }
    const requested = message.params?.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
    if (hasId) {
      writeMessage(jsonRpcResponse(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "suhuang-scroll", version: SERVER_VERSION },
        instructions: "Use suhuang_prepare_grading first. Live grading requires confirm=true and always runs in manual-confirmation mode; automatic submission is unavailable.",
      }));
    }
    return;
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled" || method === "ping") {
    if (method === "ping" && hasId) writeMessage(jsonRpcResponse(id, {}));
    return;
  }

  if (method === "tools/list") {
    if (hasId) writeMessage(jsonRpcResponse(id, { resultType: "complete", tools: TOOL_DEFINITIONS }));
    return;
  }

  if (method === "tools/call") {
    if (!hasId) return;
    const name = message.params?.name;
    if (!TOOL_DEFINITIONS.some((tool) => tool.name === name)) {
      writeMessage(jsonRpcError(id, -32602, `Unknown tool: ${name}`));
      return;
    }
    try {
      const result = await callTool(name, message.params?.arguments || {});
      writeMessage(jsonRpcResponse(id, result));
    } catch (error) {
      writeMessage(jsonRpcResponse(id, errorResult(error instanceof Error ? error.message : String(error))));
    }
    return;
  }

  if (hasId) writeMessage(jsonRpcError(id, -32601, `Method not found: ${method}`));
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    writeMessage(jsonRpcError(null, -32700, "Parse error", String(error)));
    return;
  }
  void handleMessage(message);
});
