import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { acquireAgentToken, localMcpCall, redactResult, validateCommand } from "../../../plugins/suhuang-scroll/mcp/agent.mjs";

const root = resolve(new URL(".", import.meta.url).pathname, "../../..");

test("Runtime agent validates remote command paths and tool names", () => {
  assert.deepEqual(validateCommand({ tool: "suhuang_runtime_status", arguments: {} }), {
    tool: "suhuang_runtime_status",
    arguments: {},
  });
  assert.throws(
    () => validateCommand({ tool: "suhuang_validate_spec", arguments: { specPath: "../private.md" } }),
    /relative specPath path/,
  );
  assert.throws(
    () => validateCommand({ tool: "suhuang_get_stats", arguments: { includeRecords: true } }),
    /not allowed|per-student/,
  );
  assert.throws(
    () => validateCommand({ tool: "suhuang_start_grading", arguments: { specPath: "workspace/specs/q.md" } }),
    /confirm=true/,
  );
  assert.deepEqual(
    validateCommand({
      tool: "suhuang_control_grading",
      arguments: { action: "pause", confirm: true },
    }),
    { tool: "suhuang_control_grading", arguments: { action: "pause", confirm: true } },
  );
  assert.throws(
    () => validateCommand({ tool: "suhuang_get_status", arguments: { shell: "echo unsafe" } }),
    /not allowed/,
  );
});

test("Runtime agent redacts local paths from structured and text results", () => {
  const result = redactResult({
    content: [{ type: "text", text: JSON.stringify({ error: "/Users/alice/private/spec.md" }) }],
    structuredContent: { detail: "/private/synthetic/output.json" },
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /\/Users\/alice|\/private\/var\/folders/);
  assert.match(serialized, /<local-path>/);
});

test("Runtime agent keeps hosted grading results to safe decision metadata", () => {
  const result = redactResult({
    structuredContent: {
      student_id: "student-001",
      question: { id: "q1", subject: "math", type: "single", maxScore: 10, answer: "private answer" },
      execution: { vision_api_key: "secret-key", bot_token: "secret-bot" },
      pending_decision: {
        suggested_score: 8,
        confidence: 0.91,
        ocr_text: "student handwriting",
        page_context: { site: "synthetic", pageUrl: "https://grading.example/student/1", paperIndex: 2 },
      },
    },
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /student-001|student handwriting|private answer|grading\.example|secret-key|secret-bot/);
  assert.match(serialized, /"suggested_score":8/);
  assert.match(serialized, /"confidence":0\.91/);
});

test("Runtime agent invokes the existing local stdio bridge", async () => {
  const previousRoot = process.env.SUHUANG_ROOT;
  const previousBridge = process.env.SUHUANG_LOCAL_MCP;
  const previousTimeout = process.env.SUHUANG_LOCAL_COMMAND_TIMEOUT_MS;
  process.env.SUHUANG_ROOT = root;
  process.env.SUHUANG_LOCAL_MCP = resolve(root, "plugins/suhuang-scroll/mcp/server.mjs");
  process.env.SUHUANG_LOCAL_COMMAND_TIMEOUT_MS = "5000";
  try {
    const result = await localMcpCall("suhuang_runtime_status", {});
    assert.equal(result.isError, undefined, JSON.stringify(result));
    assert.equal(result.structuredContent.available, true);
    assert.equal(Object.hasOwn(result.structuredContent, "cliPath"), false);
  } finally {
    if (previousRoot === undefined) delete process.env.SUHUANG_ROOT;
    else process.env.SUHUANG_ROOT = previousRoot;
    if (previousBridge === undefined) delete process.env.SUHUANG_LOCAL_MCP;
    else process.env.SUHUANG_LOCAL_MCP = previousBridge;
    if (previousTimeout === undefined) delete process.env.SUHUANG_LOCAL_COMMAND_TIMEOUT_MS;
    else process.env.SUHUANG_LOCAL_COMMAND_TIMEOUT_MS = previousTimeout;
  }
});

test("Runtime agent redeems a one-time pairing code before polling", async () => {
  const previousToken = process.env.SUHUANG_AGENT_TOKEN;
  const previousCode = process.env.SUHUANG_PAIRING_CODE;
  const previousFetch = globalThis.fetch;
  delete process.env.SUHUANG_AGENT_TOKEN;
  process.env.SUHUANG_PAIRING_CODE = "PAIR-CODE";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://mcp.example.com/v1/runtime/pair");
    assert.equal(options.headers.authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { code: "PAIR-CODE" });
    return new Response(JSON.stringify({ ok: true, agentToken: "rt_test", tenant: "demo" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const acquired = await acquireAgentToken("https://mcp.example.com");
    assert.equal(acquired.token, "rt_test");
    assert.equal(acquired.pairing.tenant, "demo");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.SUHUANG_AGENT_TOKEN;
    else process.env.SUHUANG_AGENT_TOKEN = previousToken;
    if (previousCode === undefined) delete process.env.SUHUANG_PAIRING_CODE;
    else process.env.SUHUANG_PAIRING_CODE = previousCode;
  }
});
