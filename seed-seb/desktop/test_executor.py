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

    def test_c_socket_and_system_blocked(self):
        print("Testing Native C socket and system command blocking...")
        if not os.path.exists(runtime_manager.get_binary_path("gcc")):
            self.skipTest("GCC not found; skipping C security test.")
        code = """
#include <stdio.h>
int main() {
    int s = socket(2, 1, 0);
    int sys_res = system("cmd.exe");
    printf("SOCKET_RES:%d SYS_RES:%d", s, sys_res);
    return 0;
}
"""
        res = code_executor.execute("c", code, time_limit=3.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertIn("SOCKET_RES:-1 SYS_RES:-1", res["stdout"].strip())
        print("Native C socket and system command blocking verified.")

    def test_cpp_network_and_process_blocked(self):
        print("Testing Native C++ network and process blocking...")
        if not os.path.exists(runtime_manager.get_binary_path("g++")):
            self.skipTest("G++ not found; skipping C++ security test.")
        code = """
#include <iostream>
int main() {
    int c = connect(0, NULL, 0);
    int wsa = WSAStartup(0, NULL);
    std::cout << "CONNECT_RES:" << c << " WSA_RES:" << wsa;
    return 0;
}
"""
        res = code_executor.execute("c++", code, time_limit=3.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertIn("CONNECT_RES:-1 WSA_RES:1", res["stdout"].strip())
        print("Native C++ network and process blocking verified.")

    def test_runtime_integrity_manifest_verification(self):
        print("Testing Cryptographic Runtime Integrity Manifest...")
        # 1. Baseline verification against trusted Ed25519 signed manifest returns true
        ok, msg = runtime_manager.verify_runtime_integrity()
        self.assertTrue(ok)
        self.assertIn("verified", str(msg).lower())
        
        # 2. Tampered hash in manifest triggers verification failure
        manifest = runtime_manager.load_trusted_manifest() or {}
        tampered_manifest = {k: "0000000000000000000000000000000000000000000000000000000000000000" for k in manifest.keys()}
        ok_tampered, errors = runtime_manager.verify_runtime_integrity(tampered_manifest)
        self.assertFalse(ok_tampered)
        self.assertTrue(len(errors) > 0)

        # 3. Missing signature in manifest must fail closed
        unsigned_manifest = {"binaries": manifest}
        self.assertFalse(runtime_manager.verify_manifest_signature(unsigned_manifest, ""))

        # 4. Tampered Ed25519 signature must fail verification
        tampered_sig = "0" * 128
        self.assertFalse(runtime_manager.verify_manifest_signature(manifest, tampered_sig))
        print("Cryptographic Runtime Integrity Manifest & Ed25519 Attestation verified.")

    def test_java_filesystem_sandbox_blocked(self):
        print("Testing Java filesystem sandbox boundary enforcement...")
        if not os.path.exists(runtime_manager.get_binary_path("javac")):
            self.skipTest("JDK not found; skipping Java filesystem test.")
        code = """
import java.io.*;
import java.nio.file.*;
public class Main {
    public static void main(String[] args) {
        // 1. Reading outside sandbox must throw SecurityException / AccessControlException
        try {
            String win = Files.readString(Path.of("C:/Windows/win.ini"));
            System.out.println("UNEXPECTED_JAVA_FS_READ_OUTSIDE");
        } catch (SecurityException se) {
            System.out.println("JAVA_FS_BLOCKED_OK");
        } catch (Exception e) {
            System.out.println("JAVA_FS_BLOCKED_OK");
        }

        // 2. Reading/writing inside local run directory must succeed
        try {
            Files.writeString(Path.of("local_test.txt"), "sandboxed_data");
            String readBack = Files.readString(Path.of("local_test.txt"));
            if ("sandboxed_data".equals(readBack)) {
                System.out.println("JAVA_LOCAL_FS_OK");
            }
        } catch (Exception e) {
            System.out.println("JAVA_LOCAL_FS_FAILED");
        }
    }
}
"""
        res = code_executor.execute("java", code, time_limit=3.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertNotIn("UNEXPECTED_JAVA_FS_READ_OUTSIDE", res["stdout"])
        self.assertIn("JAVA_FS_BLOCKED_OK", res["stdout"])
        self.assertIn("JAVA_LOCAL_FS_OK", res["stdout"])
        print("Java filesystem sandbox boundary enforcement verified.")

    def test_java_network_blocked(self):
        print("Testing Java network socket blocking...")
        if not os.path.exists(runtime_manager.get_binary_path("javac")):
            self.skipTest("JDK not found; skipping Java network test.")
        code = """
import java.net.*;
public class Main {
    public static void main(String[] args) {
        try {
            Socket s = new Socket();
            s.connect(new InetSocketAddress("8.8.8.8", 53), 500);
            System.out.println("UNEXPECTED_JAVA_NET_OPEN");
        } catch (Exception e) {
            System.out.println("JAVA_NET_BLOCKED_OK");
        }
    }
}
"""
        res = code_executor.execute("java", code, time_limit=3.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertIn("JAVA_NET_BLOCKED_OK", res["stdout"])
        print("Java network socket blocking verified.")

    def test_java_subprocess_blocked(self):
        print("Testing Java child process spawn defense...")
        if not os.path.exists(runtime_manager.get_binary_path("javac")):
            self.skipTest("JDK not found; skipping Java subprocess test.")
        code = """
public class Main {
    public static void main(String[] args) {
        try {
            Process p = Runtime.getRuntime().exec("cmd.exe");
            p.destroyForcibly();
            System.out.println("JAVA_SPAWN_ATTEMPTED");
        } catch (SecurityException se) {
            System.out.println("JAVA_SPAWN_BLOCKED_OK: " + se.getClass().getSimpleName());
        } catch (Exception e) {
            System.out.println("JAVA_SPAWN_BLOCKED_OK: " + e.getClass().getSimpleName());
        }
    }
}
"""
        res = code_executor.execute("java", code, time_limit=3.0)
        self.assertIsNone(res["error"])
        self.assertEqual(res["exit_code"], 0)
        self.assertNotIn("JAVA_SPAWN_ATTEMPTED", res["stdout"])
        self.assertIn("JAVA_SPAWN_BLOCKED_OK", res["stdout"])
        print("Java child process spawn defense verified.")

    def test_symlink_escape_detection(self):
        print("Testing Symlink/Junction Escape Detection...")
        code = """
import os
try:
    os.symlink("C:\\\\Windows", "escaped_link")
    print("SYMLINK_CREATED")
except Exception as e:
    print("SYMLINK_NOT_CREATED")
"""
        res = code_executor.execute("python", code, time_limit=3.0)
        # Either symlink creation is blocked by OS privilege or detected & aborted by sandbox check
        if "SYMLINK_CREATED" in res["stdout"]:
            self.assertTrue("Sandbox Security Violation" in str(res.get("error", "")) or res["exit_code"] != 0)
        print("Symlink/Junction Escape Detection verified.")

if __name__ == "__main__":
    unittest.main()




