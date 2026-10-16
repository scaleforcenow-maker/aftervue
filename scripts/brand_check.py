#!/usr/bin/env python3
"""Brand-rules checker for AfterVue marketing and ops markdown.

Scans ``*.md`` under ``_seo/drafts/`` and ``ops/`` (or paths given on the
command line) and fails when the body text breaks one of these rules:

  exclamation     an exclamation mark in body text (prose, not code, front
                  matter, HTML comments, URLs, or ``![image]`` syntax)
  dollar-near-brand
                  a dollar amount within DOLLAR_WINDOW characters of the word
                  "AfterVue" in the same paragraph (pricing never goes in copy)
  botox           the word "Botox" in _seo/drafts/ (allowed in ops/, which is
                  internal). The public site uses generic treatment names.
  phone-number    anything shaped like a phone number (US or international)

Allowlist: ``scripts/brand_check_allow.txt``. One entry per line, ``#`` for
comments, fields are ``key=value`` tokens (quote values with spaces):

  path=<glob>                       skip the whole file
  rule=<id> path=<glob>             skip one rule for matching files
  match=<text>                      allow any finding whose matched text is <text>
  rule=<id> match=<text>            same, for one rule only
  rule=<id> path=<glob> match=<text>

Globs are matched against the repository-relative POSIX path and follow
``fnmatch`` semantics with ``**`` also accepted (it behaves like ``*``).

Exit status: 0 clean (or nothing to scan), 1 findings, 2 usage error.
Standard library only; runs on Python 3.8+.
"""
from __future__ import annotations

import argparse
import fnmatch
import os
import re
import shlex
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable, List, Optional, Sequence

DEFAULT_SCAN_DIRS = ("_seo/drafts", "ops")
BOTOX_DIRS = ("_seo/drafts",)
DEFAULT_ALLOWLIST = "scripts/brand_check_allow.txt"
DOLLAR_WINDOW = 160  # characters between a $ amount and "AfterVue"

RULE_IDS = ("exclamation", "dollar-near-brand", "botox", "phone-number")

# --- patterns ---------------------------------------------------------------

FENCED_CODE_RE = re.compile(r"^[ \t]*(```|~~~).*?^[ \t]*\1[ \t]*$", re.MULTILINE | re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
FRONT_MATTER_RE = re.compile(r"\A---[ \t]*\n.*?\n---[ \t]*\n", re.DOTALL)
URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>()\[\]\"']+")
IMAGE_BANG_RE = re.compile(r"!(?=\[)")

EXCLAMATION_RE = re.compile(r"!")
DOLLAR_RE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?\s?(?:[kKmM]\b|/\s?(?:mo|month|yr|year|visit|seat|user)\b)?"
)
BRAND_RE = re.compile(r"\bAfterVue\b")
BOTOX_RE = re.compile(r"\bbotox\b", re.IGNORECASE)
PHONE_RE = re.compile(
    r"(?<![\w./-])"
    r"(?:"
    r"(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}"  # US/Canada
    r"|\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?"  # international
    r"|1[\s.-]?8(?:00|33|44|55|66|77|88)[\s.-]?[A-Z0-9]{3}[\s.-]?[A-Z0-9]{4}"  # vanity 1-800
    r")"
    r"(?![\w-])"
)


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str
    text: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: [{self.rule}] {self.message}: {self.text!r}"


@dataclass(frozen=True)
class AllowEntry:
    rule: Optional[str] = None
    path: Optional[str] = None
    match: Optional[str] = None

    def covers(self, finding: Finding) -> bool:
        if self.rule and self.rule != finding.rule:
            return False
        if self.path and not _glob_match(finding.path, self.path):
            return False
        if self.match is not None and self.match != finding.text:
            return False
        return bool(self.rule or self.path or self.match is not None)


def _glob_match(path: str, pattern: str) -> bool:
    pattern = pattern.replace("**/", "*").replace("**", "*")
    p = PurePosixPath(path).as_posix()
    return fnmatch.fnmatchcase(p, pattern) or fnmatch.fnmatchcase(p, "*/" + pattern)


# --- allowlist --------------------------------------------------------------

def parse_allowlist(text: str) -> List[AllowEntry]:
    entries: List[AllowEntry] = []
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        fields = {}
        for token in shlex.split(line, comments=True):
            if "=" not in token:
                raise ValueError(f"allowlist line {lineno}: expected key=value, got {token!r}")
            key, value = token.split("=", 1)
            if key not in ("rule", "path", "match"):
                raise ValueError(f"allowlist line {lineno}: unknown key {key!r}")
            fields[key] = value
        if "rule" in fields and fields["rule"] not in RULE_IDS:
            raise ValueError(f"allowlist line {lineno}: unknown rule {fields['rule']!r}")
        if not fields:
            continue
        entries.append(AllowEntry(**fields))
    return entries


def load_allowlist(path: Optional[Path]) -> List[AllowEntry]:
    if path is None or not path.exists():
        return []
    return parse_allowlist(path.read_text(encoding="utf-8"))


# --- scanning ---------------------------------------------------------------

def _blank_out(text: str, pattern: re.Pattern) -> str:
    """Replace matches with spaces (newlines kept) so offsets and line numbers hold."""
    def repl(m: re.Match) -> str:
        return "".join("\n" if ch == "\n" else " " for ch in m.group(0))
    return pattern.sub(repl, text)


def body_text(markdown: str) -> str:
    """Markdown with non-prose regions blanked out, same length as the input."""
    text = _blank_out(markdown, FRONT_MATTER_RE)
    text = _blank_out(text, FENCED_CODE_RE)
    text = _blank_out(text, INLINE_CODE_RE)   # before comments: `<!--` in code must not open one
    text = _blank_out(text, HTML_COMMENT_RE)
    text = _blank_out(text, URL_RE)
    text = _blank_out(text, IMAGE_BANG_RE)
    return text


def _line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _paragraphs(text: str) -> Iterable[tuple]:
    """Yield (start_offset, paragraph_text) for blank-line separated blocks."""
    pos = 0
    for block in re.split(r"\n[ \t]*\n", text):
        start = text.find(block, pos) if block else pos
        if block.strip():
            yield start, block
        pos = start + len(block)


def check_text(markdown: str, path: str, rules: Sequence[str] = RULE_IDS) -> List[Finding]:
    """Check one document's text. ``path`` decides whether the botox rule applies."""
    text = body_text(markdown)
    findings: List[Finding] = []
    posix = PurePosixPath(path).as_posix()

    if "exclamation" in rules:
        for m in EXCLAMATION_RE.finditer(text):
            findings.append(Finding(posix, _line_of(text, m.start()), "exclamation",
                                    _context(text, m.start(), m.end()),
                                    "exclamation mark in body text"))

    if "dollar-near-brand" in rules:
        for start, para in _paragraphs(text):
            brands = [m for m in BRAND_RE.finditer(para)]
            if not brands:
                continue
            for d in DOLLAR_RE.finditer(para):
                near = any(min(abs(d.start() - b.end()), abs(b.start() - d.end())) <= DOLLAR_WINDOW
                           for b in brands)
                if near:
                    findings.append(Finding(posix, _line_of(text, start + d.start()),
                                            "dollar-near-brand", d.group(0).strip(),
                                            "dollar amount next to AfterVue (no pricing in copy)"))

    if "botox" in rules and _botox_applies(posix):
        for m in BOTOX_RE.finditer(text):
            findings.append(Finding(posix, _line_of(text, m.start()), "botox", m.group(0),
                                    "brand-name drug in public draft (use a generic term)"))

    if "phone-number" in rules:
        for m in PHONE_RE.finditer(text):
            if _looks_like_phone(m.group(0)):
                findings.append(Finding(posix, _line_of(text, m.start()), "phone-number",
                                        m.group(0), "phone-number pattern"))

    findings.sort(key=lambda f: (f.line, f.rule))
    return findings


def _botox_applies(posix_path: str) -> bool:
    return any(posix_path == d or posix_path.startswith(d + "/") or f"/{d}/" in f"/{posix_path}"
               for d in BOTOX_DIRS)


def _looks_like_phone(s: str) -> bool:
    digits = re.sub(r"[^0-9A-Z]", "", s)  # vanity numbers spell digits with letters
    if not 7 <= len(digits) <= 15:
        return False
    # A bare run of digits with no separators is more likely an ID than a phone,
    # unless it is a 10/11-digit North American number.
    if re.fullmatch(r"\d+", s):
        return len(digits) in (10, 11)
    return True


def _context(text: str, start: int, end: int, width: int = 30) -> str:
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", end)
    line_end = len(text) if line_end == -1 else line_end
    lo = max(line_start, start - width)
    hi = min(line_end, end + width)
    return text[lo:hi].strip()


def apply_allowlist(findings: Iterable[Finding], allow: Sequence[AllowEntry]) -> List[Finding]:
    return [f for f in findings if not any(e.covers(f) for e in allow)]


def iter_markdown_files(root: Path, scan_dirs: Sequence[str]) -> Iterable[Path]:
    for d in scan_dirs:
        base = root / d
        if base.is_file() and base.suffix.lower() == ".md":
            yield base
            continue
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*.md")):
            if "node_modules" in p.parts:
                continue
            yield p


def check_paths(root: Path, scan_dirs: Sequence[str], allow: Sequence[AllowEntry]) -> tuple:
    """Return (findings, files_scanned)."""
    all_findings: List[Finding] = []
    count = 0
    for file in iter_markdown_files(root, scan_dirs):
        rel = file.relative_to(root).as_posix() if _is_relative(file, root) else file.as_posix()
        if any(e.path and not e.rule and e.match is None and _glob_match(rel, e.path) for e in allow):
            continue
        count += 1
        try:
            md = file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            md = file.read_text(encoding="utf-8", errors="replace")
        all_findings.extend(apply_allowlist(check_text(md, rel), allow))
    return all_findings, count


def _is_relative(p: Path, root: Path) -> bool:
    try:
        p.relative_to(root)
        return True
    except ValueError:
        return False


# --- CLI --------------------------------------------------------------------

def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("paths", nargs="*", help="dirs or .md files to scan (default: %s)" % ", ".join(DEFAULT_SCAN_DIRS))
    ap.add_argument("--root", default=".", help="repository root (default: .)")
    ap.add_argument("--allow", default=None, help="allowlist file (default: %s under root)" % DEFAULT_ALLOWLIST)
    ap.add_argument("--no-allow", action="store_true", help="ignore the allowlist")
    ap.add_argument("-q", "--quiet", action="store_true", help="only print findings")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    allow_path = None if args.no_allow else Path(args.allow) if args.allow else root / DEFAULT_ALLOWLIST
    try:
        allow = load_allowlist(allow_path)
    except ValueError as e:
        print(f"brand_check: {e}", file=sys.stderr)
        return 2

    scan_dirs = args.paths or list(DEFAULT_SCAN_DIRS)
    findings, count = check_paths(root, scan_dirs, allow)

    for f in findings:
        print(f)
    if not args.quiet:
        where = ", ".join(scan_dirs)
        if count == 0:
            print(f"brand_check: nothing to scan under {where} (ok)")
        elif findings:
            print(f"brand_check: {len(findings)} finding(s) in {count} file(s) under {where}")
        else:
            print(f"brand_check: {count} file(s) clean under {where}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
