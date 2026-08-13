# Shared backend boundary and client contract

Phase 3 fixes the Python backend as the owner of grading semantics and HTTP contracts.
CLI, TUI, and the Chrome extension perform orchestration and presentation only.

## Dependency direction

```text
CLI ─┐
TUI ─┼─> FastAPI routes ─> services ─> grading contracts / automation state
Ext ─┘                         └──────> adapter registry
```

- `api/routes/` and `services/` must not import `cli.py` or `cli_commands/`.
- Environment checks and provider probes live in `services/system_status_service.py`.
- Run state transitions live in `services/automation_service.py`; CLI modules call its HTTP
  routes and do not duplicate transition rules.
- Site page capture, writing, submission, pagination, healthcheck, and dry-run behavior live
  under `extension/src/adapters/<site>/`.

## CLI command ownership

`core/python/cli.py` is the packaging-compatible entrypoint. Command dispatch uses:

| Module | Stable responsibility |
| --- | --- |
| `cli_commands/doctor.py` | read-only diagnostics |
| `cli_commands/stats.py` | session/run statistics |
| `cli_commands/spec.py` | spec validation |
| `cli_commands/adapter.py` | adapter list, inspect, and safe scaffold generation |
| `cli_commands/run_control.py` | start, pause, resume, stop, and status |
| `cli_commands/output.py` | terminal/file output selection |

`cli_commands/runtime.py` retains compatibility helpers exported by earlier `cli.py` versions.
New command behavior should enter the corresponding command module or shared service.

## Client API inventory

The full schema is FastAPI OpenAPI. Current TUI/extension stable usage is:

| Client | Endpoint | Required fields |
| --- | --- | --- |
| TUI, extension | `GET /api/health` | `version`, `protocol_version`, `status` |
| TUI, extension | `GET /api/automation/status` | `active`, optional `run` |
| TUI, extension | `POST /api/automation/start` | request `spec_path`; response `RunState` |
| TUI, extension | `POST /api/automation/{pause,resume,stop}` | `RunState` |
| Extension | `GET /api/resources` | `providers`, `modelsByProvider`, `adapters` |
| Extension | `GET /api/specs` | `specs`, `dir` |
| Extension | `POST /api/grade` | `results`, `request_id`, `execution` |
| Extension | `/api/automation/report/*` | `RunState` or grade decision |

The extension consumes the stable subset in
`extension/src/generated/backend-contracts.ts`. Run
`python scripts/release/check_api_contracts.py` to compare it with OpenAPI.

## Compatibility and release metadata

- Additive optional fields are compatible.
- Removing or renaming a used endpoint/field, making an optional field required, or changing
  field semantics requires incrementing `protocol_version`.
- `scripts/release/check_versions.py` verifies backend, TUI, and extension protocol constants.
- Native and extension packaging write `release.json` with program version, extension version,
  protocol version, and target.

## Site isolation

The shared grading pipeline contains no site names or DOM assumptions. Adapter selection defaults
through `resources/site_adapters.json`, not a hard-coded site id. Generated adapters begin disabled,
require manual validation, expose read-only healthcheck, and use dry-run requests before real
submission is enabled. The deprecated `zhixueResponse` session field remains temporarily as a
compatibility alias; new clients use `siteResponse`.
