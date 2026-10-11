"""Unit tests for scripts/brand_check.py (standard library only).

Run:  python3 -m unittest discover -s scripts/tests -v
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import brand_check as bc  # noqa: E402

DRAFT = "_seo/drafts/article.md"
OPS = "ops/12_Something.md"


def rules_of(findings):
    return sorted({f.rule for f in findings})


class ExclamationRule(unittest.TestCase):
    def test_flags_exclamation_in_prose(self):
        f = bc.check_text("AfterVue previews are ready in seconds!\n", DRAFT)
        self.assertEqual(rules_of(f), ["exclamation"])
        self.assertEqual(f[0].line, 1)

    def test_flags_exclamation_in_heading(self):
        f = bc.check_text("# Welcome!\n\nBody.\n", DRAFT)
        self.assertEqual(rules_of(f), ["exclamation"])

    def test_ignores_fenced_code(self):
        md = "Intro.\n\n```js\nif (!ok) throw new Error('no!');\n```\n\nOutro.\n"
        self.assertEqual(bc.check_text(md, DRAFT), [])

    def test_ignores_tilde_fence(self):
        md = "~~~\n!important\n~~~\n"
        self.assertEqual(bc.check_text(md, DRAFT), [])

    def test_ignores_inline_code(self):
        self.assertEqual(bc.check_text("Use `!important` sparingly.\n", DRAFT), [])

    def test_ignores_indented_fence_in_list(self):
        md = "- Step one:\n\n    ```sh\n    echo done!\n    ```\n\n- Step two.\n"
        self.assertEqual(bc.check_text(md, DRAFT), [])

    def test_inline_code_does_not_open_html_comment(self):
        md = "Type `<!--` to start a comment. Then prose! here -->\n"
        self.assertEqual(rules_of(bc.check_text(md, DRAFT)), ["exclamation"])

    def test_ignores_front_matter(self):
        md = "---\ntitle: Wow!\n---\n\nCalm body.\n"
        self.assertEqual(bc.check_text(md, DRAFT), [])

    def test_ignores_html_comment(self):
        self.assertEqual(bc.check_text("<!-- TODO: fix this! -->\nText.\n", DRAFT), [])

    def test_ignores_image_syntax(self):
        self.assertEqual(bc.check_text("![before and after](img.png)\n", DRAFT), [])

    def test_ignores_url(self):
        self.assertEqual(bc.check_text("See https://example.com/a!b?x=1 for details.\n", DRAFT), [])

    def test_line_numbers_survive_blanking(self):
        md = "---\na: 1\n---\n\n```\ncode\n```\n\nline nine!\n"
        f = bc.check_text(md, DRAFT)
        self.assertEqual([(x.rule, x.line) for x in f], [("exclamation", 9)])


class DollarNearBrandRule(unittest.TestCase):
    def test_flags_amount_near_brand_same_paragraph(self):
        f = bc.check_text("AfterVue costs $199/mo for the app.\n", DRAFT)
        self.assertEqual(rules_of(f), ["dollar-near-brand"])
        self.assertEqual(f[0].text, "$199/mo")

    def test_flags_amount_before_brand(self):
        f = bc.check_text("Just $1,500 gets you AfterVue.\n", DRAFT)
        self.assertEqual(rules_of(f), ["dollar-near-brand"])

    def test_amount_in_other_paragraph_not_flagged(self):
        md = "AfterVue is a preview tool.\n\nA typical consult runs $300.\n"
        self.assertEqual(bc.check_text(md, DRAFT), [])

    def test_amount_without_brand_not_flagged(self):
        self.assertEqual(bc.check_text("Treatments average $450 nationally.\n", OPS), [])

    def test_shell_variable_not_an_amount(self):
        self.assertEqual(bc.check_text("AfterVue reads $HOME and $1.\n", OPS)[0].text, "$1")

    def test_far_apart_in_long_paragraph_not_flagged(self):
        filler = "x" * (bc.DOLLAR_WINDOW + 5)
        md = f"AfterVue {filler} $99\n"
        self.assertEqual(bc.check_text(md, DRAFT), [])

    def test_applies_in_ops_too(self):
        self.assertEqual(rules_of(bc.check_text("AfterVue: $50\n", OPS)), ["dollar-near-brand"])


class BotoxRule(unittest.TestCase):
    def test_flags_in_seo_drafts(self):
        f = bc.check_text("Botox before and after previews.\n", DRAFT)
        self.assertEqual(rules_of(f), ["botox"])

    def test_case_insensitive(self):
        self.assertEqual(rules_of(bc.check_text("try BOTOX today\n", DRAFT)), ["botox"])

    def test_allowed_in_ops(self):
        self.assertEqual(bc.check_text("Botox is a brand name; use neuromodulator.\n", OPS), [])

    def test_word_boundary(self):
        self.assertEqual(bc.check_text("botoxlike is not the word\n", DRAFT), [])

    def test_nested_drafts_path(self):
        f = bc.check_text("Botox\n", "_seo/drafts/2026/cluster-a.md")
        self.assertEqual(rules_of(f), ["botox"])


class PhoneNumberRule(unittest.TestCase):
    def assert_phone(self, text):
        f = bc.check_text(text + "\n", OPS)
        self.assertEqual(rules_of(f), ["phone-number"], text)

    def assert_not_phone(self, text):
        f = bc.check_text(text + "\n", OPS)
        self.assertEqual([x for x in f if x.rule == "phone-number"], [], text)

    def test_us_formats(self):
        for s in ("Call (415) 555-0199.", "Call 415-555-0199", "415.555.0199",
                  "+1 415 555 0199", "1-415-555-0199", "tel 4155550199"):
            self.assert_phone(s)

    def test_international(self):
        for s in ("+44 20 7946 0958", "+55 11 91234-5678", "+353 1 234 5678"):
            self.assert_phone(s)

    def test_vanity(self):
        self.assert_phone("1-800-FLOWERS")

    def test_dates_and_ids_not_flagged(self):
        for s in ("2026-10-09", "ISBN 978-3-16-148410-0", "order 12345678", "commit 9ccc381",
                  "billing account 01537A-F66626-2687E3", "version 1.2.3.4", "1234567"):
            self.assert_not_phone(s)

    def test_in_code_not_flagged(self):
        self.assert_not_phone("`415-555-0199`")


class Allowlist(unittest.TestCase):
    def test_parse(self):
        entries = bc.parse_allowlist(
            "# comment\n\npath=ops/legacy/*\nrule=phone-number match=\"(555) 555-5555\"\n"
            "rule=botox path=_seo/drafts/glossary.md\n")
        self.assertEqual(len(entries), 3)
        self.assertEqual(entries[1].match, "(555) 555-5555")

    def test_parse_rejects_unknown_rule(self):
        with self.assertRaises(ValueError):
            bc.parse_allowlist("rule=nope path=x\n")

    def test_parse_rejects_bare_token(self):
        with self.assertRaises(ValueError):
            bc.parse_allowlist("ops/file.md\n")

    def test_match_entry_filters(self):
        f = bc.check_text("Reach us at (555) 555-5555 or (415) 555-0199.\n", OPS)
        allow = bc.parse_allowlist('rule=phone-number match="(555) 555-5555"\n')
        left = bc.apply_allowlist(f, allow)
        self.assertEqual([x.text for x in left], ["(415) 555-0199"])

    def test_rule_path_entry_filters(self):
        f = bc.check_text("Botox!\n", DRAFT)
        allow = bc.parse_allowlist("rule=botox path=_seo/drafts/*\n")
        self.assertEqual(rules_of(bc.apply_allowlist(f, allow)), ["exclamation"])

    def test_glob_double_star(self):
        f = bc.check_text("Botox\n", "_seo/drafts/2026/a.md")
        allow = bc.parse_allowlist("rule=botox path=_seo/drafts/**/*.md\n")
        self.assertEqual(bc.apply_allowlist(f, allow), [])

    def test_repo_allowlist_parses(self):
        path = HERE.parent / "brand_check_allow.txt"
        self.assertTrue(path.exists())
        bc.parse_allowlist(path.read_text())


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "_seo/drafts").mkdir(parents=True)
        (self.root / "ops").mkdir()
        (self.root / "scripts").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, text):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def test_empty_tree_passes(self):
        self.assertEqual(bc.main(["--root", str(self.root), "-q"]), 0)

    def test_missing_dirs_pass(self):
        self.assertEqual(bc.main(["--root", str(self.root), "nope/", "-q"]), 0)

    def test_findings_fail(self):
        self.write("_seo/drafts/a.md", "Great results!\n")
        self.write("ops/b.md", "Botox is fine here.\n")
        self.assertEqual(bc.main(["--root", str(self.root), "-q"]), 1)

    def test_clean_tree_passes(self):
        self.write("_seo/drafts/a.md", "# Title\n\nCalm, sourced copy.\n")
        self.write("ops/b.md", "Botox is fine here.\n")
        self.assertEqual(bc.main(["--root", str(self.root), "-q"]), 0)

    def test_allowlist_file_used(self):
        self.write("_seo/drafts/a.md", "Great results!\n")
        self.write("scripts/brand_check_allow.txt", "rule=exclamation path=_seo/drafts/a.md\n")
        self.assertEqual(bc.main(["--root", str(self.root), "-q"]), 0)

    def test_path_only_entry_skips_file(self):
        self.write("ops/legacy/old.md", "Call 415-555-0199!\n")
        self.write("scripts/brand_check_allow.txt", "path=ops/legacy/*\n")
        self.assertEqual(bc.main(["--root", str(self.root), "-q"]), 0)

    def test_bad_allowlist_is_usage_error(self):
        self.write("scripts/brand_check_allow.txt", "rule=bogus path=x\n")
        self.assertEqual(bc.main(["--root", str(self.root), "-q"]), 2)

    def test_explicit_file_argument(self):
        self.write("docs/x.md", "Hi!\n")
        self.assertEqual(bc.main(["--root", str(self.root), "docs/x.md", "-q"]), 1)


if __name__ == "__main__":
    unittest.main()
