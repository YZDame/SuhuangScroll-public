import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createSign, generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import { createControlPlane } from "../src/server.mjs";

const MCP_TOKEN = "mcp-test-token";
const AGENT_TOKEN = "agent-test-token";

async function startApp(overrides = {}) {
  const app = createControlPlane({
    mcpTokens: new Map([[MCP_TOKEN, "demo"]]),
    agentTokens: new Map([[AGENT_TOKEN, "demo"]]),
    commandTimeoutMs: 2_000,
    agentTtlMs: 5_000,
    logEvents: false,
    ...overrides,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;
  return { app, base };
}

async function stopApp(app) {
  await new Promise((resolve) => app.server.close(resolve));
}

async function post(base, path, token, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => ({})) };
}

test("health and MCP discovery require no local student data", async (t) => {
  const { app, base } = await startApp();
  t.after(() => stopApp(app));

  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.runtime.pending, 0);
  assert.equal(healthBody.runtime.connected, false);
  assert.equal(healthBody.runtime.connectedRuntimeCount, 0);
  assert.equal(healthBody.reviewMode, null);
  assert.equal(healthBody.observability.httpRequests, 1);
  assert.equal(healthBody.observability.mcpRequests, 0);
  assert.equal(healthBody.observability.mcpAuthFailures, 0);

  const unauthorized = await post(base, "/mcp", "wrong", { jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(unauthorized.response.status, 401);

  const initialized = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(initialized.response.status, 200);
  assert.equal(initialized.body.result.serverInfo.name, "suhuang-scroll-control-plane");

  const listed = await post(base, "/mcp", MCP_TOKEN, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(listed.body.result.tools.length, 12);
  assert.equal(listed.body.result.tools.every((tool) => typeof tool.title === "string" && tool.title.length > 0), true);
  assert.equal(listed.body.result.tools.every((tool) => tool.annotations.readOnlyHint === false), true);
  assert.equal(
    listed.body.result.tools.every(
      (tool) => tool.securitySchemes?.some((scheme) => scheme.type === "oauth2" && scheme.scopes.includes("suhuang:runtime")),
    ),
    true,
  );

  const offline = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "suhuang_runtime_status", arguments: {} },
  });
  assert.equal(offline.body.result.isError, true);
  assert.match(offline.body.result.content[0].text, /RUNTIME_OFFLINE/);

  const healthAfter = await fetch(`${base}/healthz`);
  const healthAfterBody = await healthAfter.json();
  assert.equal(healthAfterBody.observability.mcpRequests, 4);
  assert.equal(healthAfterBody.observability.mcpAuthFailures, 1);
  assert.equal(healthAfterBody.observability.agentAuthFailures, 0);
  assert.equal(healthAfterBody.observability.runtimeOffline, 1);
});

test("MCP negotiates supported protocol versions and validates transport headers", async (t) => {
  const { app, base } = await startApp();
  t.after(() => stopApp(app));

  const initializedResponse = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      "mcp-method": "initialize",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }),
  });
  assert.equal(initializedResponse.status, 200);
  assert.equal(initializedResponse.headers.get("mcp-protocol-version"), "2025-06-18");
  const initialized = await initializedResponse.json();
  assert.equal(initialized.result.protocolVersion, "2025-06-18");

  const mismatched = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json",
      "mcp-method": "tools/list",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize" }),
  });
  assert.equal(mismatched.status, 400);

  const unsupported = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json",
      "mcp-protocol-version": "2099-01-01",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
  });
  assert.equal(unsupported.status, 400);
});

test("modern MCP requests are self-describing and expose server discovery", async (t) => {
  const { app, base } = await startApp();
  t.after(() => stopApp(app));
  const modernMeta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };

  const discoveredResponse = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "server/discover",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: "discover-1", method: "server/discover", params: { _meta: modernMeta } }),
  });
  assert.equal(discoveredResponse.status, 200);
  assert.equal(discoveredResponse.headers.get("mcp-protocol-version"), "2026-07-28");
  const discovered = await discoveredResponse.json();
  assert.equal(discovered.result.supportedVersions[0], "2026-07-28");
  assert.equal(discovered.result._meta["io.modelcontextprotocol/serverInfo"].name, "suhuang-scroll-control-plane");

  const listedResponse = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/list",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: "list-1", method: "tools/list", params: { _meta: modernMeta } }),
  });
  assert.equal(listedResponse.status, 200);
  const listed = await listedResponse.json();
  assert.equal(listed.result.resultType, "complete");
  assert.equal(listed.result.tools.length, 12);
  assert.equal(listed.result.tools.every((tool) => typeof tool.title === "string" && tool.title.length > 0), true);

  const missingHeader = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-method": "tools/list",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: "list-2", method: "tools/list", params: { _meta: modernMeta } }),
  });
  assert.equal(missingHeader.status, 400);
  assert.equal((await missingHeader.json()).error.code, -32020);
});

test("MCP origin validation is opt-in and exact-match", async (t) => {
  const { app, base } = await startApp({ allowedOrigins: ["https://chatgpt.com"] });
  t.after(() => stopApp(app));

  const denied = await fetch(`${base}/healthz`, { headers: { origin: "https://evil.example" } });
  assert.equal(denied.status, 403);

  const allowed = await fetch(`${base}/healthz`, { headers: { origin: "https://chatgpt.com" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://chatgpt.com");
  assert.equal(allowed.headers.get("vary"), "Origin");
});

test("OAuth protected-resource metadata is explicit when configured", async (t) => {
  const app = createControlPlane({
    mcpTokens: new Map([[MCP_TOKEN, "demo"]]),
    agentTokens: new Map([[AGENT_TOKEN, "demo"]]),
    resource: "https://mcp.example.com",
    authorizationServers: ["https://auth.example.com"],
    resourceDocumentation: "https://docs.example.com/suhuang-scroll/mcp",
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(() => stopApp(app));

  const metadataResponse = await fetch(`${base}/.well-known/oauth-protected-resource`);
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.deepEqual(metadata.authorization_servers, ["https://auth.example.com"]);
  assert.equal(metadata.resource, "https://mcp.example.com");
  assert.equal(metadata.resource_documentation, "https://docs.example.com/suhuang-scroll/mcp");

  const unauthorized = await post(base, "/mcp", "wrong", { jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.match(unauthorized.response.headers.get("www-authenticate"), /resource_metadata/);
});

test("OAuth RS256 access tokens map to the tenant used for Runtime pairing", async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
  const jwksServer = createHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  jwksServer.listen(0, "127.0.0.1");
  await once(jwksServer, "listening");
  const jwksAddress = jwksServer.address();
  const issuer = "https://issuer.example.com";
  const app = createControlPlane({
    env: { ...process.env, SUHUANG_ALLOW_INSECURE_HTTP: "1" },
    mcpTokens: new Map(),
    agentTokens: new Map(),
    resource: "https://mcp.example.com",
    authorizationServers: [issuer],
    oauthIssuer: issuer,
    oauthJwksUrl: `http://127.0.0.1:${jwksAddress.port}/jwks.json`,
    oauthAudience: "suhuang-client",
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await stopApp(app);
    await new Promise((resolvePromise) => jwksServer.close(resolvePromise));
  });

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: "test-key" });
  const signToken = (claims) => {
    const payload = encode({
      iss: issuer,
      aud: "suhuang-client",
      sub: "oauth-user",
      tenant_id: "oauth-tenant",
      scope: "suhuang:runtime",
      exp: Math.floor(Date.now() / 1000) + 300,
      ...claims,
    });
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
  };
  const token = signToken({});

  const listed = await post(base, "/mcp", token, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.result.tools.some((tool) => tool.name === "suhuang_runtime_pair"), true);

  const invalid = await post(base, "/mcp", `${token}tampered`, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(invalid.response.status, 401);

  const wrongScope = await post(base, "/mcp", signToken({ scope: "profile" }), { jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.equal(wrongScope.response.status, 401);
});

test("a paired agent completes an MCP call through the transient queue", async (t) => {
  const { app, base } = await startApp();
  t.after(() => stopApp(app));

  const initialPoll = await post(base, "/v1/runtime/poll", AGENT_TOKEN, {});
  assert.equal(initialPoll.body.command, null);

  const callPromise = post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "call-1",
    method: "tools/call",
    params: { name: "suhuang_get_status", arguments: {} },
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const poll = await post(base, "/v1/runtime/poll", AGENT_TOKEN, {});
  assert.equal(poll.body.ok, true);
  assert.equal(poll.body.command.tool, "suhuang_get_status");

  const result = await post(base, `/v1/runtime/commands/${poll.body.command.id}/result`, AGENT_TOKEN, {
    result: {
      content: [{ type: "text", text: "runtime-ready" }],
      structuredContent: { available: true },
    },
  });
  assert.equal(result.response.status, 200);

  const completed = await callPromise;
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.id, "call-1");
  assert.equal(completed.body.result.structuredContent.available, true);
});

test("MCP pairing codes mint one-time tenant-scoped Agent tokens", async (t) => {
  const { app, base } = await startApp();
  t.after(() => stopApp(app));

  const pairingCall = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "suhuang_runtime_pair", arguments: {} },
  });
  assert.equal(pairingCall.response.status, 200);
  const pairing = pairingCall.body.result.structuredContent;
  assert.match(pairing.pairingCode, /^[A-Z0-9]{10}$/);

  const redeemed = await post(base, "/v1/runtime/pair", "", { code: pairing.pairingCode });
  assert.equal(redeemed.response.status, 200);
  assert.match(redeemed.body.agentToken, /^rt_/);
  assert.equal(redeemed.body.tenant, "demo");

  const reused = await post(base, "/v1/runtime/pair", "", { code: pairing.pairingCode });
  assert.equal(reused.response.status, 401);

  const poll = await post(base, "/v1/runtime/poll", redeemed.body.agentToken, {});
  assert.equal(poll.response.status, 200);
  assert.equal(poll.body.command, null);
});

test("review fixture tenants receive synthetic tool results without a local Runtime", async (t) => {
  const { app, base } = await startApp({ reviewMode: "fixture", reviewTenants: ["demo"] });
  t.after(() => stopApp(app));

  const health = await fetch(`${base}/healthz`);
  assert.equal((await health.json()).reviewMode, "fixture");

  const status = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-status",
    method: "tools/call",
    params: { name: "suhuang_runtime_status", arguments: {} },
  });
  assert.equal(status.response.status, 200);
  assert.equal(status.body.result.structuredContent.mode, "review-fixture");
  assert.equal(status.body.result.structuredContent.available, true);

  const specs = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-specs",
    method: "tools/call",
    params: { name: "suhuang_list_specs", arguments: {} },
  });
  assert.equal(specs.body.result.structuredContent.count, 1);
  assert.equal(specs.body.result.structuredContent.specs[0].answerContentIncluded, false);

  const prepared = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-prepare",
    method: "tools/call",
    params: {
      name: "suhuang_prepare_grading",
      arguments: { specPath: "workspace/specs/minimal-fill-blank-spec.md" },
    },
  });
  assert.equal(prepared.body.result.structuredContent.ready, true);
  assert.equal(prepared.body.result.structuredContent.safety.gradingStarted, false);
  assert.equal(prepared.body.result.structuredContent.safety.scoreWritten, false);
  assert.equal(prepared.body.result.structuredContent.safety.scoreSubmitted, false);
  assert.equal(app.state.queue.length, 0);

  const started = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-start",
    method: "tools/call",
    params: {
      name: "suhuang_start_grading",
      arguments: { specPath: "workspace/specs/minimal-fill-blank-spec.md", confirm: true },
    },
  });
  assert.equal(started.body.result.structuredContent.safety.operatorConfirmed, true);
  assert.equal(started.body.result.structuredContent.safety.gradingStarted, false);
  assert.equal(started.body.result.structuredContent.safety.scoreSubmitted, false);

  const unconfirmed = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-unconfirmed",
    method: "tools/call",
    params: {
      name: "suhuang_control_grading",
      arguments: { action: "submit", confirm: false },
    },
  });
  assert.equal(unconfirmed.body.result.isError, true);
  assert.match(unconfirmed.body.result.content[0].text, /confirm=true/);

  const controlled = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-control",
    method: "tools/call",
    params: {
      name: "suhuang_control_grading",
      arguments: { action: "submit", confirm: true },
    },
  });
  assert.equal(controlled.body.result.structuredContent.safety.operatorConfirmed, true);
  assert.equal(controlled.body.result.structuredContent.safety.scoreSubmissionRequested, true);
  assert.equal(controlled.body.result.structuredContent.safety.scoreSubmitted, false);
  assert.equal(app.state.queue.length, 0);

  const missing = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-missing",
    method: "tools/call",
    params: { name: "suhuang_validate_spec", arguments: { specPath: "workspace/specs/does-not-exist.md" } },
  });
  assert.equal(missing.body.result.isError, true);
  assert.match(missing.body.result.content[0].text, /FIXTURE_SPEC_NOT_FOUND/);

  const pairing = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: "fixture-pairing",
    method: "tools/call",
    params: { name: "suhuang_runtime_pair", arguments: {} },
  });
  assert.equal(pairing.body.result.structuredContent.pairingRequired, false);
  assert.equal(app.state.pairings.size, 0);
});

test("the relay rejects unknown and unsafe arguments before queueing", async (t) => {
  const { app, base } = await startApp();
  t.after(() => stopApp(app));
  await post(base, "/v1/runtime/poll", AGENT_TOKEN, {});

  const unsafe = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "suhuang_validate_spec", arguments: { specPath: "/Users/private/spec.md" } },
  });
  assert.equal(unsafe.body.result.isError, true);

  const unknown = await post(base, "/mcp", MCP_TOKEN, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "suhuang_get_status", arguments: { unexpected: true } },
  });
  assert.equal(unknown.body.result.isError, true);
  assert.equal(app.state.queue.length, 0);
});
