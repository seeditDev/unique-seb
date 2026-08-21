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

    def test_path_sanitization_on_error(self):
        raw_error = r"C:\Program Files (x86)\SEED-SEB\temp_workspace\run_61b832fb-027c-4bd2\solution.c:10:5: error: expected ';'"
        clean = code_executor._sanitize_output(raw_error, r"C:\Program Files (x86)\SEED-SEB\temp_workspace\run_61b832fb-027c-4bd2")
        self.assertNotIn(r"C:\Program Files (x86)\SEED-SEB\temp_workspace\run_61b832fb-027c-4bd2", clean)
        self.assertTrue(clean.startswith("solution.c:10:5: error:"))

if __name__ == "__main__":
    unittest.main()
