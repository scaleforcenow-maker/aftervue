#!/usr/bin/env python3
"""Fixture tests for check_metadata.py: one failing fixture per rule.

Run:  python3 -I tools/appstore/test_check_metadata.py
Standard library only (unittest).
"""
from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import check_metadata as cm  # noqa: E402

REPO = HERE.parents[1]
JSON_PATH = REPO / "ops" / "41_metadata.json"
MD_PATH = REPO / "ops" / cm.DEFAULT_MARKDOWN_NAME

DESC = (
    "AfterVue AI turns a consult into a preview. Every image is an AI illustration, "
    "not a guarantee. Photos are never stored. Subscriptions are sold on getaftervue.com."
)

GOOD = {
    "app": {"name": "AfterVue AI"},
    "locales": {
        "xx-XX": {
            "name": "AfterVue AI",
            "subtitle": "Before and after for clinics",
            "promotionalText": "Show patients a preview.",
            "keywords": "medspa,filler,lips",
            "description": DESC,
            "whatsNew": "First release.",
            "requiredPhrases": ["not a guarantee", "never stored", "sold on getaftervue.com"],
            "privacyPolicyUrl": "https://getaftervue.com/privacy.html",
            "marketingUrl": "https://getaftervue.com",
            "supportUrl": "https://getaftervue.com/support",
        }
    },
}


def mutate(**fields: object) -> dict:
    data = copy.deepcopy(GOOD)
    data["locales"]["xx-XX"].update(fields)
    return data


class RuleTests(unittest.TestCase):
    def run_data(self, data: dict) -> tuple[int, str]:
        return cm.run(data, None, label="fixture")

    def assert_fails(self, data: dict, fragment: str) -> None:
        code, report = self.run_data(data)
        self.assertEqual(code, 1, report)
        self.assertIn(fragment, report)

    def test_good_fixture_passes(self):
        code, report = self.run_data(GOOD)
        self.assertEqual(code, 0, report)
        self.assertNotIn("ERROR", report)

    def test_limits_counted_in_code_points(self):
        # 31 code points: 30 ASCII letters plus a precomposed "é" (one code point).
        sub = "a" * 30 + "é"
        self.assertEqual(len(sub), 31)
        self.assert_fails(mutate(subtitle=sub), "subtitle: 31 characters, limit 30")
        # Exactly 30 code points passes even though UTF-8 bytes exceed 30.
        ok = "a" * 29 + "é"
        self.assertGreater(len(ok.encode("utf-8")), 30)
        self.assertEqual(self.run_data(mutate(subtitle=ok))[0], 0)

    def test_every_limit_enforced(self):
        for field, limit in cm.DEFAULT_LIMITS.items():
            data = mutate(**{field: "x" * (limit + 1)})
            self.assert_fails(data, f"{field}: {limit + 1} characters, limit {limit}")

    def test_trademark_blocked_case_and_accent_folded(self):
        for spelling in ("Botox", "BOTOX", "Bótox", "bótox"):
            self.assert_fails(mutate(promotionalText=f"Preview {spelling} results"), "forbidden trademark 'botox'")

    def test_trademark_blocked_in_keywords_and_description(self):
        self.assert_fails(mutate(keywords="medspa,botox"), "keywords: contains forbidden trademark")
        self.assert_fails(mutate(description=DESC + " Bótox."), "description: contains forbidden trademark")

    def test_app_name_untranslated(self):
        self.assert_fails(mutate(name="AfterVue IA"), "name: must be exactly 'AfterVue AI'")
        self.assert_fails(mutate(description=DESC.replace("AfterVue AI", "AfterVue IA")),
                          "does not mention the app name 'AfterVue AI' verbatim")
        self.assert_fails(mutate(promotionalText="Con AfterVue IA"), "app name must stay untranslated")

    def test_keyword_space_after_comma(self):
        self.assert_fails(mutate(keywords="medspa, filler,lips"), "keywords: space after a comma")

    def test_keyword_empty_term(self):
        self.assert_fails(mutate(keywords="medspa,,lips"), "keywords: empty term")
        self.assert_fails(mutate(keywords="medspa,lips,"), "keywords: empty term")

    def test_keyword_duplicate_term(self):
        self.assert_fails(mutate(keywords="medspa,Medspa,lips"), "keywords: duplicate terms ['medspa']")

    def test_keyword_repeats_name_or_subtitle_word(self):
        self.assert_fails(mutate(keywords="medspa,clinics,lips"), "repeat words already indexed from name/subtitle")
        # Accent-folded: "clínicas" in the subtitle blocks "clinicas" in keywords.
        data = mutate(subtitle="Antes y después para clínicas", keywords="rellenos,clinicas")
        self.assert_fails(data, "['clinicas']")
        # Multi-word keyword whose second word is in the name.
        self.assert_fails(mutate(keywords="filler,skin ai"), "['ai']")

    def test_required_disclaimer_phrases(self):
        data = mutate(description=DESC.replace("never stored", "stored for a while"))
        self.assert_fails(data, "required disclaimer phrase missing: 'never stored'")

    def test_phone_number_rejected(self):
        self.assert_fails(mutate(whatsNew="Call us at +52 55 1234 5678"), "phone number")
        self.assert_fails(mutate(whatsNew="Ligue (11) 91234-5678"), "phone number")

    def test_price_rejected(self):
        self.assert_fails(mutate(whatsNew="Only $99/month"), "contains a price")
        self.assert_fails(mutate(whatsNew="Por R$ 199 por mês"), "contains a price")
        self.assert_fails(mutate(whatsNew="Desde 1,500 MXN"), "contains a price")

    def test_missing_field(self):
        data = mutate(promotionalText="")
        self.assert_fails(data, "promotionalText: missing or empty")

    def test_warnings_do_not_fail(self):
        data = mutate(supportUrl=None, marketingUrl="http://getaftervue.com")
        code, report = self.run_data(data)
        self.assertEqual(code, 0, report)
        self.assertIn("supportUrl is not set", report)
        self.assertIn("marketingUrl: not an https URL", report)

    def test_nfc_warning(self):
        decomposed = unicodedata.normalize("NFD", "Antes y después")
        code, report = self.run_data(mutate(subtitle=decomposed))
        self.assertIn("not NFC-normalized", report)


class MarkdownCrossCheckTests(unittest.TestCase):
    """The Markdown review copy must agree with the JSON."""

    def setUp(self):
        self.data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        self.md_text = MD_PATH.read_text(encoding="utf-8")

    def write_md(self, text: str) -> Path:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        tmp.write(text)
        tmp.close()
        self.addCleanup(Path(tmp.name).unlink)
        return Path(tmp.name)

    def test_real_files_agree(self):
        errors = cm.check_markdown(MD_PATH, self.data["locales"])
        self.assertEqual(errors, [])

    def test_table_value_drift_detected(self):
        es = self.data["locales"]["es-MX"]
        drifted = self.md_text.replace(f"| Subtitle | {es['subtitle']} |", "| Subtitle | Otro subtítulo |", 1)
        self.assertNotEqual(drifted, self.md_text)
        errors = cm.check_markdown(self.write_md(drifted), self.data["locales"])
        self.assertTrue(any("es-MX: subtitle differs" in e for e in errors), errors)

    def test_table_count_drift_detected(self):
        pt = self.data["locales"]["pt-BR"]
        n = len(pt["keywords"])
        drifted = self.md_text.replace(f"| Keywords | {pt['keywords']} | {n} |", f"| Keywords | {pt['keywords']} | {n + 1} |", 1)
        self.assertNotEqual(drifted, self.md_text)
        errors = cm.check_markdown(self.write_md(drifted), self.data["locales"])
        self.assertTrue(any("pt-BR: keywords char count in Markdown" in e for e in errors), errors)

    def test_description_drift_detected(self):
        pt = self.data["locales"]["pt-BR"]
        drifted = self.md_text.replace("não dentro do app.", "não dentro do aplicativo.", 1)
        self.assertNotEqual(drifted, self.md_text)
        errors = cm.check_markdown(self.write_md(drifted), self.data["locales"])
        self.assertTrue(any("pt-BR: description text differs" in e for e in errors), errors)
        self.assertIn("não dentro do app.", pt["description"])


class RealFileTests(unittest.TestCase):
    def test_repo_metadata_passes(self):
        data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        code, report = cm.run(data, MD_PATH, label=str(JSON_PATH))
        self.assertEqual(code, 0, report)

    def test_upload_file_contains_no_trademark_string(self):
        raw = cm.fold(JSON_PATH.read_text(encoding="utf-8"))
        for term in cm.FORBIDDEN_TERMS:
            self.assertNotIn(cm.fold(term), raw)


if __name__ == "__main__":
    unittest.main(verbosity=2)
