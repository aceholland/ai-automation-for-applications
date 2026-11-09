import unittest
from agent.preparation import prepare, render_document, facts_for_profile, validate_selection


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.profile = {"name": "Asha Rao", "email": "asha@example.org", "skills": "Python, SQL", "experience": "Built a library catalog.",
                        "answers": [{"question": "Why this program?", "answer": "I want to study accessible search."}]}
        self.item = {"id": "1", "title": "Research fellowship", "category": "Research fellowship", "organization": "Lab", "description": "Python search research"}

    def test_baseline_works_without_ai_and_leaves_unknowns(self):
        pack = prepare(self.profile, self.item)
        self.assertEqual(pack["mode"], "profile")
        self.assertEqual(pack["profile"]["email"], "asha@example.org")
        self.assertTrue(any(x["question"] == "Why this program?" for x in pack["answers"]))
        self.assertTrue(pack["missing"])
        self.assertIn("Built a library catalog.", pack["resume"])

    def test_ai_can_select_only_existing_profile_facts(self):
        facts = facts_for_profile(self.profile)
        selected = validate_selection({"fact_ids": [facts[0]["id"]], "answers": []}, facts)
        self.assertEqual(selected["fact_ids"], [facts[0]["id"]])
        with self.assertRaises(ValueError):
            validate_selection({"fact_ids": ["invented-award"], "answers": []}, facts)
        with self.assertRaises(ValueError):
            validate_selection({"fact_ids": [], "answers": [{"question": "Your awards?", "answer": "Won a Nobel", "fact_ids": []}]}, facts)

    def test_ai_generated_answers_are_assembled_from_verified_facts(self):
        facts = facts_for_profile(self.profile)
        exp = next(f["id"] for f in facts if f["field"] == "experience")
        def ai(_profile, _item, _facts):
            return {"fact_ids": [exp], "answers": [{"question": "Relevant experience", "fact_ids": [exp]}]}
        pack = prepare(self.profile, self.item, ai)
        answer = next(a for a in pack["answers"] if a["question"] == "Relevant experience")
        self.assertEqual(answer["answer"], "Built a library catalog.")
        self.assertEqual(pack["mode"], "ai-assisted")

    def test_empty_profile_cannot_generate_an_application(self):
        with self.assertRaises(ValueError):
            prepare({}, self.item)

    def test_export_escapes_personal_content(self):
        pack = prepare({**self.profile, "name": '<script>alert(1)</script>'}, self.item)
        html = render_document(self.item, pack, "resume")
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertIn("&lt;script&gt;", html)


if __name__ == "__main__":
    unittest.main()
