/**
 * Public MCP metadata for the hosted relay.
 *
 * The relay queues a short-lived command for a paired local Runtime agent.
 * Every call therefore changes relay state, even when the local operation is
 * read-only. The annotations below describe transport behavior for diagnostics
 * and the stronger operator-action boundary for live grading controls.
 */

const relayAnnotations = {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: false,
};

const operatorActionAnnotations = {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: true,
};

// The public relay requires an authenticated tenant for every tool. The
// authorization server and its discovery metadata are configured at deploy
// time; this declaration lets MCP hosts surface the OAuth linking flow.
const relaySecuritySchemes = [
  { type: "oauth2", scopes: ["suhuang:runtime"] },
];

const textProperty = (description) => ({ type: "string", description });

export const TOOL_DEFINITIONS = [
  {
    name: "suhuang_runtime_pair",
    title: "Pair local Runtime",
    description:
      "Create a short-lived one-time pairing code for the operator to connect one local Suhuang Runtime Agent. This changes control-plane state but does not read local data or start grading.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_runtime_status",
    title: "Check Runtime status",
    description:
      "Ask the paired local Suhuang Runtime whether its CLI is discoverable. The hosted relay only forwards this request and does not start grading.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_doctor",
    title: "Diagnose Runtime",
    description:
      "Run structured diagnostics in the paired local Runtime for Python, the API, model configuration, adapters, and the Chrome extension. No grading run is started.",
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
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_list_specs",
    title: "List grading Specs",
    description:
      "List Markdown question specs in the paired local Runtime and their validation status. Prefer a relative path; do not put student answers into tool arguments.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        root: textProperty("Optional repository root or workspace/specs directory in the paired local Runtime."),
      },
    },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_validate_spec",
    title: "Validate a grading Spec",
    description:
      "Validate one Markdown question spec in the paired local Runtime. It does not start grading or send the spec to a model.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["specPath"],
      properties: {
        specPath: textProperty("Absolute or user-selected local path to a Markdown question spec; relative paths are preferred."),
      },
    },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_list_adapters",
    title: "List site adapters",
    description:
      "List registered site adapters in the paired local Runtime. It does not enable or invoke an adapter.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_list_providers",
    title: "List vision providers",
    description:
      "Read the paired local Runtime's configured vision-provider registry without probing a remote provider.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_get_status",
    title: "Read grading status",
    description:
      "Read local automation status from the paired Runtime. It does not create, pause, resume, stop, or submit a run.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_get_stats",
    title: "Read grading statistics",
    description:
      "Read aggregate grading statistics from the paired local Runtime. Student/OCR record rows are intentionally unavailable through the hosted relay.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        runDir: { type: "string", description: "Optional local run directory in the paired Runtime." },
        sessionId: { type: "string", description: "Optional question-session id." },
      },
    },
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_prepare_grading",
    title: "Prepare a grading plan",
    description:
      "Validate a spec and adapter in the paired local Runtime and return a dry grading plan. It never starts automation, calls a model, writes a score, or submits to a website.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["specPath"],
      properties: {
        specPath: textProperty("Local Markdown question spec path; relative paths are preferred."),
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
    annotations: relayAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_start_grading",
    title: "Start manual-confirmation grading",
    description:
      "Start one paired local grading run after the operator explicitly confirms. The local Runtime may call its configured vision provider, but it never auto-submits scores; the Chrome Extension remains the browser execution boundary.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["specPath", "confirm"],
      properties: {
        specPath: textProperty("Local Markdown question spec path; relative paths are preferred."),
        confirm: { type: "boolean", description: "Must be true after explicit operator confirmation." },
        adapter: { type: "string", description: "Optional site adapter id." },
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
    annotations: operatorActionAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
  {
    name: "suhuang_control_grading",
    title: "Control manual grading",
    description:
      "Pause, resume, stop, retry, or explicitly submit the current pending manual grading decision. Every action requires explicit operator confirmation; submit is the only action that can write a score through the paired Chrome adapter.",
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
        confirm: { type: "boolean", description: "Must be true after explicit operator confirmation." },
      },
    },
    annotations: operatorActionAnnotations,
    securitySchemes: relaySecuritySchemes,
  },
];

export const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
