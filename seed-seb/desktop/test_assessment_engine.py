"""
test_assessment_engine.py
Unit tests for SEED SEB assessment_engine.py

Run with:
    python -m pytest desktop/test_assessment_engine.py -v

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
import pytest
import tempfile

# ── Shims for missing desktop module dependencies ─────────────────────────────

# runtime_manager shim
class _RuntimeManager:
    def __init__(self, root):
        self.app_root = root

class _CodeExecutor:
    """Minimal code executor shim for tests."""
    def execute(self, language, code, stdin='', time_limit=2.0):
        return {
            'stdout': 'hello',
            'stderr': '',
            'error':  None,
            'execution_time': 0.01,
        }

# ── Path setup ────────────────────────────────────────────────────────────────

DESKTOP_DIR = os.path.join(os.path.dirname(__file__), '..', 'desktop')
sys.path.insert(0, os.path.abspath(DESKTOP_DIR))


@pytest.fixture
def engine(tmp_path):
    """Create an AssessmentEngine instance with a temporary data directory."""
    import importlib, types

    # Create mock runtime_manager and code_executor modules
    rm_mod = types.ModuleType('runtime_manager')
    rm_mod.runtime_manager = _RuntimeManager(str(tmp_path))
    sys.modules['runtime_manager'] = rm_mod

    ex_mod = types.ModuleType('executor')
    ex_mod.code_executor = _CodeExecutor()
    sys.modules['executor'] = ex_mod

    # Force re-import of assessment_engine with our mocks
    if 'assessment_engine' in sys.modules:
        del sys.modules['assessment_engine']
    import assessment_engine as ae_module
    engine = ae_module.AssessmentEngine()
    return engine


@pytest.fixture
def engine_with_question(engine, tmp_path):
    """Engine with a sample question file on disk."""
    question = {
        'id':          'q_hello',
        'title':       'Hello World',
        'statement':   'Print Hello World',
        'sampleTests': [{'input': '', 'expected': 'hello\n'}],
        'timeLimit':   2.0,
        'memoryLimit': 256,
    }
    q_path = os.path.join(str(tmp_path), 'data', 'questions', 'q_hello.json')
    os.makedirs(os.path.dirname(q_path), exist_ok=True)
    with open(q_path, 'w') as f:
        json.dump(question, f)
    return engine


# ═══════════════════════════════════════════════════════════════════════════════
# 1. load_hidden_tests — Fail-closed behavior
# ═══════════════════════════════════════════════════════════════════════════════

class TestLoadHiddenTests:
    def test_missing_file_returns_none(self, engine):
        """Missing hidden test file must return None, NOT an empty list."""
        result = engine.load_hidden_tests('nonexistent_question')
        assert result is None, (
            f"Expected None when hidden test file is missing, got: {result!r}. "
            "load_hidden_tests must fail closed."
        )

    def test_missing_file_does_not_return_empty_list(self, engine):
        """Explicitly assert that [] is not returned on missing file."""
        result = engine.load_hidden_tests('nonexistent_question')
        assert result != [], (
            "load_hidden_tests returned [] for a missing file. "
            "This is the 'fallback to sample tests' bug. Must return None."
        )

    def test_valid_file_returns_list(self, engine, tmp_path):
        """A correctly encoded file should return a list of test cases."""
        test_cases = [
            {'input': '1 2', 'expected': '3\n'},
            {'input': '5 5', 'expected': '10\n'},
        ]
        engine.save_hidden_tests_raw('q_valid', test_cases)
        result = engine.load_hidden_tests('q_valid')

        assert result is not None, "Expected list, got None for a valid hidden test file."
        assert isinstance(result, list), f"Expected list, got {type(result)}"
        assert len(result) == 2

    def test_corrupt_file_returns_none(self, engine, tmp_path):
        """A corrupt (un-decodable) hidden test file must return None."""
        hidden_dir = os.path.join(str(tmp_path), 'data', 'questions', 'hidden')
        os.makedirs(hidden_dir, exist_ok=True)
        corrupt_path = os.path.join(hidden_dir, 'q_corrupt_hidden.json')
        with open(corrupt_path, 'w') as f:
            f.write('this is not valid base64 or XOR encoded data !@#$')

        result = engine.load_hidden_tests('q_corrupt')
        assert result is None, (
            f"Expected None for corrupt hidden test file, got: {result!r}."
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 2. submit_code_assessment — Fail-closed behavior
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubmitCodeAssessment:
    def test_missing_hidden_tests_returns_config_error(self, engine_with_question):
        """When hidden tests are missing, submit must return configurationError, NOT sample test score."""
        result = engine_with_question.submit_code_assessment('python', 'print("hello")', 'q_hello')

        assert result.get('configurationError') is True, (
            f"Expected configurationError=True when hidden tests missing. Got: {result}"
        )
        assert result.get('score') == 0, (
            f"Expected score=0 when hidden tests missing. Got score={result.get('score')}"
        )
        assert result.get('error') == 'HIDDEN_TESTS_MISSING', (
            f"Expected error='HIDDEN_TESTS_MISSING'. Got: {result.get('error')!r}"
        )

    def test_missing_hidden_tests_does_not_use_sample_tests(self, engine_with_question):
        """Sample tests MUST NOT be used as a scoring fallback."""
        result = engine_with_question.submit_code_assessment('python', 'print("hello")', 'q_hello')

        # If sample fallback occurred, the executor would run and we'd get passed=1 or score>0
        assert result.get('score', 0) == 0, (
            "Score is non-zero with missing hidden tests. Sample test fallback is occurring — this is a security bug."
        )
        assert result.get('total', 0) == 0, (
            "Total tests is non-zero with missing hidden tests. Sample test fallback is occurring."
        )

    def test_with_hidden_tests_returns_score(self, engine_with_question, tmp_path):
        """When hidden tests are present, submission should return a numeric score."""
        test_cases = [{'input': '', 'expected': 'hello\n'}]
        engine_with_question.save_hidden_tests_raw('q_hello', test_cases)

        result = engine_with_question.submit_code_assessment('python', 'print("hello")', 'q_hello')

        assert result.get('configurationError') is not True
        assert isinstance(result.get('score'), int)
        assert result.get('total') == 1

    def test_result_includes_scoring_authority(self, engine_with_question, tmp_path):
        """All result payloads must include scoring_authority='client_provisional'."""
        # Test with hidden tests missing
        result_missing = engine_with_question.submit_code_assessment('python', 'print("hi")', 'q_hello')
        assert result_missing.get('scoring_authority') == 'client_provisional', (
            "scoring_authority='client_provisional' must be set even on error results."
        )

        # Test with valid hidden tests
        test_cases = [{'input': '', 'expected': 'hello\n'}]
        engine_with_question.save_hidden_tests_raw('q_hello', test_cases)
        result_valid = engine_with_question.submit_code_assessment('python', 'print("hello")', 'q_hello')
        assert result_valid.get('scoring_authority') == 'client_provisional', (
            "scoring_authority='client_provisional' must be set on all scoring results."
        )

    def test_hidden_test_cases_not_exposed_in_result(self, engine_with_question, tmp_path):
        """Hidden test case inputs/expected values must NOT appear in the result."""
        secret_input    = 'secret_1234'
        secret_expected = 'secret_output_xyz'
        test_cases      = [{'input': secret_input, 'expected': secret_expected}]
        engine_with_question.save_hidden_tests_raw('q_hello', test_cases)

        result = engine_with_question.submit_code_assessment('python', 'print("hello")', 'q_hello')

        result_str = json.dumps(result)
        assert secret_input not in result_str, "Hidden test input was exposed in the result!"
        assert secret_expected not in result_str, "Hidden test expected output was exposed in the result!"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Encoding round-trip
# ═══════════════════════════════════════════════════════════════════════════════

class TestEncodingRoundTrip:
    def test_encode_decode_round_trip(self, engine):
        """Encoded data must decode back to original."""
        original = json.dumps([{'input': 'a', 'expected': 'b'}])
        encoded  = engine._encode_local_cache(original)
        decoded  = engine._decode_local_cache(encoded)
        assert decoded == original

    def test_decode_returns_none_on_garbage(self, engine):
        """Decoding garbage should return None, not raise."""
        result = engine._decode_local_cache('!!not-base64!!')
        assert result is None, f"Expected None for garbage input, got: {result!r}"

    def test_encoding_is_not_plaintext(self, engine):
        """Encoded data must not be the same as input (even a basic check)."""
        original = 'test_plaintext_value'
        encoded  = engine._encode_local_cache(original)
        assert encoded != original, "Encoded output is identical to input — encoding not applied."


# ═══════════════════════════════════════════════════════════════════════════════
# 4. get_student_id — UID preference
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetStudentId:
    def test_returns_uid_when_present(self, engine):
        """Firebase Auth UID should be preferred over email for student identification."""
        engine.current_student = {'uid': 'firebase_uid_001', 'Email': 'student@test.com'}
        assert engine.get_student_id() == 'firebase_uid_001'

    def test_falls_back_to_email_when_no_uid(self, engine):
        """Email fallback is acceptable when UID is absent (legacy accounts)."""
        engine.current_student = {'Email': 'student@test.com'}
        sid = engine.get_student_id()
        assert 'student' in sid
        assert 'test' in sid

    def test_returns_guest_when_no_session(self, engine):
        engine.current_student = None
        assert engine.get_student_id() == 'guest'

    def test_uid_sanitized_for_filename(self, engine):
        """UID used as filename must not contain path separators."""
        engine.current_student = {'uid': 'uid/with/slashes'}
        sid = engine.get_student_id()
        assert '/' not in sid
        assert '\\' not in sid


# ═══════════════════════════════════════════════════════════════════════════════
# 5. run_code_against_samples — labeled as sample/preview only
# ═══════════════════════════════════════════════════════════════════════════════

class TestRunCodeAgainstSamples:
    def test_results_marked_as_sample_tests(self, engine_with_question):
        """Sample test results must be marked isSampleTest=True to prevent misuse."""
        results = engine_with_question.run_code_against_samples('python', 'print("hello")', 'q_hello')
        assert isinstance(results, list)
        for r in results:
            assert r.get('isSampleTest') is True, (
                f"Sample test result not marked isSampleTest=True: {r}"
            )

    def test_missing_question_returns_config_error(self, engine):
        """Missing question file must return a configurationError, not crash."""
        result = engine.run_code_against_samples('python', 'print("hi")', 'nonexistent_q')
        assert isinstance(result, dict)
        assert result.get('configurationError') is True
