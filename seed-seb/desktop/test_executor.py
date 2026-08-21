import os
import sys
import unittest

# Ensure the desktop path is in import scope
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from executor import code_executor
from runtime_manager import runtime_manager

class TestCodeExecutor(unittest.TestCase):
    def test_python_success(self):
        print("Testing Python success...")
        code = "print('Hello, World!')"
        res = code_executor.execute("python", code, time_limit=2.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertEqual(res["stdout"].strip(), "Hello, World!")
        print("Python success verified.")

    def test_python_timeout(self):
        print("Testing Python infinite loop safety...")
        code = "import time\nwhile True:\n    time.sleep(0.1)"
        res = code_executor.execute("python", code, time_limit=1.0)
        self.assertEqual(res["error"], "Time Limit Exceeded (TLE)")
        self.assertEqual(res["exit_code"], -9)
        print("Python infinite loop safety verified (TLE caught).")

    def test_python_compile_error(self):
        print("Testing Python syntax error capturing...")
        code = "print('Hello, World!'  # Missing parenthesis"
        res = code_executor.execute("python", code, time_limit=2.0)
        self.assertNotEqual(res["exit_code"], 0)
        self.assertTrue(len(res["stderr"]) > 0 or res["error"] is not None)
        print("Python syntax error capturing verified.")

    def test_c_success(self):
        # Only run if gcc is available
        if not os.path.exists(runtime_manager.get_binary_path("gcc")):
            self.skipTest("Local gcc not found; skipping C test.")
            
        print("Testing C compilation & execution...")
        code = """
        #include <stdio.h>
        int main() {
            int a, b;
            if (scanf("%d %d", &a, &b) == 2) {
                printf("%d\\n", a + b);
            }
            return 0;
        }
        """
        res = code_executor.execute("c", code, stdin="12 23", time_limit=2.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertEqual(res["stdout"].strip(), "35")
        print("C compilation & execution verified.")

    def test_cpp_success(self):
        if not os.path.exists(runtime_manager.get_binary_path("g++")):
            self.skipTest("Local g++ not found; skipping C++ test.")
            
        print("Testing C++ compilation & execution...")
        code = """
        #include <iostream>
        using namespace std;
        int main() {
            int a, b;
            if (cin >> a >> b) {
                cout << (a * b) << endl;
            }
            return 0;
        }
        """
        res = code_executor.execute("cpp", code, stdin="5 6", time_limit=2.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertEqual(res["stdout"].strip(), "30")
        print("C++ compilation & execution verified.")

    def test_java_success(self):
        if not os.path.exists(runtime_manager.get_binary_path("javac")) or not os.path.exists(runtime_manager.get_binary_path("java")):
            self.skipTest("Local java/javac not found; skipping Java test.")
            
        print("Testing Java compilation & execution...")
        code = """
        import java.util.Scanner;
        public class Main {
            public static void main(String[] args) {
                Scanner sc = new Scanner(System.in);
                if (sc.hasNext()) {
                    System.out.println("Hello, " + sc.next());
                }
            }
        }
        """
        res = code_executor.execute("java", code, stdin="Student", time_limit=3.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertEqual(res["stdout"].strip(), "Hello, Student")
    def test_cpp_alias(self):
        if not os.path.exists(runtime_manager.get_binary_path("g++")):
            self.skipTest("Local g++ not found; skipping C++ alias test.")
        code = '#include <iostream>\nint main() { std::cout << "OK"; return 0; }'
        res = code_executor.execute("c++", code, time_limit=2.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["stdout"].strip(), "OK")

    def test_javascript_success(self):
        code = "const fs = require('fs'); const input = fs.readFileSync(0, 'utf-8').trim(); console.log('JS:' + input);"
        res = code_executor.execute("javascript", code, stdin="world", time_limit=2.0)
        if res.get("error") == "JavaScript runtime not available":
            self.skipTest("Node.js not installed on system; skipping JS test.")
        self.assertIsNone(res["error"])
        self.assertEqual(res["stdout"].strip(), "JS:world")

    def test_python_network_blocked(self):
        print("Testing Python network sandbox block...")
        code = """
try:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    print("UNEXPECTED_NETWORK_OPEN")
except PermissionError as e:
    print("NETWORK_BLOCKED_OK")
except Exception as e:
    print("NETWORK_ERROR_OK")
"""
        res = code_executor.execute("python", code, time_limit=2.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertIn("NETWORK_BLOCKED_OK", res["stdout"])
        print("Python network sandbox block verified.")

    def test_output_bomb_truncation(self):
        print("Testing Output Bomb truncation...")
        code = "print('A' * 2000000)"
        res = code_executor.execute("python", code, time_limit=2.0)
        self.assertIn("[Output Truncated: Exceeded 1MB limit]", res["stdout"])
        self.assertLessEqual(len(res["stdout"]), 1024 * 1024 + 200)
        print("Output Bomb truncation verified.")

    def test_env_secret_stripping(self):
        print("Testing Environment Secret Stripping...")
        os.environ["FIREBASE_SECRET_KEY"] = "super_secret_token"
        os.environ["VITE_INTERNAL_URL"] = "http://internal-cluster"
        code = """
import os
print("FIREBASE_IN_ENV:", "FIREBASE_SECRET_KEY" in os.environ)
print("VITE_IN_ENV:", "VITE_INTERNAL_URL" in os.environ)
"""
        res = code_executor.execute("python", code, time_limit=2.0)
        self.assertIn("FIREBASE_IN_ENV: False", res["stdout"])
        self.assertIn("VITE_IN_ENV: False", res["stdout"])
        print("Environment Secret Stripping verified.")

    def test_python_reload_socket_bypass_fails(self):
        print("Testing Python importlib.reload(socket) bypass prevention...")
        code = """
try:
    import importlib
    import socket
    importlib.reload(socket)
    s = socket.socket()
    s.connect(("8.8.8.8", 53))
    print("UNEXPECTED_BYPASS_SUCCESS")
except PermissionError as e:
    print("AUDIT_HOOK_BLOCKED_OK")
except Exception as e:
    print("RELOAD_FAILED_OK")
"""
        res = code_executor.execute("python", code, time_limit=2.0)
        self.assertNotIn("UNEXPECTED_BYPASS_SUCCESS", res["stdout"])
        print("Python importlib.reload bypass prevention verified.")

    def test_python_subprocess_spawn_fails(self):
        print("Testing Python subprocess spawning prevention...")
        code = """
try:
    import subprocess
    p = subprocess.Popen(["cmd.exe"])
    print("UNEXPECTED_SUBPROCESS_SPAWNED")
except PermissionError as e:
    print("SUBPROCESS_BLOCKED_OK")
except Exception as e:
    print("SPAWN_PREVENTED_OK")
"""
        res = code_executor.execute("python", code, time_limit=2.0)
        self.assertNotIn("UNEXPECTED_SUBPROCESS_SPAWNED", res["stdout"])
        print("Python subprocess spawning prevention verified.")

    def test_javascript_subprocess_spawn_fails(self):
        print("Testing JavaScript child_process spawning prevention...")
        code = """
try:
    const cp = require('child_process');
    cp.spawn('cmd.exe');
    console.log('UNEXPECTED_JS_SPAWN');
} catch(e) {
    console.log('JS_SUBPROCESS_BLOCKED_OK');
}
"""
        res = code_executor.execute("javascript", code, time_limit=2.0)
        if res.get("error") == "JavaScript runtime not available":
            self.skipTest("Node.js not installed; skipping.")
        self.assertNotIn("UNEXPECTED_JS_SPAWN", res["stdout"])
        print("JavaScript child_process spawning prevention verified.")

    def test_disk_quota_file_count_enforcement(self):
        print("Testing File Count Quota enforcement...")
        # Attempt to create 150 files to trigger file count quota (> 100 files limit)
        code = """
for i in range(150):
    try:
        with open(f"test_file_{i}.txt", "w") as f:
            f.write("data")
    except Exception:
        pass
print("FILES_CREATED")
"""
        res = code_executor.execute("python", code, time_limit=3.0)
        self.assertIn("File Count Quota Exceeded", str(res.get("error", "")))
        print("File Count Quota enforcement verified.")

if __name__ == "__main__":
    unittest.main()


