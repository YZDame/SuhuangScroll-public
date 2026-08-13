# Suhuang Scroll Plugin Privacy Notice

Last updated: 2026-08-12

Suhuang Scroll is designed to run the grading Runtime on the operator's
computer. The Codex Plugin's diagnostic and preparation tools inspect local
configuration, question-spec metadata, adapter metadata, and aggregate run
status when the operator invokes them. Its live controls require a separate
explicit confirmation and stay in manual-confirmation mode.

The local Plugin does not collect telemetry, sell data, or read browser cookies
or credentials. In the optional hosted-MCP mode, the control plane receives a
tool name, operator-supplied arguments, and the structured result needed to
route a request to the paired local Runtime. The control plane is designed to
keep those values in memory only and does not persist them or send them to a
model. The hosted tool set blocks per-student/OCR record rows and removes local
absolute paths from results where possible.

If the operator explicitly starts a grading workflow through the local Runtime,
answer images and related grading inputs may be sent from that Runtime to the
vision provider configured by the operator (for example, an OpenAI-compatible
Qwen endpoint). That provider's terms and privacy policy then apply to the
request. The Plugin does not proxy those model requests.

Run records, OCR text, and model outputs are stored according to the local
Runtime configuration. The local bridge may expose private records only when
the operator explicitly asks for them. The hosted relay does not expose that
option.

For privacy questions or deletion requests, use the public issue tracker at
<https://github.com/YZDame/SuhuangScroll-public/issues>. The publisher should monitor
that channel before submitting a public Plugin listing and keep this notice at
a stable HTTPS URL.
