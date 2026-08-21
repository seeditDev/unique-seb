import os
import sys
import json
import time
import base64
import re
import requests
from executor import code_executor
from runtime_manager import runtime_manager

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False

# Firebase Configuration for Firestore Key Retrieval
FIREBASE_CONFIG = {
    "apiKey": "AIzaSyANO2d-RUXV0x5fvTjRT1UkpssP-T_Qz1Q",
    "projectId": "daily-tracker-a4092",
}


class AssessmentEngine:
    def __init__(self):
        self.app_root = runtime_manager.app_root
        self.questions_dir = os.path.join(self.app_root, "data", "questions")
        self.student_dir = os.path.join(self.app_root, "data", "student")

        os.makedirs(self.questions_dir, exist_ok=True)
        os.makedirs(os.path.join(self.questions_dir, "hidden"), exist_ok=True)
        os.makedirs(self.student_dir, exist_ok=True)

        # Persistent user profile & daily activity cache directory (adjacent to runtimes)
        runtimes_base = os.path.dirname(runtime_manager.runtimes_dir) if hasattr(runtime_manager, 'runtimes_dir') else self.app_root
        self.user_profile_dir = os.path.join(runtimes_base, "user_profile")
        os.makedirs(self.user_profile_dir, exist_ok=True)

        # Holds active student auth_data dict and active contest keys in RAM
        self.current_student = None
        self._active_keys = {}  # {contest_id: bytes_key}
        self._active_contest_id = None

    def set_student_session(self, auth_data):
        """Sets the active student profile session.

        auth_data must originate from Firebase Auth (validated server-side).
        This engine uses it only for file-path scoping - it is NOT a security
        authority. Firestore rules enforce access control server-side.
        """
        if isinstance(auth_data, str):
            try:
                self.current_student = json.loads(auth_data)
            except Exception:
                self.current_student = {"Email": auth_data, "Name": auth_data}
        else:
            self.current_student = auth_data
        print(f"[AssessmentEngine] Active session set for uid: {self.current_student.get('uid') if self.current_student else 'Guest'}")

    def set_contest_context(self, contest_id, key_hex=""):
        """Registers active contest ID and optional in-memory decryption key."""
        self._active_contest_id = contest_id
        if key_hex:
            try:
                self._active_keys[contest_id] = bytes.fromhex(key_hex)
                print(f"[AssessmentEngine] Registered in-memory decryption key for contest: {contest_id}")
            except Exception as e:
                print(f"[AssessmentEngine] Error parsing hex key for contest {contest_id}: {e}")

    def fetch_contest_key_from_firestore(self, contest_id):
        """Fetches dynamic AES-256 decryption key from Firestore assessment_keys/{contest_id}."""
        if not contest_id:
            return None
        if contest_id in self._active_keys:
            return self._active_keys[contest_id]

        url = (
            f"https://firestore.googleapis.com/v1/projects/{FIREBASE_CONFIG['projectId']}/databases/(default)/"
            f"documents/assessment_keys/{contest_id}"
        )
        params = {"key": FIREBASE_CONFIG["apiKey"]}
        try:
            resp = requests.get(url, params=params, timeout=6)
            if resp.status_code == 200:
                doc = resp.json()
                fields = doc.get("fields", {})
                raw_key = fields.get("encryptionKey", {}).get("stringValue", "") or fields.get("key", {}).get("stringValue", "")
                if raw_key:
                    key_bytes = bytes.fromhex(raw_key) if len(raw_key) == 64 else raw_key.encode('utf-8').ljust(32, b'0')[:32]
                    self._active_keys[contest_id] = key_bytes
                    print(f"[AssessmentEngine] Successfully fetched dynamic AES key for contest: {contest_id}")
                    return key_bytes
            else:
                print(f"[AssessmentEngine] Notice: No remote key doc in assessment_keys/{contest_id} (status: {resp.status_code})")
        except Exception as e:
            print(f"[AssessmentEngine] Warning: Could not fetch remote contest key for {contest_id}: {e}")
        return None

    def get_student_id(self):
        """Returns normalized, path-safe student file identifier.

        Priority: Firebase Auth UID > sanitised email.
        The UID is preferred because it is stable and unique.
        Strictly sanitizes against path traversal characters.
        """
        raw_id = "guest"
        if self.current_student:
            uid = self.current_student.get("uid")
            if uid:
                raw_id = str(uid)
            else:
                email = self.current_student.get("Email", "")
                if email:
                    raw_id = str(email)
        # Strict alphanumeric + hyphen + underscore only (prevents traversal)
        sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', raw_id)
        return sanitized or "guest"

    def cleanup_student_session_data(self, student_id=None):
        """Deletes ephemeral student progress/answer files from disk upon exit/completion."""
        target_id = student_id or self.get_student_id()
        if not os.path.exists(self.student_dir):
            return
        try:
            for fname in os.listdir(self.student_dir):
                if fname.endswith((".json", ".tmp")) and (target_id == "all" or fname.startswith(f"{target_id}_")):
                    fpath = os.path.join(self.student_dir, fname)
                    try:
                        os.remove(fpath)
                        print(f"[AssessmentEngine] Cleaned ephemeral student file: {fname}")
                    except Exception as e:
                        print(f"[AssessmentEngine] Could not delete {fname}: {e}")
        except Exception as err:
            print(f"[AssessmentEngine] Cleanup error: {err}")

    def get_user_profile_dir(self, uid=None):
        """Returns the user-specific profile cache directory (keyed by UID)."""
        target_uid = uid or self.get_student_id()
        sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', str(target_uid or "guest"))
        user_dir = os.path.join(self.user_profile_dir, sanitized)
        os.makedirs(user_dir, exist_ok=True)
        return user_dir

    def save_user_profile_cache(self, uid, data_type, json_data):
        """Saves cached daily activity or profile data for a specific UID."""
        try:
            user_dir = self.get_user_profile_dir(uid)
            clean_type = re.sub(r'[^a-zA-Z0-9_-]', '_', str(data_type or "daily_activity"))
            fpath = os.path.join(user_dir, f"{clean_type}.json")
            parsed = json.loads(json_data) if isinstance(json_data, str) else json_data
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(parsed, f, indent=2)
            return True
        except Exception as e:
            print(f"[AssessmentEngine] Error saving user_profile cache for {uid}: {e}")
            return False

    def load_user_profile_cache(self, uid, data_type):
        """Loads cached daily activity or profile data for a specific UID."""
        try:
            user_dir = self.get_user_profile_dir(uid)
            clean_type = re.sub(r'[^a-zA-Z0-9_-]', '_', str(data_type or "daily_activity"))
            fpath = os.path.join(user_dir, f"{clean_type}.json")
            if os.path.exists(fpath):
                with open(fpath, "r", encoding="utf-8") as f:
                    return f.read()
            return ""
        except Exception as e:
            print(f"[AssessmentEngine] Error loading user_profile cache for {uid}: {e}")
            return ""

    # ── Dynamic AES-256 & Local Cache Decryption ──────────────────────────────
    def _encode_local_cache(self, data_str, key_hex=None):
        """Encodes test data using AES-256-GCM if key provided, with fallback to XOR."""
        if HAS_CRYPTOGRAPHY and key_hex:
            try:
                key_bytes = bytes.fromhex(key_hex) if len(key_hex) == 64 else key_hex.encode('utf-8').ljust(32, b'0')[:32]
                iv = os.urandom(12)
                aesgcm = AESGCM(key_bytes)
                ct = aesgcm.encrypt(iv, data_str.encode('utf-8'), None)
                payload = {
                    "algorithm": "AES-256-GCM",
                    "iv": iv.hex(),
                    "ciphertext": ct.hex()
                }
                return json.dumps(payload)
            except Exception as e:
                print(f"[AssessmentEngine] AES encryption error: {e}")

        key = "KITE_SECURE_KEY_2026"
        xored = "".join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(data_str))
        return base64.b64encode(xored.encode("utf-8")).decode("utf-8")

    def _decode_local_cache(self, encoded_str, question_id=None, contest_id=None):
        """Decodes test data in memory using AES-256-GCM or XOR."""
        # 1. Try parsing as AES-256-GCM JSON envelope
        if HAS_CRYPTOGRAPHY and encoded_str.startswith("{"):
            try:
                payload = json.loads(encoded_str)
                if isinstance(payload, dict) and payload.get("algorithm") == "AES-256-GCM":
                    iv = bytes.fromhex(payload["iv"])
                    ct = bytes.fromhex(payload["ciphertext"])
                    
                    target_contest = contest_id or self._active_contest_id
                    key = self._active_keys.get(target_contest) or self.fetch_contest_key_from_firestore(target_contest)
                    if not key:
                        # Default fallback key for standard offline question banks
                        key = b"KITE_SECURE_SEED_AES_KEY_2026_00"[:32]
                    
                    aesgcm = AESGCM(key)
                    decrypted_bytes = aesgcm.decrypt(iv, ct, None)
                    return decrypted_bytes.decode('utf-8')
            except Exception as e:
                print(f"[AssessmentEngine] Notice: AES decode failed or invalid key: {e}")

        # 2. XOR legacy / standard fallback
        try:
            key = "KITE_SECURE_KEY_2026"
            decoded = base64.b64decode(encoded_str.encode("utf-8")).decode("utf-8")
            xored = "".join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(decoded))
            return xored
        except Exception as e:
            print(f"[AssessmentEngine] Error decoding local cache for hidden tests: {e}")
            return None

    def load_question(self, question_id):
        """Loads and returns public question details (excluding hidden test cases)."""
        file_path = os.path.join(self.questions_dir, f"{question_id}.json")
        if not os.path.exists(file_path):
            print(f"[AssessmentEngine] Question file not found: {question_id}")
            return None  # Do not return a mock template — missing question = configuration error

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AssessmentEngine] Error loading question {question_id}: {e}")
            return None

    def load_hidden_tests(self, question_id):
        """Loads and decodes hidden test cases for official scoring evaluation.

        Returns:
            list  — decoded test cases on success (may be empty list if file has no tests)
            None  — if the file is missing or decode fails (CONFIGURATION ERROR)

        CRITICAL: Returns None (not []) when the hidden test file is missing.
        Callers MUST treat None as a configuration error and MUST NOT fall back
        to sample tests for official scoring.
        """
        file_path = os.path.join(self.questions_dir, "hidden", f"{question_id}_hidden.json")

        if not os.path.exists(file_path):
            print(f"[AssessmentEngine] CONFIGURATION ERROR: Hidden test cases file not found for question '{question_id}'. "
                  f"Expected: {file_path}. "
                  f"Assessment cannot be officially scored without hidden tests.")
            return None  # FAIL CLOSED — never fall back to sample tests

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read().strip()

            decoded_str = self._decode_local_cache(content)
            if decoded_str is None:
                print(f"[AssessmentEngine] CONFIGURATION ERROR: Could not decode hidden test cache for '{question_id}'. "
                      f"File may be corrupt or created with a different key.")
                return None  # FAIL CLOSED

            test_cases = json.loads(decoded_str)
            if not isinstance(test_cases, list):
                print(f"[AssessmentEngine] CONFIGURATION ERROR: Hidden tests for '{question_id}' are not a list.")
                return None  # FAIL CLOSED

            return test_cases

        except json.JSONDecodeError as e:
            print(f"[AssessmentEngine] CONFIGURATION ERROR: Hidden test JSON parse failed for '{question_id}': {e}")
            return None  # FAIL CLOSED
        except Exception as e:
            print(f"[AssessmentEngine] CONFIGURATION ERROR: Unexpected error loading hidden tests for '{question_id}': {e}")
            return None  # FAIL CLOSED

    def save_hidden_tests_raw(self, question_id, test_cases_list):
        """Helper to create and write locally-encoded hidden test cases."""
        file_path = os.path.join(self.questions_dir, "hidden", f"{question_id}_hidden.json")
        json_str = json.dumps(test_cases_list)
        encoded_str = self._encode_local_cache(json_str)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(encoded_str)
        print(f"[AssessmentEngine] Wrote locally-encoded hidden test cases for: {question_id}")

    def run_code_against_samples(self, language, code, question_id):
        """Runs the student's code against the public SAMPLE test cases
        PLUS the first 6 HIDDEN test cases (without leaking hidden input/expected).
        """
        question = self.load_question(question_id)
        if not question:
            return {"error": "Question not found", "configurationError": True}

        sample_tests = question.get("sampleTests", [])
        time_limit = question.get("timeLimit", 2.0)

        results = []

        # 1. Run all sample test cases (full input/expected/actual visibility)
        for index, test in enumerate(sample_tests):
            stdin = test.get("input", "")
            expected = test.get("expected", "")

            exec_res = code_executor.execute(language, code, stdin=stdin, time_limit=time_limit)
            passed = exec_res["stdout"].strip() == expected.strip() and not exec_res["error"]

            results.append({
                "caseNumber":    index + 1,
                "input":         stdin,
                "expected":      expected,
                "actual":        exec_res["stdout"],
                "stderr":        exec_res["stderr"],
                "passed":        passed,
                "executionTime": exec_res["execution_time"],
                "error":         exec_res["error"],
                "isSampleTest":  True,  # Mark sample test cases
            })

        # 2. Run first 6 hidden test cases (inputs/expected outputs remain hidden)
        try:
            hidden_tests = self.load_hidden_tests(question_id)
            if hidden_tests and isinstance(hidden_tests, list):
                first_6_hidden = hidden_tests[:6]
                for h_idx, test in enumerate(first_6_hidden):
                    stdin = test.get("input", "")
                    expected = test.get("expected", "")

                    exec_res = code_executor.execute(language, code, stdin=stdin, time_limit=time_limit)
                    passed = exec_res["stdout"].strip() == expected.strip() and not exec_res["error"]

                    results.append({
                        "caseNumber":    len(sample_tests) + h_idx + 1,
                        "input":         "[Hidden Test Case]",
                        "expected":      "[Hidden Output]",
                        "actual":        "[Hidden Output]" if not exec_res["error"] else (exec_res["error"] or "[Error]"),
                        "stderr":        exec_res["stderr"],
                        "passed":        passed,
                        "executionTime": exec_res["execution_time"],
                        "error":         exec_res["error"],
                        "isSampleTest":  False,
                        "isHiddenTest":  True,
                        "hiddenIndex":   h_idx + 1,
                    })
        except Exception as e:
            print(f"[AssessmentEngine] Notice: could not load hidden tests for preview execution: {e}")

        return results

    def submit_code_assessment(self, language, code, question_id):
        """Runs code against HIDDEN test cases for official scoring.

        FAIL-CLOSED BEHAVIOR:
        If hidden test cases are missing or cannot be decoded, this method
        returns a configuration error with score=0.
        It NEVER falls back to sample tests for official scoring.
        Falling back to sample tests would allow students to know the exact
        inputs and game the scoring.

        SCORING AUTHORITY NOTICE:
        All scores produced here are 'client_provisional'. This means the score
        is computed locally on the student's machine and has NOT been verified
        by a trusted server-side pipeline. The 'scoring_authority' field in the
        returned payload reflects this limitation.
        """
        question = self.load_question(question_id)
        if not question:
            return {
                "error":             "Question not found",
                "configurationError": True,
                "score":             0,
                "passed":            0,
                "total":             0,
                "scoring_authority": "client_provisional",
            }

        # ── FAIL-CLOSED: Hidden tests are mandatory for official scoring ──────
        hidden_tests = self.load_hidden_tests(question_id)

        if hidden_tests is None:
            # load_hidden_tests already printed the configuration error.
            # Do NOT fall back to sample tests here.
            return {
                "error":             "HIDDEN_TESTS_MISSING",
                "configurationError": True,
                "score":             0,
                "passed":            0,
                "total":             0,
                "scoring_authority": "client_provisional",
                "message":           (
                    f"Assessment configuration error: hidden test cases are missing "
                    f"for question '{question_id}'. This assessment cannot be scored. "
                    f"Please contact the exam administrator."
                ),
            }

        if len(hidden_tests) == 0:
            print(f"[AssessmentEngine] WARNING: Hidden test file for '{question_id}' exists but contains zero test cases.")
            # Allow scoring with 0 tests — score will be 0/0 = 0.

        time_limit = question.get("timeLimit", 2.0)

        passed_count = 0
        total_time = 0.0
        results = []

        for index, test in enumerate(hidden_tests):
            stdin = test.get("input", "")
            expected = test.get("expected", "")

            exec_res = code_executor.execute(language, code, stdin=stdin, time_limit=time_limit)
            passed = exec_res["stdout"].strip() == expected.strip() and not exec_res["error"]

            if passed:
                passed_count += 1
            total_time += exec_res["execution_time"]

            results.append({
                "caseNumber":    index + 1,
                "passed":        passed,
                "executionTime": exec_res["execution_time"],
                "error":         exec_res["error"],
                # NOTE: Input/expected are NOT returned for hidden tests.
                # The student should not see the hidden test cases.
            })

        total_tests = len(hidden_tests)
        score = int((passed_count / total_tests) * 100) if total_tests > 0 else 0

        student_id = self.get_student_id()
        payload = {
            "studentId":        student_id,
            "questionId":       question_id,
            "language":         language,
            "score":            score,
            "passed":           passed_count,
            "total":            total_tests,
            "executionTime":    round(total_time, 3),
            # IMPORTANT: This score is computed on the client machine.
            # It has not been verified by a trusted server-side judge.
            # Do not present this as a final/verified result.
            "scoring_authority": "client_provisional",
        }

        # Save results locally (crash recovery / record)
        self.save_submission_record(payload)

        # Auto-save student progress state
        self.update_student_progress(question_id, score, status="completed" if score == 100 else "attempted")

        return {
            "score":             score,
            "passed":            passed_count,
            "total":             total_tests,
            "executionTime":     round(total_time, 3),
            "payload":           payload,
            "testCases":         results,
            "scoring_authority": "client_provisional",
        }

    def save_answer(self, question_id, answer):
        """Saves current editor code answer for a question to local disk.

        Local disk saves are recovery/cache only. They are never the official
        submission record.
        """
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_answers.json")

        data = {}
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                pass

        data[question_id] = {
            "answer":    answer,
            "timestamp": time.time(),
        }

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        print(f"[AssessmentEngine] Saved answer (local cache) for {question_id}")
        return True

    def load_answer(self, question_id):
        """Loads saved editor code answer for a question from local disk."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_answers.json")
        if not os.path.exists(file_path):
            return ""

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get(question_id, {}).get("answer", "")
        except Exception:
            return ""

    def save_submission_record(self, payload):
        """Saves a submission payload history record to local disk.

        Local disk records are recovery/audit logs only.
        The official submission is the Firestore write performed by the
        JavaScript layer (assessmentSessionService.js).
        """
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_submissions.json")

        records = []
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    records = json.load(f)
            except Exception:
                pass

        payload["timestamp"] = time.time()
        records.append(payload)

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=4)

    def update_student_progress(self, question_id, score, status):
        """Updates overall student assessment progress state file (local cache)."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_progress.json")

        progress = {
            "studentId":          student_id,
            "completedQuestions": {},
            "totalScore":         0,
            "lastUpdated":        time.time(),
        }

        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    progress = json.load(f)
            except Exception:
                pass

        prev_score = progress.get("completedQuestions", {}).get(question_id, {}).get("score", 0)
        progress["completedQuestions"][question_id] = {
            "score":     max(score, prev_score),
            "status":    status,
            "timestamp": time.time(),
        }

        # Calculate total score
        progress["totalScore"] = sum(
            item["score"] for item in progress["completedQuestions"].values()
        )
        progress["lastUpdated"] = time.time()

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, indent=4)

    def get_assessment_state(self):
        """Returns the full state of progress for the current logged-in student."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_progress.json")
        if not os.path.exists(file_path):
            return {
                "studentId":          student_id,
                "completedQuestions": {},
                "totalScore":         0,
                "lastUpdated":        time.time(),
            }

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}


# Singleton instance
assessment_engine = AssessmentEngine()
