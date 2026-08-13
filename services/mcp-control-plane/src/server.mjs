#!/usr/bin/env node

/**
 * Suhuang Scroll hosted MCP control plane.
 *
 * This service is deliberately small and dependency-free. It exposes a
 * Streamable-HTTP-compatible JSON-RPC endpoint and relays an allow-listed
 * set of local Runtime operations to an outbound local agent. Live grading
 * actions require explicit confirmation and are forced into
 * manual-confirmation mode. The control plane keeps commands in memory only;
 * it never reads a user's workspace and never receives a model API key.
 *
 * This is a single-instance deployment target. A multi-instance deployment
 * must replace the in-memory queue with a tenant-isolated durable broker and
 * preserve the same no-payload-logging boundary.
 */

import { createPublicKey, createVerify, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { TOOL_DEFINITIONS, TOOL_NAMES } from "./tools.mjs";

const SERVER_VERSION = "0.1.0";
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";
const MODERN_PROTOCOL_VERSION = "2026-07-28";
const SUPPORTED_PROTOCOL_VERSIONS = [
  MODERN_PROTOCOL_VERSION,
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const DEFAULT_PORT = 8080;
const DEFAULT_COMMAND_TIMEOUT_MS = 45_000;
const DEFAULT_AGENT_TTL_MS = 20_000;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_QUEUE = 32;
const DEFAULT_MAX_PENDING_PER_TENANT = 8;
const DEFAULT_PAIRING_TTL_MS = 5 * 60_000;
const DEFAULT_AGENT_TOKEN_TTL_MS = 24 * 60 * 60_000;

const TOOL_ARGUMENT_KEYS = {
  suhuang_runtime_pair: [],
  suhuang_runtime_status: [],
  suhuang_doctor: ["module"],
  suhuang_list_specs: ["root"],
  suhuang_validate_spec: ["specPath"],
  suhuang_list_adapters: [],
  suhuang_list_providers: [],
  suhuang_get_status: [],
  suhuang_get_stats: ["runDir", "sessionId"],
  suhuang_prepare_grading: [
    "specPath",
    "adapter",
    "provider",
    "model",
    "confidenceThreshold",
    "runDir",
  ],
  suhuang_start_grading: [
    "specPath",
    "confirm",
    "adapter",
    "provider",
    "model",
    "confidenceThreshold",
    "runDir",
  ],
  suhuang_control_grading: ["action", "confirm"],
};

function jsonRpcResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
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
  const value = details === undefined ? { error: message } : { error: message, details };
  return textResult(value, { isError: true });
}

const REVIEW_FIXTURE_SPEC_PATH = "workspace/specs/minimal-fill-blank-spec.md";

function delimitedValues(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function isReviewFixtureSpec(specPath) {
  return specPath === REVIEW_FIXTURE_SPEC_PATH || specPath === "minimal-fill-blank-spec.md";
}

/**
 * Return deterministic, synthetic results for an authenticated reviewer tenant.
 * This path is deliberately explicit and never reads a workspace, starts a
 * Runtime process, calls a model, or returns student/OCR data.
 */
function reviewFixtureResult(name, args) {
  const base = { mode: "review-fixture", synthetic: true };
  if (name === "suhuang_runtime_pair") {
    return textResult({
      ...base,
      pairingRequired: false,
      nextStep: "No local Runtime is required for review fixture calls; production tenants use suhuang_runtime_pair.",
    });
  }
  if (name === "suhuang_runtime_status") {
    return textResult({
      ...base,
      available: true,
      configured: true,
      source: "review-fixture",
      cliPath: "suhuang",
      command: "suhuang",
      gradingStarted: false,
    });
  }
  if (name === "suhuang_doctor") {
    return textResult({
      ...base,
      ok: true,
      remote_probe_performed: false,
      module: args.module || null,
      modules: {
        python: { status: "ready" },
        api: { status: "ready" },
        models: { status: "configured", provider: "fixture-vlm" },
        extension: { status: "ready" },
      },
    });
  }
  if (name === "suhuang_list_specs") {
    return textResult({
      ...base,
      root: "workspace/specs",
      count: 1,
      specs: [{
        path: REVIEW_FIXTURE_SPEC_PATH,
        status: "valid",
        id: "synthetic-fill-blank-001",
        subject: "math",
        type: "fill_blank",
        maxScore: 2,
        answerContentIncluded: false,
      }],
    });
  }
  if (name === "suhuang_validate_spec") {
    if (!isReviewFixtureSpec(args.specPath)) {
      return errorResult("Synthetic review spec not found", {
        code: "FIXTURE_SPEC_NOT_FOUND",
        specPath: args.specPath,
      });
    }
    return textResult({
      ...base,
      valid: true,
      path: args.specPath,
      id: "synthetic-fill-blank-001",
      subject: "math",
      type: "fill_blank",
      maxScore: 2,
      contract: { criteriaCount: 1, blankCount: 1 },
      answerContentIncluded: false,
    });
  }
  if (name === "suhuang_list_adapters") {
    return textResult({
      ...base,
      manifest_schema_version: "fixture-v1",
      default_adapter: "synthetic",
      adapters: [{
        id: "synthetic",
        status: "ready",
        capabilities: ["capture", "dry_run"],
        canAutoSubmit: false,
      }],
    });
  }
  if (name === "suhuang_list_providers") {
    return textResult({
      ...base,
      default_provider: "fixture-vlm",
      configured_provider: "fixture-vlm",
      configured_model: "synthetic-vision",
      api_key_configured: false,
      providers: [{
        id: "fixture-vlm",
        adapter: "synthetic",
        default_model: "synthetic-vision",
        models: ["synthetic-vision"],
        api_key_env: null,
      }],
    });
  }
  if (name === "suhuang_get_status") {
    return textResult({
      ...base,
      active: false,
      run: { state: "idle", runId: null },
      gradingStarted: false,
    });
  }
  if (name === "suhuang_get_stats") {
    return textResult({
      ...base,
      source: "synthetic",
      session_id: args.sessionId || "-",
      stats: {
        status: "idle",
        total_records: 0,
        submitted_count: 0,
        pending_count: 0,
        override_count: 0,
      },
      records: [],
    });
  }
  if (name === "suhuang_prepare_grading") {
    if (!isReviewFixtureSpec(args.specPath)) {
      return errorResult("Synthetic review spec not found", {
        code: "FIXTURE_SPEC_NOT_FOUND",
        specPath: args.specPath,
      });
    }
    const adapter = args.adapter || "synthetic";
    if (adapter !== "synthetic") {
      return errorResult("Synthetic review adapter is not available", {
        code: "FIXTURE_ADAPTER_NOT_FOUND",
        adapter,
      });
    }
    const provider = args.provider || "fixture-vlm";
    if (provider !== "fixture-vlm") {
      return errorResult("Synthetic review provider is not available", {
        code: "FIXTURE_PROVIDER_NOT_FOUND",
        provider,
      });
    }
    return textResult({
      ...base,
      ready: true,
      action: "prepare_only",
      safety: {
        gradingStarted: false,
        modelCalled: false,
        scoreWritten: false,
        scoreSubmitted: false,
      },
      spec: {
        path: args.specPath,
        question: {
          id: "synthetic-fill-blank-001",
          subject: "math",
          type: "fill_blank",
          maxScore: 2,
        },
      },
      adapter: { id: adapter, details: { status: "ready", canAutoSubmit: false } },
      execution: {
        provider,
        model: args.model || "synthetic-vision",
        confidenceThreshold: args.confidenceThreshold ?? 0.9,
        runDir: args.runDir || null,
      },
      nextStep: "Ask the operator for explicit confirmation before invoking a live grading command.",
    });
  }
  if (name === "suhuang_start_grading") {
    if (!isReviewFixtureSpec(args.specPath)) {
      return errorResult("Synthetic review spec not found", {
        code: "FIXTURE_SPEC_NOT_FOUND",
        specPath: args.specPath,
      });
    }
    return textResult({
      ...base,
      action: "start_manual_confirmation",
      run: { run_id: "fixture-run", state: "starting", adapter: args.adapter || "synthetic" },
      safety: {
        operatorConfirmed: true,
        gradingStarted: false,
        modelCalled: false,
        autoSubmit: false,
        scoreWritten: false,
        scoreSubmitted: false,
      },
      reason: "Review fixture never starts a Runtime process or calls a model.",
    });
  }
  if (name === "suhuang_control_grading") {
    return textResult({
      ...base,
      action: args.action,
      run: { run_id: "fixture-run", state: args.action === "stop" ? "stopped" : "idle" },
      safety: {
        operatorConfirmed: true,
        autoSubmit: false,
        scoreSubmissionRequested: args.action === "submit",
        scoreSubmitted: false,
      },
      reason: "Review fixture never changes a Runtime or browser state.",
    });
  }
  return errorResult(`Unsupported review fixture tool: ${name}`, { code: "FIXTURE_TOOL_NOT_FOUND" });
}

function asPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function tokenMapFromEnv({ mapValue, singleValue, singleTenant }) {
  if (mapValue) {
    let parsed;
    try {
      parsed = JSON.parse(mapValue);
    } catch (error) {
      throw new Error(`Invalid token map JSON: ${error.message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Token map must be a JSON object of token to tenant id");
    }
    const result = new Map();
    for (const [token, tenant] of Object.entries(parsed)) {
      if (token.trim() && typeof tenant === "string" && tenant.trim()) result.set(token, tenant.trim());
    }
    return result;
  }
  return singleValue ? new Map([[singleValue, singleTenant]]) : new Map();
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function findTenant(token, tokenMap) {
  if (!token) return null;
  for (const [candidate, tenant] of tokenMap.entries()) {
    if (constantTimeEquals(token, candidate)) return tenant;
  }
  return null;
}

function bearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function jsonHeaders(extra = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  };
}

function protocolVersionHeader(request) {
  const value = request.headers["mcp-protocol-version"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function supportedProtocolVersion(value) {
  return typeof value === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(value) ? value : null;
}

function requestMetadata(message) {
  const metadata = message?.params?._meta ?? message?._meta;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function transportError(message, code = -32020, data = undefined) {
  const error = Object.assign(new Error(message), { statusCode: 400, jsonRpcCode: code });
  if (data !== undefined) error.jsonRpcData = data;
  return error;
}

function decodeMcpHeader(value) {
  const match = typeof value === "string" ? value.match(/^=\?base64\?([A-Za-z0-9+/]+={0,2})\?=$/) : null;
  if (!match) return value;
  try {
    return Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
}

function originList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  return values
    .flatMap((origin) => String(origin).split(/[\s,]+/))
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function validateTransportHeaders(request, message) {
  const protocolVersion = protocolVersionHeader(request);
  const metadata = requestMetadata(message);
  const bodyProtocolVersion = metadata["io.modelcontextprotocol/protocolVersion"];
  if (protocolVersion && !supportedProtocolVersion(protocolVersion)) {
    throw transportError(`Unsupported MCP-Protocol-Version: ${protocolVersion}`, -32022, {
      supported: SUPPORTED_PROTOCOL_VERSIONS,
      requested: protocolVersion,
    });
  }
  if (bodyProtocolVersion && !supportedProtocolVersion(bodyProtocolVersion)) {
    throw transportError(`Unsupported MCP protocol version: ${bodyProtocolVersion}`, -32022, {
      supported: SUPPORTED_PROTOCOL_VERSIONS,
      requested: bodyProtocolVersion,
    });
  }
  const modern = protocolVersion === MODERN_PROTOCOL_VERSION || bodyProtocolVersion === MODERN_PROTOCOL_VERSION;
  if (modern) {
    if (!protocolVersion || !bodyProtocolVersion || protocolVersion !== bodyProtocolVersion) {
      throw transportError("MCP-Protocol-Version does not match request metadata");
    }
    for (const key of [
      "io.modelcontextprotocol/protocolVersion",
      "io.modelcontextprotocol/clientInfo",
      "io.modelcontextprotocol/clientCapabilities",
    ]) {
      if (!(key in metadata)) throw transportError(`Missing required request metadata: ${key}`);
    }
  }

  const methodHeader = request.headers["mcp-method"];
  const methodValue = decodeMcpHeader(methodHeader);
  if (modern && typeof methodValue !== "string") {
    throw transportError("Missing required Mcp-Method header");
  }
  if (typeof methodHeader === "string" && methodValue !== message?.method) {
    throw transportError("Mcp-Method does not match the JSON-RPC method");
  }
  const nameHeader = request.headers["mcp-name"];
  const messageName = message?.method === "tools/call"
    ? message.params?.name
    : (message?.method === "resources/read" || message?.method === "prompts/get"
      ? (message.params?.uri || message.params?.name)
      : undefined);
  const nameValue = decodeMcpHeader(nameHeader);
  if (modern && ["tools/call", "resources/read", "prompts/get"].includes(message?.method) && typeof nameValue !== "string") {
    throw transportError("Missing required Mcp-Name header");
  }
  if (typeof nameHeader === "string" && nameValue !== messageName) {
    throw transportError("Mcp-Name does not match the request name");
  }

  const accept = request.headers.accept;
  const mediaTypes = typeof accept === "string" ? accept.split(",").map((value) => value.trim().split(";", 1)[0]) : [];
  const acceptsJson = mediaTypes.includes("application/json") || mediaTypes.includes("*/*");
  const acceptsSse = mediaTypes.includes("text/event-stream") || mediaTypes.includes("*/*");
  if (modern && (!acceptsJson || !acceptsSse)) {
    throw transportError("MCP POST must accept both application/json and text/event-stream", -32020);
  }
  if (typeof accept === "string" && !mediaTypes.some((mediaType) => (
    mediaType === "application/json" || mediaType === "text/event-stream" || mediaType === "*/*"
  ))) {
    throw Object.assign(new Error("MCP POST must accept application/json or text/event-stream"), { statusCode: 406 });
  }
  return { protocolVersion: protocolVersion || bodyProtocolVersion || null, modern };
}

function sendJson(response, statusCode, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, jsonHeaders(extraHeaders));
  response.end(body);
}

function sendText(response, statusCode, value, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  response.end(value);
}

async function readBody(request, maxBytes) {
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw Object.assign(new Error("Request body is too large"), { statusCode: 413 });
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error("Request body is too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (total === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw Object.assign(new Error(`Invalid JSON body: ${error.message}`), { statusCode: 400 });
  }
}

function validateToolArguments(name, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Tool arguments must be an object");
  }
  const allowed = new Set(TOOL_ARGUMENT_KEYS[name] || []);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) throw new Error(`Unknown argument ${key} for ${name}`);
  }
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > 2048) {
      throw new Error(`Argument ${key} is too long`);
    }
    if (value !== null && typeof value === "object") {
      throw new Error(`Argument ${key} must be a scalar value`);
    }
  }
  if (args.confidenceThreshold !== undefined) {
    if (typeof args.confidenceThreshold !== "number" || !Number.isFinite(args.confidenceThreshold)) {
      throw new Error("Argument confidenceThreshold must be a number");
    }
    if (args.confidenceThreshold < 0 || args.confidenceThreshold > 1) {
      throw new Error("Argument confidenceThreshold must be between 0 and 1");
    }
  }
  for (const key of ["root", "specPath", "runDir"]) {
    const value = args[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim() === "") throw new Error(`Argument ${key} must be a non-empty string`);
    if (value.startsWith("/") || value.split(/[\\/]+/).includes("..")) {
      throw new Error(`Argument ${key} must be a relative path without parent traversal`);
    }
  }
  if (["suhuang_start_grading", "suhuang_control_grading"].includes(name) && args.confirm !== true) {
    throw new Error("Live grading commands require confirm=true after explicit operator confirmation");
  }
  if (name === "suhuang_control_grading" && !["pause", "resume", "stop", "retry", "submit"].includes(args.action)) {
    throw new Error("Argument action must be one of pause, resume, stop, retry, submit");
  }
}

function commandFor(name, args) {
  return {
    id: randomUUID(),
    tool: name,
    arguments: args,
    createdAt: new Date().toISOString(),
  };
}

function createControlPlane(options = {}) {
  const environment = options.env || process.env;
  const mcpTokens = options.mcpTokens || tokenMapFromEnv({
    mapValue: environment.SUHUANG_MCP_TOKENS_JSON,
    singleValue: environment.SUHUANG_MCP_TOKEN,
    singleTenant: "default",
  });
  const agentTokens = options.agentTokens || tokenMapFromEnv({
    mapValue: environment.SUHUANG_AGENT_TOKENS_JSON,
    singleValue: environment.SUHUANG_AGENT_TOKEN,
    singleTenant: "default",
  });
  const reviewMode = String(options.reviewMode ?? environment.SUHUANG_MCP_REVIEW_MODE ?? "").trim().toLowerCase();
  const reviewTenants = new Set(delimitedValues(
    options.reviewTenants ?? environment.SUHUANG_MCP_REVIEW_TENANTS ?? (reviewMode === "fixture" ? "review" : ""),
  ));
  const state = {
    pending: new Map(),
    queue: [],
    agents: new Map(),
    commandTimeoutMs: options.commandTimeoutMs || asPositiveInteger(environment.SUHUANG_COMMAND_TIMEOUT_MS, DEFAULT_COMMAND_TIMEOUT_MS),
    agentTtlMs: options.agentTtlMs || asPositiveInteger(environment.SUHUANG_AGENT_TTL_MS, DEFAULT_AGENT_TTL_MS),
    maxBodyBytes: options.maxBodyBytes || asPositiveInteger(environment.SUHUANG_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
    maxQueue: options.maxQueue || asPositiveInteger(environment.SUHUANG_MAX_QUEUE, DEFAULT_MAX_QUEUE),
    maxPendingPerTenant: options.maxPendingPerTenant || asPositiveInteger(environment.SUHUANG_MAX_PENDING_PER_TENANT, DEFAULT_MAX_PENDING_PER_TENANT),
    pairingTtlMs: options.pairingTtlMs || asPositiveInteger(environment.SUHUANG_PAIRING_TTL_MS, DEFAULT_PAIRING_TTL_MS),
    agentTokenTtlMs: options.agentTokenTtlMs || asPositiveInteger(environment.SUHUANG_AGENT_TOKEN_TTL_MS, DEFAULT_AGENT_TOKEN_TTL_MS),
    challenge: options.challenge ?? environment.SUHUANG_OPENAI_APPS_CHALLENGE ?? "",
    reviewMode,
    reviewTenants,
    resource: options.resource || environment.SUHUANG_MCP_RESOURCE || "",
    resourceDocumentation:
      options.resourceDocumentation || environment.SUHUANG_RESOURCE_DOCUMENTATION || "",
    authorizationServers: options.authorizationServers || ((options.oauthIssuer || environment.SUHUANG_OAUTH_ISSUER) ? [options.oauthIssuer || environment.SUHUANG_OAUTH_ISSUER] : []),
    scopes: options.scopes
      ? (Array.isArray(options.scopes) ? options.scopes : [options.scopes])
      : (environment.SUHUANG_OAUTH_SCOPE
        ? String(environment.SUHUANG_OAUTH_SCOPE).split(/[\s,]+/).filter(Boolean)
        : ["suhuang:runtime"]),
    allowedOrigins: originList(options.allowedOrigins ?? environment.SUHUANG_ALLOWED_ORIGINS),
    oauth: {
      issuer: options.oauthIssuer || environment.SUHUANG_OAUTH_ISSUER || "",
      jwksUrl: options.oauthJwksUrl || environment.SUHUANG_OAUTH_JWKS_URL || "",
      audience: options.oauthAudience || environment.SUHUANG_OAUTH_AUDIENCE || "",
      tenantClaim: options.oauthTenantClaim || environment.SUHUANG_OAUTH_TENANT_CLAIM || "tenant_id",
      jwks: null,
      jwksExpiresAt: 0,
    },
    pairings: new Map(),
    dynamicAgentTokenExpires: new Map(),
    observability: {
      httpRequests: 0,
      mcpRequests: 0,
      mcpAuthFailures: 0,
      agentAuthFailures: 0,
      originRejections: 0,
      protocolErrors: 0,
      runtimeOffline: 0,
      queueTimeouts: 0,
    },
  };

  function recordMetric(name) {
    state.observability[name] += 1;
  }

  function recordOperationalEvent(event, fields = {}) {
    if (!state.logEvents) return;
    console.log(JSON.stringify({
      service: "suhuang-scroll-mcp-control-plane",
      version: SERVER_VERSION,
      event,
      ...fields,
    }));
  }

  state.logEvents = options.logEvents ?? environment.SUHUANG_LOG_EVENTS !== "0";

  function connected(tenant) {
    const agent = state.agents.get(tenant);
    return Boolean(agent && Date.now() - agent.lastSeen <= state.agentTtlMs);
  }

  function updateAgent(tenant) {
    const previous = state.agents.get(tenant) || { tenant, firstSeen: Date.now() };
    const current = { ...previous, tenant, lastSeen: Date.now() };
    state.agents.set(tenant, current);
    return current;
  }

  function pendingCount(tenant) {
    let count = 0;
    for (const pending of state.pending.values()) if (pending.tenant === tenant) count += 1;
    return count;
  }

  function enqueue(tenant, name, args) {
    if (!connected(tenant)) {
      recordMetric("runtimeOffline");
      recordOperationalEvent("runtime_offline", { tool: name });
      return Promise.resolve(errorResult("Paired local Runtime is offline", { code: "RUNTIME_OFFLINE" }));
    }
    if (pendingCount(tenant) >= state.maxPendingPerTenant) {
      return Promise.resolve(errorResult("Too many pending Runtime commands", { code: "QUEUE_LIMIT" }));
    }
    if (state.queue.length >= state.maxQueue) {
      return Promise.resolve(errorResult("Runtime command queue is full", { code: "QUEUE_LIMIT" }));
    }
    const command = commandFor(name, args);
    state.queue.push({ ...command, tenant });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        state.pending.delete(command.id);
        recordMetric("queueTimeouts");
        recordOperationalEvent("runtime_timeout", { tool: name });
        resolve(errorResult("Local Runtime did not return before the command timeout", {
          code: "RUNTIME_TIMEOUT",
          tool: name,
        }));
      }, state.commandTimeoutMs);
      state.pending.set(command.id, { tenant, tool: name, resolve, timer });
    });
  }

  function poll(tenant) {
    updateAgent(tenant);
    const index = state.queue.findIndex((command) => command.tenant === tenant);
    if (index < 0) return null;
    const [command] = state.queue.splice(index, 1);
    const pending = state.pending.get(command.id);
    if (!pending) return null;
    pending.issuedAt = Date.now();
    return {
      id: command.id,
      tool: command.tool,
      arguments: command.arguments,
    };
  }

  function resolveCommand(tenant, id, result) {
    const pending = state.pending.get(id);
    if (!pending) return { ok: false, statusCode: 404, error: "Unknown or expired command" };
    if (pending.tenant !== tenant) return { ok: false, statusCode: 403, error: "Command belongs to another tenant" };
    clearTimeout(pending.timer);
    state.pending.delete(id);
    pending.resolve(result);
    updateAgent(tenant);
    return { ok: true };
  }

  function decodeJwtPart(value) {
    try {
      return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }

  async function loadJwks() {
    if (!state.oauth.jwksUrl) return null;
    if (state.oauth.jwks && state.oauth.jwksExpiresAt > Date.now()) return state.oauth.jwks;
    let parsed;
    try {
      parsed = new URL(state.oauth.jwksUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && environment.SUHUANG_ALLOW_INSECURE_HTTP !== "1") return null;
    try {
      const response = await fetch(parsed, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const body = await response.json();
      if (!body || !Array.isArray(body.keys)) return null;
      state.oauth.jwks = body.keys;
      state.oauth.jwksExpiresAt = Date.now() + 10 * 60_000;
      return state.oauth.jwks;
    } catch {
      return null;
    }
  }

  function audienceMatches(payload) {
    if (!state.oauth.audience) return true;
    const audience = payload.aud;
    return Array.isArray(audience)
      ? audience.includes(state.oauth.audience)
      : audience === state.oauth.audience;
  }

  async function verifyOAuthToken(token) {
    if (!state.oauth.issuer || !state.oauth.jwksUrl || !token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);
    if (!header || !payload || header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (typeof payload.nbf === "number" && payload.nbf > now + 30) return null;
    if (payload.iss !== state.oauth.issuer || !audienceMatches(payload)) return null;
    const scope = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
    if (state.scopes.length > 0 && !state.scopes.some((required) => scope.includes(required))) return null;
    const keys = await loadJwks();
    const jwk = keys?.find((candidate) => candidate?.kid === header.kid && candidate?.kty === "RSA");
    if (!jwk) return null;
    try {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${parts[0]}.${parts[1]}`);
      verifier.end();
      const valid = verifier.verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
      if (!valid) return null;
    } catch {
      return null;
    }
    const tenantValue = payload[state.oauth.tenantClaim] || payload.sub;
    if (typeof tenantValue !== "string" || tenantValue.trim() === "" || tenantValue.length > 256) return null;
    return tenantValue.trim();
  }

  async function authenticate(request, kind) {
    const token = bearerToken(request);
    if (kind === "mcp") {
      const staticTenant = findTenant(token, mcpTokens);
      return staticTenant || verifyOAuthToken(token);
    }
    const tenant = findTenant(token, agentTokens);
    if (!tenant) return null;
    const expiresAt = state.dynamicAgentTokenExpires.get(token);
    if (expiresAt && Date.now() > expiresAt) {
      agentTokens.delete(token);
      state.dynamicAgentTokenExpires.delete(token);
      return null;
    }
    return tenant;
  }

  function beginPairing(tenant) {
    const now = Date.now();
    for (const [code, pairing] of state.pairings.entries()) {
      if (pairing.expiresAt <= now) state.pairings.delete(code);
    }
    const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    const expiresAt = now + state.pairingTtlMs;
    state.pairings.set(code, { tenant, expiresAt });
    return {
      pairingCode: code,
      expiresAt: new Date(expiresAt).toISOString(),
      nextStep: "Start the local Runtime Agent with SUHUANG_PAIRING_CODE and the hosted control-plane URL.",
    };
  }

  function redeemPairing(code) {
    if (typeof code !== "string" || code.trim() === "") return null;
    const now = Date.now();
    for (const [candidate, pairing] of state.pairings.entries()) {
      if (!constantTimeEquals(code.trim().toUpperCase(), candidate)) continue;
      state.pairings.delete(candidate);
      if (pairing.expiresAt <= now) return null;
      const token = `rt_${randomUUID().replace(/-/g, "")}`;
      agentTokens.set(token, pairing.tenant);
      state.dynamicAgentTokenExpires.set(token, now + state.agentTokenTtlMs);
      return {
        agentToken: token,
        tenant: pairing.tenant,
        expiresAt: new Date(now + state.agentTokenTtlMs).toISOString(),
      };
    }
    return null;
  }

  async function handleMcpMessage(message, tenant, transport = {}) {
    const hasId = Object.prototype.hasOwnProperty.call(message || {}, "id");
    const id = message?.id ?? null;
    const method = message?.method;
    if (typeof method !== "string") return hasId ? jsonRpcError(id, -32600, "Invalid Request") : null;

    if (method === "server/discover") {
      return hasId
        ? jsonRpcResponse(id, {
          resultType: "complete",
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          capabilities: { tools: {} },
          _meta: {
            "io.modelcontextprotocol/serverInfo": {
              name: "suhuang-scroll-control-plane",
              version: SERVER_VERSION,
            },
          },
          instructions: "Hosted relay for a paired local Runtime. Use prepare first; live grading requires confirm=true, stays in manual-confirmation mode, and never enables automatic submission.",
        })
        : null;
    }

    if (method === "initialize") {
      if (transport.modern) return hasId ? jsonRpcError(id, -32601, "Method not found: initialize") : null;
      const requestedVersion = message?.params?.protocolVersion;
      const protocolVersion = supportedProtocolVersion(requestedVersion) || LATEST_PROTOCOL_VERSION;
      return hasId
        ? jsonRpcResponse(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "suhuang-scroll-control-plane", version: SERVER_VERSION },
          instructions: "Hosted relay for a paired local Runtime. Use prepare first; live grading requires confirm=true, stays in manual-confirmation mode, and never enables automatic submission.",
        })
        : null;
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") return null;
    if (method === "ping") return hasId ? jsonRpcResponse(id, {}) : null;
    if (method === "tools/list") return hasId
      ? jsonRpcResponse(id, { resultType: "complete", tools: TOOL_DEFINITIONS })
      : null;
    if (method !== "tools/call") return hasId ? jsonRpcError(id, -32601, `Method not found: ${method}`) : null;
    if (!hasId) return null;

    const name = message.params?.name;
    if (typeof name !== "string" || !TOOL_NAMES.has(name)) return jsonRpcError(id, -32602, `Unknown tool: ${name}`);
    const args = message.params?.arguments || {};
    try {
      validateToolArguments(name, args);
    } catch (error) {
      return jsonRpcResponse(id, errorResult(error instanceof Error ? error.message : String(error)));
    }
    if (state.reviewMode === "fixture" && state.reviewTenants.has(tenant)) {
      return jsonRpcResponse(id, reviewFixtureResult(name, args));
    }
    if (name === "suhuang_runtime_pair") {
      return jsonRpcResponse(id, textResult(beginPairing(tenant)));
    }
    const result = await enqueue(tenant, name, args);
    return jsonRpcResponse(id, result);
  }

  async function handleHttp(request, response) {
    recordMetric("httpRequests");
    const requestUrl = new URL(request.url || "/", "http://control-plane.local");
    const pathname = requestUrl.pathname;
    const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : null;
    const originAllowed = !requestOrigin || state.allowedOrigins.includes(requestOrigin);
    const corsHeaders = {
      ...(requestOrigin && originAllowed ? {
        "access-control-allow-origin": requestOrigin,
        vary: "Origin",
      } : {}),
      "access-control-allow-headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, mcp-method, mcp-name",
      "access-control-expose-headers": "mcp-protocol-version, mcp-session-id, www-authenticate",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    };
    if (!originAllowed) {
      recordMetric("originRejections");
      recordOperationalEvent("origin_rejected", { status: 403 });
      sendJson(response, 403, { error: "Origin is not allowed" }, corsHeaders);
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if (pathname === "/healthz" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        service: "suhuang-scroll-mcp-control-plane",
        version: SERVER_VERSION,
        mcp: {
          configured: mcpTokens.size > 0 || Boolean(state.oauth.jwksUrl),
          path: "/mcp",
          authMode: state.oauth.jwksUrl ? "oauth-jwt-with-static-agent-tokens" : (state.authorizationServers.length > 0 ? "static-bearer-with-oauth-metadata" : "static-bearer-token"),
          resource: state.resource || null,
        },
        runtime: {
          configured: agentTokens.size > 0,
          connected: [...state.agents.keys()].some((tenant) => connected(tenant)),
          connectedRuntimeCount: [...state.agents.keys()].filter((tenant) => connected(tenant)).length,
          queueDepth: state.queue.length,
          pending: state.pending.size,
        },
        observability: { ...state.observability },
        reviewMode: state.reviewMode || null,
        dataBoundary: "Commands and results are held in memory only; student records and model keys are not persisted by this process.",
      }, corsHeaders);
      return;
    }

    if (pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
      if (!state.challenge) {
        sendText(response, 404, "Not configured", corsHeaders);
      } else {
        sendText(response, 200, state.challenge, corsHeaders);
      }
      return;
    }

    if (pathname === "/.well-known/oauth-protected-resource" && request.method === "GET") {
      if (!state.resource || state.authorizationServers.length === 0) {
        sendJson(response, 404, { error: "OAuth resource metadata is not configured" }, corsHeaders);
      } else {
        const metadata = {
          resource: state.resource,
          authorization_servers: state.authorizationServers,
          scopes_supported: state.scopes,
        };
        if (state.resourceDocumentation) metadata.resource_documentation = state.resourceDocumentation;
        sendJson(response, 200, metadata, corsHeaders);
      }
      return;
    }

    if (pathname === "/mcp") {
      recordMetric("mcpRequests");
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "MCP endpoint accepts POST" }, { ...corsHeaders, allow: "POST, OPTIONS" });
        return;
      }
      const tenant = await authenticate(request, "mcp");
      if (!tenant) {
        recordMetric("mcpAuthFailures");
        recordOperationalEvent("mcp_auth_failure", { status: 401 });
        sendJson(response, 401, { error: "Missing or invalid MCP bearer token" }, {
          ...corsHeaders,
          "www-authenticate": state.resource && state.authorizationServers.length > 0
            ? `Bearer resource_metadata="${state.resource.replace(/\/$/, "")}/.well-known/oauth-protected-resource", scope="${state.scopes.join(" ")}"`
            : "Bearer",
        });
        return;
      }
      try {
        const message = await readBody(request, state.maxBodyBytes);
        const transport = validateTransportHeaders(request, message);
        const result = await handleMcpMessage(message, tenant, transport);
        if (result === null) {
          response.writeHead(202, corsHeaders);
          response.end();
          return;
        }
        const responseProtocolVersion = message?.method === "initialize"
          ? result?.result?.protocolVersion
          : transport.protocolVersion || DEFAULT_PROTOCOL_VERSION;
        const responseStatus = transport.modern && result?.error?.code === -32601 ? 404 : 200;
        sendJson(response, responseStatus, result, responseProtocolVersion
          ? { ...corsHeaders, "mcp-protocol-version": responseProtocolVersion }
          : corsHeaders);
      } catch (error) {
        recordMetric("protocolErrors");
        recordOperationalEvent("mcp_protocol_error", { status: error.statusCode || 400 });
        const statusCode = error.statusCode || 400;
        const errorCode = error.jsonRpcCode || (statusCode === 413 ? -32001 : -32700);
        const errorData = error.jsonRpcData;
        sendJson(response, statusCode, jsonRpcError(null, errorCode, error.message, errorData), corsHeaders);
      }
      return;
    }

    if (pathname === "/v1/runtime/poll" || pathname === "/v1/runtime/heartbeat") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Runtime endpoint accepts POST" }, { ...corsHeaders, allow: "POST, OPTIONS" });
        return;
      }
      const tenant = await authenticate(request, "agent");
      if (!tenant) {
        recordMetric("agentAuthFailures");
        recordOperationalEvent("agent_auth_failure", { status: 401 });
        sendJson(response, 401, { error: "Missing or invalid Runtime agent token" }, {
          ...corsHeaders,
          "www-authenticate": "Bearer",
        });
        return;
      }
      updateAgent(tenant);
      if (pathname.endsWith("/heartbeat")) {
        sendJson(response, 200, { ok: true, nextPollMs: 2000 }, corsHeaders);
        return;
      }
      sendJson(response, 200, { ok: true, command: poll(tenant), nextPollMs: 2000 }, corsHeaders);
      return;
    }

    const resultMatch = pathname.match(/^\/v1\/runtime\/commands\/([^/]+)\/result$/);
    if (resultMatch) {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Runtime result endpoint accepts POST" }, { ...corsHeaders, allow: "POST, OPTIONS" });
        return;
      }
      const tenant = await authenticate(request, "agent");
      if (!tenant) {
        recordMetric("agentAuthFailures");
        recordOperationalEvent("agent_auth_failure", { status: 401 });
        sendJson(response, 401, { error: "Missing or invalid Runtime agent token" }, {
          ...corsHeaders,
          "www-authenticate": "Bearer",
        });
        return;
      }
      try {
        const body = await readBody(request, state.maxBodyBytes);
        if (!body || typeof body !== "object" || Array.isArray(body) || !("result" in body)) {
          sendJson(response, 400, { error: "Body must contain a result object" }, corsHeaders);
          return;
        }
        const result = body.result;
        const serialized = JSON.stringify(result);
        if (Buffer.byteLength(serialized, "utf8") > state.maxBodyBytes) {
          sendJson(response, 413, { error: "Runtime result is too large" }, corsHeaders);
          return;
        }
        const resolved = resolveCommand(tenant, resultMatch[1], result);
        sendJson(response, resolved.ok ? 200 : resolved.statusCode, resolved, corsHeaders);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message }, corsHeaders);
      }
      return;
    }

    if (pathname === "/v1/runtime/pair") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Runtime pairing endpoint accepts POST" }, { ...corsHeaders, allow: "POST, OPTIONS" });
        return;
      }
      try {
        const body = await readBody(request, 16 * 1024);
        const pairing = redeemPairing(body?.code);
        if (!pairing) {
          sendJson(response, 401, { error: "Pairing code is missing, expired, or already used" }, corsHeaders);
          return;
        }
        sendJson(response, 200, { ok: true, ...pairing }, corsHeaders);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message }, corsHeaders);
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" }, corsHeaders);
  }

  const server = createHttpServer((request, response) => {
    void handleHttp(request, response);
  });
  return { server, state, mcpTokens, agentTokens };
}

export {
  createControlPlane,
  SERVER_VERSION,
  MODERN_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  DEFAULT_PROTOCOL_VERSION,
};

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let app;
  try {
    app = createControlPlane();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
  if (app) {
    const host = process.env.HOST || "0.0.0.0";
    const port = asPositiveInteger(process.env.PORT, DEFAULT_PORT);
    app.server.listen(port, host, () => {
      console.log(JSON.stringify({
        service: "suhuang-scroll-mcp-control-plane",
        version: SERVER_VERSION,
        host,
        port,
        mcpPath: "/mcp",
        healthPath: "/healthz",
        mcpAuthConfigured: app.mcpTokens.size > 0 || Boolean(app.state.oauth.jwksUrl),
        agentAuthConfigured: app.agentTokens.size > 0,
      }));
    });
    const shutdown = () => app.server.close(() => process.exit(0));
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
