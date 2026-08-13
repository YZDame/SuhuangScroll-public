#!/usr/bin/env python3
"""Check the dependency-free public policy and support site."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
SITE_ROOT = ROOT / "site"
REQUIRED_FILES = (
    "index.html",
    "docs/index.html",
    "chrome/index.html",
    "privacy/index.html",
    "terms/index.html",
    "support/index.html",
    "styles.css",
)
PRIVATE_SOURCE_REPOSITORY = "YZDame/" + "SuhuangScroll"
PRIVATE_SOURCE_REPOSITORY_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9_.-])github\.com/{re.escape(PRIVATE_SOURCE_REPOSITORY)}(?:/|$)"
)
FORBIDDEN_FRAGMENTS = (
    "/Users/",
    "/private/",
    "BEGIN PRIVATE KEY",
)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.has_title = False
        self.has_viewport = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"] or "")
        if tag == "title":
            self.has_title = True
        if tag == "meta" and attributes.get("name", "").lower() == "viewport":
            self.has_viewport = True


def local_target(page: Path, href: str) -> Path | None:
    parsed = urlparse(href)
    if parsed.scheme or parsed.netloc or href.startswith("#"):
        return None
    target = (page.parent / parsed.path).resolve()
    if href.endswith("/"):
        target = target / "index.html"
    return target


def main() -> int:
    errors: list[str] = []
    for relative in REQUIRED_FILES:
        path = SITE_ROOT / relative
        if not path.is_file():
            errors.append(f"missing public site file: site/{relative}")

    for path in sorted(SITE_ROOT.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        for fragment in FORBIDDEN_FRAGMENTS:
            if fragment in text:
                errors.append(f"private fragment {fragment!r} in {path.relative_to(ROOT)}")
        if PRIVATE_SOURCE_REPOSITORY_PATTERN.search(text):
            errors.append(
                "private source repository URL in "
                f"{path.relative_to(ROOT)}"
            )
        parser = LinkParser()
        parser.feed(text)
        if not parser.has_title:
            errors.append(f"missing <title> in {path.relative_to(ROOT)}")
        if not parser.has_viewport:
            errors.append(f"missing viewport metadata in {path.relative_to(ROOT)}")
        for href in parser.links:
            target = local_target(path, href)
            if target is not None and not target.is_file():
                errors.append(f"broken local link {href!r} in {path.relative_to(ROOT)}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"Public site: OK ({len(list(SITE_ROOT.rglob('*.html')))} HTML pages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
