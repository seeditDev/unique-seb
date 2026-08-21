import json
from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal
from assessment_engine import assessment_engine

class DesktopBridge(QObject):
    # Signals that can be emitted to React (useful for proctoring or updates)
    stateChanged = pyqtSignal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.engine = assessment_engine

    @pyqtSlot(str)
    def setStudentSession(self, auth_data_json):
        """Sets the logged-in student session state from the frontend."""
        try:
            auth_data = json.loads(auth_data_json)
            self.engine.set_student_session(auth_data)
        except Exception as e:
            print(f"[DesktopBridge] Error parsing student session: {e}")

    @pyqtSlot(str, str, result=bool)
    def setContestContext(self, contest_id, key_hex=""):
        """Registers active contest ID and optional in-memory decryption key."""
        try:
            self.engine.set_contest_context(contest_id, key_hex)
            return True
        except Exception as e:
            print(f"[DesktopBridge] Error setting contest context: {e}")
            return False

    @pyqtSlot(str, str, result=bool)
    def setContestKey(self, contest_id, key_hex):
        """Registers in-memory AES decryption key for an assessment."""
        try:
            self.engine.set_contest_context(contest_id, key_hex)
            return True
        except Exception as e:
            print(f"[DesktopBridge] Error registering contest key: {e}")
            return False

    @pyqtSlot(str, str, str, result=str)
    def runCode(self, language, code, stdin):
        """
        Executes code against sample test cases.
        Returns a JSON-serialized list of test case results.
        """
        # For temporary sandbox execution (not linked to assessment questions), 
        # run directly or match hello_world as fallback if no questionId is supplied.
        # We assume the default sandbox is hello_world or custom questions.
        # If questionId isn't specified, let's run simple code sandbox execution.
        try:
            print(f"[DesktopBridge] runCode called for {language}")
            # If code is for a specific question, run it against samples.
            # Default to checking if a question context is passed, or just running with stdin.
            # We parse stdin as JSON containing {stdin, questionId} or just string.
            question_id = "hello_world" # Default fallback
            
            # Let's inspect stdin to see if it contains question metadata
            try:
                meta = json.loads(stdin)
                if isinstance(meta, dict) and "questionId" in meta:
                    question_id = meta["questionId"]
                    stdin = meta.get("stdin", "")
            except Exception:
                pass
                
            results = self.engine.run_code_against_samples(language, code, question_id)
            return json.dumps(results)
        except Exception as e:
            print(f"[DesktopBridge] Error in runCode: {e}")
            return json.dumps([{"error": f"Internal runner error: {str(e)}", "passed": False}])

    @pyqtSlot(str, str, str, result=str)
    def submitCode(self, language, code, question_id):
        """
        Executes code against hidden test cases.
        Calculates score and stores results.
        """
        try:
            print(f"[DesktopBridge] submitCode called for {question_id} in {language}")
            result = self.engine.submit_code_assessment(language, code, question_id)
            return json.dumps(result)
        except Exception as e:
            print(f"[DesktopBridge] Error in submitCode: {e}")
            return json.dumps({"error": f"Internal submission error: {str(e)}", "score": 0, "passed": 0})

    @pyqtSlot(str, result=str)
    def getQuestion(self, question_id):
        """Fetches question data (excluding hidden test cases)."""
        try:
            print(f"[DesktopBridge] getQuestion called for {question_id}")
            question = self.engine.load_question(question_id)
            return json.dumps(question)
        except Exception as e:
            print(f"[DesktopBridge] Error in getQuestion: {e}")
            return json.dumps({"error": str(e)})

    @pyqtSlot(str, str, result=bool)
    def saveAnswer(self, question_id, answer):
        """Saves current student work for a question."""
        try:
            return self.engine.save_answer(question_id, answer)
        except Exception as e:
            print(f"[DesktopBridge] Error in saveAnswer: {e}")
            return False

    @pyqtSlot(str, result=str)
    def loadAnswer(self, question_id):
        """Loads saved student work for a question."""
        try:
            return self.engine.load_answer(question_id)
        except Exception as e:
            print(f"[DesktopBridge] Error in loadAnswer: {e}")
            return ""

    @pyqtSlot(result=str)
    def getAssessmentState(self):
        """Retrieves overall progress statistics for the active student."""
        try:
            state = self.engine.get_assessment_state()
            return json.dumps(state)
        except Exception as e:
            print(f"[DesktopBridge] Error in getAssessmentState: {e}")
            return "{}"
            
    @pyqtSlot(str, str, str, result=str)
    def runDirectSandbox(self, language, code, stdin):
        """Executes a single raw code execution (no questions involved)."""
        try:
            from executor import code_executor
            print(f"[DesktopBridge] runDirectSandbox called for {language}")
            res = code_executor.execute(language, code, stdin=stdin, time_limit=2.0)
            return json.dumps(res)
        except Exception as e:
            return json.dumps({"error": f"Failed sandbox run: {str(e)}"})

    @pyqtSlot(result=str)
    def getContests(self):
        """Fetches the list of active/scheduled contests from local storage."""
        file_path = os.path.join(self.engine.app_root, "data", "contests.json")
        if not os.path.exists(file_path):
            default_contests = [
                {
                    "id": "practice_contest",
                    "title": "SEED-IT Practice Contest",
                    "description": "General practice for C, C++, Java, and Python.",
                    "startTime": "2026-01-01T00:00:00Z",
                    "endTime": "2026-12-31T23:59:59Z",
                    "questions": ["hello_world", "add_numbers", "even_odd", "factorial", "binary_search"]
                }
            ]
            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(default_contests, f, indent=4)
            except Exception:
                pass
            return json.dumps(default_contests)
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return json.dumps([])

    @pyqtSlot(result=str)
    def getChallenges(self):
        """Fetches the list of all coding challenges from local storage."""
        file_path = os.path.join(self.engine.app_root, "data", "questions", "challenges.json")
        if not os.path.exists(file_path):
            default_challenges = [
                {
                    "id": "hello_world",
                    "title": "1. Hello, World!",
                    "difficulty": "Easy",
                    "description": "Write a program that outputs exactly \"Hello, World!\"",
                    "category": "Fundamentals"
                },
                {
                    "id": "add_numbers",
                    "title": "2. Sum of Two Integers",
                    "difficulty": "Easy",
                    "description": "Write a program that reads two integers and prints their sum.",
                    "category": "Fundamentals"
                },
                {
                    "id": "even_odd",
                    "title": "3. Even or Odd",
                    "difficulty": "Easy",
                    "description": "Determine if N is even or odd.",
                    "category": "Fundamentals"
                },
                {
                    "id": "factorial",
                    "title": "4. Factorial of N",
                    "difficulty": "Medium",
                    "description": "Calculate the factorial of a given integer N.",
                    "category": "Mathematics"
                },
                {
                    "id": "binary_search",
                    "title": "5. Binary Search",
                    "difficulty": "Medium",
                    "description": "Locate an element in a sorted list.",
                    "category": "Algorithms"
                }
            ]
            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(default_challenges, f, indent=4)
            except Exception:
                pass
            return json.dumps(default_challenges)
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return json.dumps([])

    @pyqtSlot(result=int)
    def getLocalModelPort(self):
        """Returns the local Model HTTP server port to the frontend."""
        try:
            if self.parent() and hasattr(self.parent(), 'model_server_port'):
                return self.parent().model_server_port or 0
        except Exception as e:
            print(f"[DesktopBridge] Error getting local model port: {e}")
        return 0

    @pyqtSlot()
    def endStudentSession(self):
        """Cleans up ephemeral local session files on exam completion or logout."""
        try:
            self.engine.cleanup_student_session_data()
        except Exception as e:
            print(f"[DesktopBridge] Error ending student session: {e}")

    @pyqtSlot(str, str, str, result=bool)
    def saveUserProfileCache(self, uid, data_type, json_data):
        """Persists user profile / daily activity JSON to disk under user_profile/{uid}/."""
        try:
            return self.engine.save_user_profile_cache(uid, data_type, json_data)
        except Exception as e:
            print(f"[DesktopBridge] Error in saveUserProfileCache: {e}")
            return False

    @pyqtSlot(str, str, result=str)
    def loadUserProfileCache(self, uid, data_type):
        """Loads persisted user profile / daily activity JSON from user_profile/{uid}/."""
        try:
            return self.engine.load_user_profile_cache(uid, data_type)
        except Exception as e:
            print(f"[DesktopBridge] Error in loadUserProfileCache: {e}")
            return ""

