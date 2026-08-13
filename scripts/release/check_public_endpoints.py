#!/usr/bin/env python3
"""Preflight the public policy site and Hosted MCP discovery endpoints."""

from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


SITE_PATHS = ("/", "/docs/", "/privacy/", "/terms/", "/support/")
REQUIRED_TOOL_NAMES = {
    "suhuang_runtime_pair",
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
}
LIVE_TOOL_NAMES = {"suhuang_start_grading", "suhuang_control_grading"}


def normalize_base(value: str, label: str, allow_insecure: bool) -> str:
    parsed = urlsplit(value)
    allowed_scheme = {"https"} | ({"http"} if allow_insecure else set())
    if parsed.scheme not in allowed_scheme or not parsed.netloc:
        schemes = "https" if not allow_insecure else "http(s)"
        raise ValueError(f"{label} must be an {schemes} URL")
    if parsed.query or parsed.fragment:
        raise ValueError(f"{label} must not contain a query or fragment")
    return value.rstrip("/")


def fetch(
    url: str,
    *,
    method: str = "GET",
    body: bytes | None = None,
    token: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    headers = {"user-agent": "SuhuangScroll-release-preflight/1"}
    if body is not None:
        headers["content-type"] = "application/json"
    if token:
        headers["authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)
    request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()
    except HTTPError as error:
        return error.code, {key.lower(): value for key, value in error.headers.items()}, error.read()
    except URLError as error:
        raise RuntimeError(f"request failed for {url}: {error.reason}") from error


def oauth_discovery_urls(issuer: str) -> tuple[str, str]:
    base = issuer.rstrip("/") + "/"
    return (
        urljoin(base, ".well-known/oauth-authorization-server"),
        urljoin(base, ".well-known/openid-configuration"),
    )


def check_authorization_server(issuer: str) -> list[str]:
    """Check the OAuth discovery contract required by the public Plugin host."""
    errors: list[str] = []
    metadata: dict | None = None
    last_error = ""
    for url in oauth_discovery_urls(issuer):
        try:
            status, _, body = fetch(url)
        except RuntimeError as error:
            last_error = str(error)
            continue
        if status != 200:
            last_error = f"HTTP {status}"
            continue
        try:
            candidate = json.loads(body)
        except json.JSONDecodeError as error:
            last_error = f"invalid JSON: {error}"
            continue
        if isinstance(candidate, dict):
            metadata = candidate
            break
        last_error = "response is not a JSON object"

    if metadata is None:
        return [f"OAuth authorization-server discovery failed for {issuer}: {last_error or 'no metadata document'}"]

    expected_issuer = issuer.rstrip("/")
    if metadata.get("issuer", "").rstrip("/") != expected_issuer:
        errors.append(f"OAuth discovery issuer mismatch for {issuer}")
    for field in ("authorization_endpoint", "token_endpoint"):
        value = metadata.get(field)
        parsed = urlsplit(value) if isinstance(value, str) else None
        if not parsed or parsed.scheme != "https" or not parsed.netloc:
            errors.append(f"OAuth discovery {field} is missing or not HTTPS for {issuer}")
    methods = metadata.get("code_challenge_methods_supported")
    if not isinstance(methods, list) or "S256" not in methods:
        errors.append(f"OAuth discovery must advertise PKCE S256 for {issuer}")
    auth_methods = metadata.get("token_endpoint_auth_methods_supported")
    if not isinstance(auth_methods, list) or not any(method in auth_methods for method in ("none", "private_key_jwt")):
        errors.append(f"OAuth discovery must support none or private_key_jwt at the token endpoint for {issuer}")
    # Authorization-server discovery may omit resource-specific scopes. The
    # required scope is checked in protected-resource metadata, MCP tool
    # security schemes, and the bearer challenge below.
    return errors


def check_tool_descriptors(tools: object) -> list[str]:
    """Check the public metadata that the Plugin portal imports during Scan Tools."""
    errors: list[str] = []
    if not isinstance(tools, list):
        return ["authenticated MCP tools/list did not return a tools array"]

    by_name = {
        tool.get("name"): tool
        for tool in tools
        if isinstance(tool, dict) and isinstance(tool.get("name"), str)
    }
    missing = sorted(REQUIRED_TOOL_NAMES - set(by_name))
    if missing:
        errors.append("authenticated MCP tools/list is missing tools: " + ", ".join(missing))

    for name in sorted(REQUIRED_TOOL_NAMES & set(by_name)):
        tool = by_name[name]
        for field in ("title", "description"):
            if not isinstance(tool.get(field), str) or not tool[field].strip():
                errors.append(f"MCP tool {name} is missing a non-empty {field}")
        schema = tool.get("inputSchema")
        if not isinstance(schema, dict) or schema.get("type") != "object":
            errors.append(f"MCP tool {name} is missing an object inputSchema")
        annotations = tool.get("annotations")
        if not isinstance(annotations, dict):
            errors.append(f"MCP tool {name} is missing explicit annotations")
        else:
            for field in ("readOnlyHint", "openWorldHint", "destructiveHint"):
                if not isinstance(annotations.get(field), bool):
                    errors.append(f"MCP tool {name} annotation {field} must be boolean")
            if name in LIVE_TOOL_NAMES:
                if annotations.get("destructiveHint") is not True:
                    errors.append(f"MCP live tool {name} must advertise destructiveHint=true")
            elif annotations.get("destructiveHint") is not False:
                errors.append(f"MCP non-live tool {name} must advertise destructiveHint=false")
        schemes = tool.get("securitySchemes")
        if not isinstance(schemes, list) or not any(
            isinstance(scheme, dict)
            and scheme.get("type") == "oauth2"
            and isinstance(scheme.get("scopes"), list)
            and "suhuang:runtime" in scheme["scopes"]
            for scheme in schemes
        ):
            errors.append(f"MCP tool {name} must advertise OAuth scope suhuang:runtime")

        required = schema.get("required", []) if isinstance(schema, dict) else []
        if name == "suhuang_start_grading" and not {"specPath", "confirm"}.issubset(required):
            errors.append("MCP suhuang_start_grading must require specPath and confirm")
        if name == "suhuang_control_grading" and not {"action", "confirm"}.issubset(required):
            errors.append("MCP suhuang_control_grading must require action and confirm")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-url", required=True, help="Public HTTPS origin serving site/.")
    parser.add_argument("--mcp-url", required=True, help="Public HTTPS Streamable HTTP endpoint, normally ending in /mcp.")
    parser.add_argument(
        "--mcp-token-env",
        default="SUHUANG_MCP_REVIEW_TOKEN",
        help="Environment variable containing an optional reviewer bearer token.",
    )
    parser.add_argument(
        "--check-review-fixture",
        action="store_true",
        help="With a reviewer token, call synthetic review tools and require /healthz reviewMode=fixture.",
    )
    parser.add_argument("--allow-insecure-http", action="store_true", help="Allow http:// URLs for a local smoke test only.")
    args = parser.parse_args()

    errors: list[str] = []
    try:
        site_url = normalize_base(args.site_url, "--site-url", args.allow_insecure_http)
        mcp_url = normalize_base(args.mcp_url, "--mcp-url", args.allow_insecure_http)
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    if urlsplit(mcp_url).path.rstrip("/") != "/mcp":
        errors.append("--mcp-url path must be /mcp")

    for path in SITE_PATHS:
        url = site_url + path
        try:
            status, headers, _ = fetch(url)
        except RuntimeError as error:
            errors.append(str(error))
            continue
        if status != 200:
            errors.append(f"public site {path} returned HTTP {status}")
        if "text/html" not in headers.get("content-type", ""):
            errors.append(f"public site {path} did not return text/html")

    mcp_origin = mcp_url.rsplit("/mcp", 1)[0]
    health: dict = {}
    try:
        health_status, _, health_body = fetch(f"{mcp_origin}/healthz")
        if health_status != 200:
            errors.append(f"MCP /healthz returned HTTP {health_status}")
        else:
            health = json.loads(health_body)
            if health.get("ok") is not True:
                errors.append("MCP /healthz did not report ok=true")
    except (RuntimeError, json.JSONDecodeError) as error:
        errors.append(f"MCP /healthz check failed: {error}")

    metadata_url = f"{mcp_origin}/.well-known/oauth-protected-resource"
    metadata: dict = {}
    try:
        metadata_status, _, metadata_body = fetch(metadata_url)
        if metadata_status != 200:
            errors.append(f"OAuth protected-resource metadata returned HTTP {metadata_status}")
        else:
            metadata = json.loads(metadata_body)
            resource = metadata.get("resource")
            if not isinstance(resource, str) or not resource:
                errors.append("OAuth metadata is missing resource")
            elif resource.rstrip("/") != mcp_origin:
                errors.append("OAuth metadata resource does not match the MCP origin")
            authorization_servers = metadata.get("authorization_servers")
            if not isinstance(authorization_servers, list) or not authorization_servers:
                errors.append("OAuth metadata is missing authorization_servers")
            if not metadata.get("resource_documentation"):
                errors.append("OAuth metadata is missing resource_documentation")
            elif isinstance(authorization_servers, list):
                for issuer in authorization_servers:
                    if not isinstance(issuer, str):
                        errors.append("OAuth metadata contains a non-string authorization server")
                        continue
                    errors.extend(check_authorization_server(issuer))
    except (RuntimeError, json.JSONDecodeError) as error:
        errors.append(f"OAuth metadata check failed: {error}")

    review_token = os.environ.get(args.mcp_token_env, "").strip()
    modern_meta = {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {"name": "suhuang-release-preflight", "version": "1"},
        "io.modelcontextprotocol/clientCapabilities": {},
    }
    discover = json.dumps({
        "jsonrpc": "2.0",
        "id": "discover-1",
        "method": "server/discover",
        "params": {"_meta": modern_meta},
    }).encode("utf-8")
    try:
        status, headers, body = fetch(
            mcp_url,
            method="POST",
            body=discover,
            token=review_token or None,
            extra_headers={
                "accept": "application/json, text/event-stream",
                "mcp-protocol-version": "2026-07-28",
                "mcp-method": "server/discover",
            },
        )
        if review_token:
            if status != 200:
                errors.append(f"authenticated modern MCP discovery returned HTTP {status}")
            else:
                response = json.loads(body)
                result = response.get("result") if isinstance(response, dict) else None
                supported = result.get("supportedVersions", []) if isinstance(result, dict) else []
                if not isinstance(supported, list) or "2026-07-28" not in supported:
                    errors.append("authenticated modern MCP discovery did not advertise 2026-07-28")
                if headers.get("mcp-protocol-version") != "2026-07-28":
                    errors.append("authenticated modern MCP discovery returned the wrong MCP-Protocol-Version")
        else:
            if status != 401:
                errors.append(f"unauthenticated modern MCP discovery returned HTTP {status}, expected 401")
            if "resource_metadata" not in headers.get("www-authenticate", ""):
                errors.append("unauthenticated MCP response is missing resource_metadata challenge")
    except (RuntimeError, json.JSONDecodeError) as error:
        errors.append(f"modern MCP discovery check failed: {error}")

    if review_token:
        tools_list = json.dumps({
            "jsonrpc": "2.0",
            "id": "tools-list-1",
            "method": "tools/list",
            "params": {"_meta": modern_meta},
        }).encode("utf-8")
        try:
            status, headers, body = fetch(
                mcp_url,
                method="POST",
                body=tools_list,
                token=review_token,
                extra_headers={
                    "accept": "application/json, text/event-stream",
                    "mcp-protocol-version": "2026-07-28",
                    "mcp-method": "tools/list",
                },
            )
            if status != 200:
                errors.append(f"authenticated MCP tools/list returned HTTP {status}")
            else:
                response = json.loads(body)
                result = response.get("result") if isinstance(response, dict) else None
                tools = result.get("tools") if isinstance(result, dict) else None
                errors.extend(check_tool_descriptors(tools))
                if headers.get("mcp-protocol-version") != "2026-07-28":
                    errors.append("authenticated MCP tools/list returned the wrong MCP-Protocol-Version")
        except (RuntimeError, json.JSONDecodeError) as error:
            errors.append(f"authenticated MCP tools/list check failed: {error}")

    initialize = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "suhuang-release-preflight", "version": "1"},
        },
    }).encode("utf-8")
    try:
        status, headers, body = fetch(
            mcp_url,
            method="POST",
            body=initialize,
            token=review_token or None,
            extra_headers={
                "accept": "application/json, text/event-stream",
                "mcp-method": "initialize",
            },
        )
        if review_token:
            if status != 200:
                errors.append(f"authenticated legacy MCP initialize returned HTTP {status}")
            else:
                response = json.loads(body)
                result = response.get("result") if isinstance(response, dict) else None
                if not isinstance(result, dict) or not result.get("protocolVersion"):
                    errors.append("authenticated legacy MCP initialize returned no protocolVersion")
    except (RuntimeError, json.JSONDecodeError) as error:
        errors.append(f"legacy MCP initialize check failed: {error}")

    if args.check_review_fixture:
        if not review_token:
            errors.append("--check-review-fixture requires a reviewer bearer token")
        if health.get("reviewMode") != "fixture":
            errors.append("review fixture check expected /healthz reviewMode=fixture")
        fixture_calls = (
            ("review-status", "suhuang_runtime_status", {}),
            (
                "review-prepare",
                "suhuang_prepare_grading",
                {"specPath": "workspace/specs/minimal-fill-blank-spec.md"},
            ),
        )
        for request_id, tool_name, arguments in fixture_calls:
            body = json.dumps({
                "jsonrpc": "2.0",
                "id": request_id,
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments, "_meta": modern_meta},
            }).encode("utf-8")
            try:
                status, _, response_body = fetch(
                    mcp_url,
                    method="POST",
                    body=body,
                    token=review_token or None,
                    extra_headers={
                        "accept": "application/json, text/event-stream",
                        "mcp-protocol-version": "2026-07-28",
                        "mcp-method": "tools/call",
                        "mcp-name": tool_name,
                    },
                )
                if status != 200:
                    errors.append(f"review fixture {tool_name} returned HTTP {status}")
                    continue
                response = json.loads(response_body)
                result = response.get("result") if isinstance(response, dict) else None
                structured = result.get("structuredContent") if isinstance(result, dict) else None
                if not isinstance(structured, dict) or structured.get("mode") != "review-fixture":
                    errors.append(f"review fixture {tool_name} did not return synthetic structured content")
            except (RuntimeError, json.JSONDecodeError) as error:
                errors.append(f"review fixture {tool_name} check failed: {error}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    auth_note = "authenticated modern discovery + legacy initialize" if review_token else "401 challenge"
    print(f"Public endpoints: OK ({len(SITE_PATHS)} site paths, OAuth metadata, {auth_note})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
