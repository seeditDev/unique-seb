"""
test_assessment_engine.py
Unit tests for SEED SEB assessment_engine.py

Run with:
    python -m unittest test_assessment_engine.py
    python -m pytest test_assessment_engine.py -v

Tests focus on:
    1. Fail-closed hidden test behavior
    2. Sample tests never substituting for official scoring
    3. Correct payload fields including scoring_authority
    4. Encoding/decoding round-trip
    5. get_student_id() prefers UID over email
"""

import sys
import os
import json
import base64
import unittest
import tempfile
import shutil
import types

# ── Shims for missing desktop module dependencies ─────────────────────────────

class _RuntimeManager:
    def __init__(self, root):
        self.app_root = root
        self.runtimes_dir = os.path.join(root, "runtimes")

class _CodeExecutor:
    """Minimal code executor shim for tests."""
    def execute(self, language, code, stdin='', time_limit=2.0):
        return {
            'stdout': 'hello\n',
            'stderr': '',
            'error':  None,
            'execution_time': 0.01,
        }

# ── Path setup ────────────────────────────────────────────────────────────────

DESKTOP_DIR = os.path.dirname(os.path.abspath(__file__))
if DESKTOP_DIR not in sys.path:
    sys.path.insert(0, DESKTOP_DIR)


class BaseEngineTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        
        # Inject mocks
        rm_mod = types.ModuleType('runtime_manager')
        rm_mod.runtime_manager = _RuntimeManager(self.temp_dir)
        sys.modules['runtime_manager'] = rm_mod

        ex_mod = types.ModuleType('executor')
        ex_mod.code_executor = _CodeExecutor()
        sys.modules['executor'] = ex_mod

        if 'assessment_engine' in sys.modules:
            del sys.modules['assessment_engine']
        import assessment_engine as ae_module
        self.ae_module = ae_module
        self.engine = ae_module.AssessmentEngine()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def create_sample_question(self, qid='q_hello'):
        question = {
            'id':          qid,
            'title':       'Hello World',
            'statement':   'Print Hello World',
            'sampleTests': [{'input': '', 'expected': 'hello\n'}],
            'timeLimit':   2.0,
            'memoryLimit': 256,
        }
        q_path = os.path.join(self.temp_dir, 'data', 'questions', f'{qid}.json')
        os.makedirs(os.path.dirname(q_path), exist_ok=True)
        with open(q_path, 'w') as f:
            json.dump(question, f)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. load_hidden_tests — Fail-closed behavior
# ═══════════════════════════════════════════════════════════════════════════════

class TestLoadHiddenTests(BaseEngineTest):
    def test_missing_file_returns_none(self):
        """Missing hidden test file must return None, NOT an empty list."""
        result = self.engine.load_hidden_tests('nonexistent_question')
        self.assertIsNone(result, f"Expected None when hidden test file is missing, got: {result!r}")

    def test_missing_file_does_not_return_empty_list(self):
        """Explicitly assert that [] is not returned on missing file."""
        result = self.engine.load_hidden_tests('nonexistent_question')
        self.assertNotEqual(result, [], "load_hidden_tests returned [] for a missing file. Must return None.")

    def test_valid_file_returns_list(self):
        """A correctly encoded file should return a list of test cases."""
        test_cases = [
            {'input': '1 2', 'expected': '3\n'},
            {'input': '5 5', 'expected': '10\n'},
        ]
        self.engine.save_hidden_tests_raw('q_valid', test_cases)
        result = self.engine.load_hidden_tests('q_valid')

        self.assertIsNotNone(result, "Expected list, got None for a valid hidden test file.")
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)

    def test_corrupt_file_returns_none(self):
        """A corrupt (un-decodable) hidden test file must return None."""
        hidden_dir = os.path.join(self.temp_dir, 'data', 'questions', 'hidden')
        os.makedirs(hidden_dir, exist_ok=True)
        corrupt_path = os.path.join(hidden_dir, 'q_corrupt_hidden.json')
        with open(corrupt_path, 'w') as f:
            f.write('this is not valid base64 or XOR encoded data !@#$')

        result = self.engine.load_hidden_tests('q_corrupt')
        self.assertIsNone(result, f"Expected None for corrupt hidden test file, got: {result!r}.")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. submit_code_assessment — Fail-closed behavior
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubmitCodeAssessment(BaseEngineTest):
    def test_missing_hidden_tests_returns_config_error(self):
        """When hidden tests are missing, submit must return configurationError, NOT sample test score."""
        self.create_sample_question('q_hello')
        result = self.engine.submit_code_assessment('python', 'print("hello")', 'q_hello')

        self.assertTrue(result.get('configurationError'), f"Expected configurationError=True. Got: {result}")
        self.assertEqual(result.get('score'), 0, f"Expected score=0. Got score={result.get('score')}")
        self.assertEqual(result.get('error'), 'HIDDEN_TESTS_MISSING')

    def test_missing_hidden_tests_does_not_use_sample_tests(self):
        """Sample tests MUST NOT be used as a scoring fallback."""
        self.create_sample_question('q_hello')
        result = self.engine.submit_code_assessment('python', 'print("hello")', 'q_hello')

        self.assertEqual(result.get('score', 0), 0, "Score is non-zero with missing hidden tests.")
        self.assertEqual(result.get('total', 0), 0, "Total tests is non-zero with missing hidden tests.")

    def test_with_hidden_tests_returns_score(self):
        """When hidden tests are present, submission should return a numeric score."""
        self.create_sample_question('q_hello')
        test_cases = [{'input': '', 'expected': 'hello\n'}]
        self.engine.save_hidden_tests_raw('q_hello', test_cases)

        result = self.engine.submit_code_assessment('python', 'print("hello")', 'q_hello')

        self.assertIsNot(result.get('configurationError'), True)
        self.assertIsInstance(result.get('score'), (int, float))
        self.assertEqual(result.get('total'), 1)

    def test_result_includes_scoring_authority(self):
        """All result payloads must include scoring_authority='client_provisional'."""
        self.create_sample_question('q_hello')
        # Test with hidden tests missing
        result_missing = self.engine.submit_code_assessment('python', 'print("hi")', 'q_hello')
        self.assertEqual(result_missing.get('scoring_authority'), 'client_provisional')

        # Test with valid hidden tests
        test_cases = [{'input': '', 'expected': 'hello\n'}]
        self.engine.save_hidden_tests_raw('q_hello', test_cases)
        result_valid = self.engine.submit_code_assessment('python', 'print("hello")', 'q_hello')
        self.assertEqual(result_valid.get('scoring_authority'), 'client_provisional')

    def test_hidden_test_cases_not_exposed_in_result(self):
        """Hidden test case inputs/expected values must NOT appear in the result."""
        self.create_sample_question('q_hello')
        secret_input    = 'secret_1234'
        secret_expected = 'secret_output_xyz'
        test_cases      = [{'input': secret_input, 'expected': secret_expected}]
        self.engine.save_hidden_tests_raw('q_hello', test_cases)

        result = self.engine.submit_code_assessment('python', 'print("hello")', 'q_hello')

        result_str = json.dumps(result)
        self.assertNotIn(secret_input, result_str, "Hidden test input was exposed in the result!")
        self.assertNotIn(secret_expected, result_str, "Hidden test expected output was exposed in the result!")


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Encoding round-trip
# ═══════════════════════════════════════════════════════════════════════════════

class TestEncodingRoundTrip(BaseEngineTest):
    def test_encode_decode_round_trip(self):
        """Encoded data must decode back to original."""
        original = json.dumps([{'input': 'a', 'expected': 'b'}])
        encoded  = self.engine._encode_local_cache(original)
        decoded  = self.engine._decode_local_cache(encoded)
        self.assertEqual(decoded, original)

    def test_decode_returns_none_on_garbage(self):
        """Decoding garbage should return None, not raise."""
        result = self.engine._decode_local_cache('!!not-base64!!')
        self.assertIsNone(result, f"Expected None for garbage input, got: {result!r}")

    def test_encoding_is_not_plaintext(self):
        """Encoded data must not be the same as input (even a basic check)."""
        original = 'test_plaintext_value'
        encoded  = self.engine._encode_local_cache(original)
        self.assertNotEqual(encoded, original, "Encoded output is identical to input.")


# ═══════════════════════════════════════════════════════════════════════════════
# 4. get_student_id — UID preference
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetStudentId(BaseEngineTest):
    def test_returns_uid_when_present(self):
        """Firebase Auth UID should be preferred over email for student identification."""
        self.engine.current_student = {'uid': 'firebase_uid_001', 'email': 'student@test.com'}
        self.assertEqual(self.engine.get_student_id(), 'firebase_uid_001')

    def test_falls_back_to_email_when_no_uid(self):
        """Email fallback is acceptable when UID is absent."""
        self.engine.current_student = {'email': 'student@test.com'}
        sid = self.engine.get_student_id()
        self.assertIn('student', sid)
        self.assertIn('test', sid)

    def test_returns_guest_when_no_session(self):
        self.engine.current_student = None
        self.assertEqual(self.engine.get_student_id(), 'guest')

    def test_uid_sanitized_for_filename(self):
        """UID used as filename must not contain path separators."""
        self.engine.current_student = {'uid': 'uid/with/slashes'}
        sid = self.engine.get_student_id()
        self.assertNotIn('/', sid)
        self.assertNotIn('\\', sid)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. run_code_against_samples — labeled as sample/preview only
# ═══════════════════════════════════════════════════════════════════════════════

class TestRunCodeAgainstSamples(BaseEngineTest):
    def test_results_marked_as_sample_tests(self):
        """Sample test results must be marked isSampleTest=True to prevent misuse."""
        self.create_sample_question('q_hello')
        results = self.engine.run_code_against_samples('python', 'print("hello")', 'q_hello')
        self.assertIsInstance(results, list)
        for r in results:
            self.assertTrue(r.get('isSampleTest'), f"Sample test result not marked isSampleTest=True: {r}")

    def test_missing_question_returns_config_error(self):
        """Missing question file must return a configurationError, not crash."""
        result = self.engine.run_code_against_samples('python', 'print("hi")', 'nonexistent_q')
        self.assertIsInstance(result, dict)
        self.assertTrue(result.get('configurationError'))


if __name__ == '__main__':
    unittest.main()

