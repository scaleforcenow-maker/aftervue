import json

import build
import check_drafts
from conftest import make_body, write_draft


def test_build_writes_pages_index_sitemap_and_manifest(drafts, tmp_path, capsys):
    write_draft(drafts, "first", date="2026-10-01")
    write_draft(drafts, "second", date="2026-10-09", title="Second Guide")
    write_draft(drafts, "pending", status="draft", title="Pending Guide")
    out = tmp_path / "site_out"
    assert build.main(["--drafts", str(drafts), "--out", str(out)]) == 0
    assert (out / "resources" / "first" / "index.html").exists()
    assert (out / "resources" / "second" / "index.html").exists()
    assert not (out / "resources" / "pending").exists()
    index = (out / "resources" / "index.html").read_text(encoding="utf-8")
    assert index.index("/resources/second/") < index.index("/resources/first/")
    assert "Pending Guide" not in index
    assert "/resources/second/" in (out / "sitemap-resources.xml").read_text(encoding="utf-8")
    manifest = json.loads((out / "build-manifest.json").read_text(encoding="utf-8"))
    assert [p["slug"] for p in manifest["pages"]] == ["second", "first"]
    assert "skipping pending.md (status 'draft')" in capsys.readouterr().out


def test_build_include_drafts(drafts, tmp_path):
    write_draft(drafts, "pending", status="draft")
    out = tmp_path / "site_out"
    assert build.main(["--drafts", str(drafts), "--out", str(out), "--include-drafts"]) == 0
    assert (out / "resources" / "pending" / "index.html").exists()


def test_build_fails_and_writes_nothing_on_invalid(drafts, tmp_path, capsys):
    write_draft(drafts, "good")
    write_draft(drafts, "bad", title="t" * 70)
    out = tmp_path / "site_out"
    assert build.main(["--drafts", str(drafts), "--out", str(out)]) == 1
    assert not out.exists()
    assert "bad.md: title is 70 characters" in capsys.readouterr().out


def test_build_skip_invalid_builds_the_rest(drafts, tmp_path):
    write_draft(drafts, "good")
    write_draft(drafts, "bad", title="t" * 70)
    write_draft(drafts, "links-to-bad", body=make_body(extra="See [bad](/resources/bad/)."))
    out = tmp_path / "site_out"
    assert build.main(["--drafts", str(drafts), "--out", str(out), "--skip-invalid"]) == 1
    assert (out / "resources" / "good" / "index.html").exists()
    assert not (out / "resources" / "bad").exists()
    assert not (out / "resources" / "links-to-bad").exists()


def test_build_without_drafts_folder_makes_empty_listing(tmp_path):
    out = tmp_path / "site_out"
    assert build.main(["--drafts", str(tmp_path / "missing"), "--out", str(out)]) == 0
    assert (out / "resources" / "index.html").exists()
    assert "<loc>https://getaftervue.com/resources/</loc>" in (out / "sitemap-resources.xml").read_text(encoding="utf-8")


def test_check_drafts_table_and_exit_codes(drafts, capsys):
    write_draft(drafts, "good", status="draft")
    write_draft(drafts, "other", body=make_body(extra="See [good](/resources/good/)."))
    assert check_drafts.main(["--drafts", str(drafts)]) == 0
    out = capsys.readouterr().out
    assert "good.md" in out and "ok" in out and "2 draft(s) ok" in out

    write_draft(drafts, "bad", body=make_body(extra="Wow!"))
    assert check_drafts.main(["--drafts", str(drafts), "--format", "markdown"]) == 1
    out = capsys.readouterr().out
    assert "| `bad.md` | reviewed | - exclamation mark" in out
    assert "1 of 3 draft(s) failed" in out


def test_check_drafts_reports_unreadable_file(drafts, capsys):
    (drafts / "broken.md").write_text("# no front matter\n", encoding="utf-8")
    assert check_drafts.main(["--drafts", str(drafts)]) == 1
    assert "no YAML front matter" in capsys.readouterr().out


def test_check_drafts_empty_folder_is_ok(drafts, capsys):
    assert check_drafts.main(["--drafts", str(drafts)]) == 0
    assert "nothing to check" in capsys.readouterr().out
