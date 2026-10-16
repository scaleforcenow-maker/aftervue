"""Shared fixtures: a factory that writes a valid draft and lets tests break one thing."""
from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

PARAGRAPH = (
    "A consult room preview gives the patient something concrete to react to, and it "
    "gives the injector a shared reference point for a realistic conversation about "
    "what is possible. Treat it as a conversation aid, never a promise of a clinical "
    "result, and label it as an illustration every time it appears on screen."
)  # 54 words


def make_body(*, words: int = 760, extra: str = "", intro: str = "") -> str:
    paras = []
    count = len(PARAGRAPH.split())
    n = max(1, -(-words // count))
    for i in range(n):
        if i % 4 == 0:
            paras.append(f"## Section {i // 4 + 1} of the guide")
        paras.append(PARAGRAPH)
    body = (intro + "\n\n" if intro else "") + "\n\n".join(paras)
    body += "\n\nSee the [AmSpa guidance](https://www.americanmedspa.org/news/photos/) and the [preview app](/app/).\n"
    if extra:
        body += "\n" + extra + "\n"
    body += "\n[Book a live demo](/)\n"
    return body


DEFAULT_META = {
    "title": "A Short Title About Previews",
    "description": "A description with a verb that explains what the reader learns.",
    "date": "2026-10-09",
    "cluster": "A",
    "target_page": "/",
    "internal_links": ["/", "/app/"],
    "sources": ["https://www.americanmedspa.org/news/photos/"],
    "status": "reviewed",
}


def write_draft(folder: Path, name: str = "a-short-title", *, body: str | None = None,
                raw_front_matter: str | None = None, **meta_overrides) -> Path:
    """Write <folder>/<name>.md with front matter from DEFAULT_META plus overrides.

    The front matter ``slug`` defaults to ``name``; pass ``slug=`` to make them differ.
    """
    import yaml

    folder.mkdir(parents=True, exist_ok=True)
    meta = dict(DEFAULT_META)
    meta["slug"] = name
    meta.update(meta_overrides)
    meta = {k: v for k, v in meta.items() if v is not None}
    fm = raw_front_matter if raw_front_matter is not None else yaml.safe_dump(meta, sort_keys=False, allow_unicode=True)
    text = "---\n" + fm.rstrip("\n") + "\n---\n\n" + (body if body is not None else make_body())
    path = folder / f"{name}.md"
    path.write_text(textwrap.dedent(text), encoding="utf-8")
    return path


@pytest.fixture
def drafts(tmp_path: Path) -> Path:
    d = tmp_path / "drafts"
    d.mkdir()
    return d
