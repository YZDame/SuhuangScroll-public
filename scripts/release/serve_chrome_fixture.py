#!/usr/bin/env python3
"""Serve the local synthetic Chrome adapter fixture for review smoke tests."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIRECTORY = ROOT / "extension" / "public"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    args = parser.parse_args()

    directory = args.directory.expanduser().resolve()
    fixture = directory / "fixture" / "synthetic-grading.html"
    if not fixture.is_file():
        raise SystemExit(f"Synthetic fixture not found: {fixture}")

    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Synthetic Chrome fixture: http://{args.host}:{args.port}/fixture/synthetic-grading.html")
    print("Press Ctrl-C to stop the fixture server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
