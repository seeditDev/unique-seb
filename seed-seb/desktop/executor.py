import os
import sys
import uuid
import time
import shutil
import subprocess
import tempfile
from runtime_manager import runtime_manager

class CodeExecutor:
    def __init__(self):
        self.app_root = runtime_manager.app_root
        candidate_dir = os.path.join(self.app_root, "temp_workspace")
        try:
            os.makedirs(candidate_dir, exist_ok=True)
            test_file = os.path.join(candidate_dir, ".write_test")
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
            self.workspace_dir = candidate_dir
        except Exception:
            self.workspace_dir = os.path.join(tempfile.gettempdir(), "seed_seb_temp_workspace")
            os.makedirs(self.workspace_dir, exist_ok=True)

    def _create_temp_run_dir(self):
        """Creates a unique directory for the execution run to support concurrency and clean isolation."""
        run_id = str(uuid.uuid4())
        run_dir = os.path.join(self.workspace_dir, f"run_{run_id}")
        os.makedirs(run_dir, exist_ok=True)
        return run_dir

    def _cleanup_dir(self, run_dir):
        """Removes the temporary directory after execution."""
        try:
            shutil.rmtree(run_dir, ignore_errors=True)
        except Exception as e:
            print(f"[CodeExecutor] Error cleaning up run dir {run_dir}: {e}")

    def _sanitize_output(self, text, run_dir=None):
        """Sanitizes compilation and execution output so local compiler paths,
        temporary directories, and internal runtime paths are never exposed to students."""
        if not text:
            return ""

        sanitized = str(text)

        paths_to_strip = []
        if run_dir:
            paths_to_strip.extend([run_dir, run_dir.replace("\\", "/"), run_dir.replace("/", "\\")])

        if hasattr(self, "workspace_dir") and self.workspace_dir:
            paths_to_strip.extend([self.workspace_dir, self.workspace_dir.replace("\\", "/"), self.workspace_dir.replace("/", "\\")])

        if hasattr(runtime_manager, "runtimes_dir") and runtime_manager.runtimes_dir:
            paths_to_strip.extend([runtime_manager.runtimes_dir, runtime_manager.runtimes_dir.replace("\\", "/"), runtime_manager.runtimes_dir.replace("/", "\\")])

        if hasattr(runtime_manager, "app_root") and runtime_manager.app_root:
            paths_to_strip.extend([runtime_manager.app_root, runtime_manager.app_root.replace("\\", "/"), runtime_manager.app_root.replace("/", "\\")])

        temp_dir = tempfile.gettempdir()
        paths_to_strip.extend([temp_dir, temp_dir.replace("\\", "/"), temp_dir.replace("/", "\\")])

        # Sort paths by length descending so longer subpaths are replaced first
        paths_to_strip = sorted(list(set(filter(None, paths_to_strip))), key=len, reverse=True)

        for p in paths_to_strip:
            sanitized = sanitized.replace(p + "\\", "")
            sanitized = sanitized.replace(p + "/", "")
            sanitized = sanitized.replace(p, "")

        # Clean any leftover regex patterns for temp workspace run folders: e.g. [A-Z]:\.*run_[0-9a-f-]+\
        import re
        sanitized = re.sub(r'[a-zA-Z]:[\\/][^:\n\r]+[\\/](?=(?:solution|Main)\.)', '', sanitized)
        # Clean compiler internal header traces: e.g. In file included from .../runtimes/...
        sanitized = re.sub(r'In file included from [^:\n\r]+[\\/](?:mingw64|runtimes)[^:\n\r]*:\d+:\n?', '', sanitized)
        sanitized = re.sub(r'[a-zA-Z]:[\\/][^:\n\r]+[\\/](?:mingw64|runtimes)[^:\n\r]*[\\/]', '', sanitized)

        return sanitized.strip()

    def execute(self, language, code, stdin="", time_limit=2.0):
        """
        Executes code in a secure and isolated local workspace.
        
        Returns:
            dict: {
                "stdout": str,
                "stderr": str,
                "exit_code": int,
                "execution_time": float, # in seconds
                "error": str or None # Timeout, Compilation Error, etc.
            }
        """
        lang = str(language or "").strip().lower()
        run_dir = self._create_temp_run_dir()
        result = {
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "execution_time": 0.0,
            "error": None
        }

        try:
            if lang in ("python", "py", "python3"):
                result = self._execute_python(run_dir, code, stdin, time_limit)
            elif lang in ("c", "c_cpp"):
                result = self._execute_c(run_dir, code, stdin, time_limit)
            elif lang in ("cpp", "c++", "cplusplus"):
                result = self._execute_cpp(run_dir, code, stdin, time_limit)
            elif lang in ("java",):
                result = self._execute_java(run_dir, code, stdin, time_limit)
            elif lang in ("javascript", "js", "node", "nodejs"):
                result = self._execute_javascript(run_dir, code, stdin, time_limit)
            else:
                result["error"] = f"Unsupported language: {language}"
        except Exception as e:
            result["error"] = f"Execution system failure: {str(e)}"
        finally:
            self._cleanup_dir(run_dir)

        # Sanitize all output streams so local compiler paths are never exposed
        if result.get("stdout"):
            result["stdout"] = self._sanitize_output(result["stdout"], run_dir)
        if result.get("stderr"):
            result["stderr"] = self._sanitize_output(result["stderr"], run_dir)
        if result.get("error"):
            result["error"] = self._sanitize_output(result["error"], run_dir)

        return result

    def _get_run_env(self, binary_path):
        """Prepares environment variables by placing the binary directory at the front of the PATH."""
        env = os.environ.copy()
        if binary_path:
            bin_dir = os.path.dirname(os.path.abspath(binary_path))
            path_additions = [bin_dir]
            arch_bin = os.path.join(os.path.dirname(bin_dir), "x86_64-w64-mingw32", "bin")
            if os.path.exists(arch_bin):
                path_additions.append(arch_bin)
            env["PATH"] = os.pathsep.join(path_additions) + os.pathsep + env.get("PATH", "")
        # Clean PyInstaller / Nuitka environment variables to avoid runtime conflicts in child subprocesses
        for var in ["PYTHONHOME", "PYTHONPATH", "PYTHONIOENCODING"]:
            if var in env:
                del env[var]
        return env

    def _execute_javascript(self, run_dir, code, stdin, time_limit):
        file_path = os.path.join(run_dir, "solution.js")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)

        node_bin = runtime_manager.get_binary_path("node")
        if not node_bin or not os.path.exists(node_bin):
            return {
                "stdout": "",
                "stderr": "JavaScript (Node.js) runtime is not found in resources/runtimes/node.",
                "exit_code": -1,
                "execution_time": 0.0,
                "error": "JavaScript runtime not available"
            }

        cmd = [node_bin, "solution.js"]
        env = self._get_run_env(node_bin)
        return self._run_process(cmd, run_dir, stdin, time_limit, env=env)

    def _execute_python(self, run_dir, code, stdin, time_limit):
        file_path = os.path.join(run_dir, "solution.py")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        python_bin = runtime_manager.get_binary_path("python")
        cmd = [python_bin, "solution.py"]
        env = self._get_run_env(python_bin)
        
        return self._run_process(cmd, run_dir, stdin, time_limit, env=env)

    def _execute_c(self, run_dir, code, stdin, time_limit):
        source_path = os.path.join(run_dir, "solution.c")
        exe_path = os.path.join(run_dir, "solution.exe")
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        gcc_bin = runtime_manager.get_binary_path("gcc")
        compile_cmd = [gcc_bin, "-O2", "-o", exe_path, source_path]
        env = self._get_run_env(gcc_bin)
        
        # Hide command windows on Windows
        creationflags = 0x08000000 if sys.platform == "win32" else 0
        
        # Compile
        compile_res = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            cwd=run_dir,
            timeout=10.0, # Compile timeout
            env=env,
            creationflags=creationflags
        )
        
        if compile_res.returncode != 0:
            return {
                "stdout": "",
                "stderr": compile_res.stderr,
                "exit_code": compile_res.returncode,
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res.stderr}"
            }
            
        # Run
        return self._run_process([exe_path], run_dir, stdin, time_limit, env=env)

    def _execute_cpp(self, run_dir, code, stdin, time_limit):
        source_path = os.path.join(run_dir, "solution.cpp")
        exe_path = os.path.join(run_dir, "solution.exe")
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        gpp_bin = runtime_manager.get_binary_path("g++")
        compile_cmd = [gpp_bin, "-O2", "-std=c++17", "-o", exe_path, source_path]
        env = self._get_run_env(gpp_bin)
        
        # Hide command windows on Windows
        creationflags = 0x08000000 if sys.platform == "win32" else 0
        
        # Compile
        compile_res = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            cwd=run_dir,
            timeout=10.0,
            env=env,
            creationflags=creationflags
        )
        
        if compile_res.returncode != 0:
            return {
                "stdout": "",
                "stderr": compile_res.stderr,
                "exit_code": compile_res.returncode,
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res.stderr}"
            }
            
        # Run
        return self._run_process([exe_path], run_dir, stdin, time_limit, env=env)

    def _execute_java(self, run_dir, code, stdin, time_limit):
        # Java class needs to be Main.java
        source_path = os.path.join(run_dir, "Main.java")
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        javac_bin = runtime_manager.get_binary_path("javac")
        compile_cmd = [javac_bin, source_path]
        env = self._get_run_env(javac_bin)
        
        # Hide command windows on Windows
        creationflags = 0x08000000 if sys.platform == "win32" else 0
        
        # Compile
        compile_res = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            cwd=run_dir,
            timeout=15.0,
            env=env,
            creationflags=creationflags
        )
        
        if compile_res.returncode != 0:
            return {
                "stdout": "",
                "stderr": compile_res.stderr,
                "exit_code": compile_res.returncode,
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res.stderr}"
            }
            
        # Run
        java_bin = runtime_manager.get_binary_path("java")
        run_cmd = [java_bin, "Main"]
        env_run = self._get_run_env(java_bin)
        return self._run_process(run_cmd, run_dir, stdin, time_limit, env=env_run)

    def _run_process(self, cmd, run_dir, stdin, time_limit, env=None):
        """Helper to spawn, feed stdin, enforce time limits, and clean process handles and child trees."""
        stdout = ""
        stderr = ""
        exit_code = -1
        error_msg = None
        
        start_time = time.perf_counter()
        job = None
        
        try:
            # Hide command windows and break away from parent console if needed
            creationflags = 0x08000000 if sys.platform == "win32" else 0
            
            # Create process with redirected streams
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=run_dir,
                env=env,
                creationflags=creationflags
            )
            
            # Attach to Windows Job Object with KILL_ON_JOB_CLOSE
            if sys.platform == "win32":
                try:
                    import ctypes
                    from ctypes import wintypes
                    kernel32 = ctypes.windll.kernel32
                    job = kernel32.CreateJobObjectW(None, None)
                    if job:
                        class IO_COUNTERS(ctypes.Structure):
                            _fields_ = [("R", ctypes.c_uint64), ("W", ctypes.c_uint64), ("O", ctypes.c_uint64),
                                        ("RB", ctypes.c_uint64), ("WB", ctypes.c_uint64), ("OB", ctypes.c_uint64)]
                        class BASIC_LIMITS(ctypes.Structure):
                            _fields_ = [("PUser", ctypes.c_int64), ("JUser", ctypes.c_int64), ("LimitFlags", wintypes.DWORD),
                                        ("MinWS", ctypes.c_size_t), ("MaxWS", ctypes.c_size_t), ("ActiveProc", wintypes.DWORD),
                                        ("Affinity", ctypes.c_size_t), ("Priority", wintypes.DWORD), ("Sched", wintypes.DWORD)]
                        class EXTENDED_LIMITS(ctypes.Structure):
                            _fields_ = [("Basic", BASIC_LIMITS), ("Io", IO_COUNTERS),
                                        ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]
                        
                        limits = EXTENDED_LIMITS()
                        # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000) | JOB_OBJECT_LIMIT_PROCESS_MEMORY (0x0100) | JOB_OBJECT_LIMIT_JOB_MEMORY (0x0200)
                        limits.Basic.LimitFlags = 0x2000 | 0x0100 | 0x0200
                        mem_limit_bytes = 512 * 1024 * 1024  # 512 MB RAM limit
                        limits.ProcessMemoryLimit = mem_limit_bytes
                        limits.JobMemoryLimit = mem_limit_bytes
                        kernel32.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits))
                        kernel32.AssignProcessToJobObject(job, int(proc._handle))
                except Exception:
                    pass
            
            try:
                stdout, stderr = proc.communicate(input=stdin, timeout=time_limit)
                exit_code = proc.returncode
            except subprocess.TimeoutExpired:
                # Terminate process tree recursively
                try:
                    import psutil
                    parent = psutil.Process(proc.pid)
                    for child in parent.children(recursive=True):
                        try:
                            child.kill()
                        except Exception:
                            pass
                except Exception:
                    pass
                proc.kill()
                stdout, stderr = proc.communicate() # Drain pipes after killing
                exit_code = -9
                error_msg = "Time Limit Exceeded (TLE)"
                
        except Exception as e:
            error_msg = f"Runtime execution error: {str(e)}"
        finally:
            if job and sys.platform == "win32":
                try:
                    import ctypes
                    ctypes.windll.kernel32.CloseHandle(job)
                except Exception:
                    pass
            
        end_time = time.perf_counter()
        execution_time = end_time - start_time
        
        return {
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": exit_code,
            "execution_time": round(execution_time, 3),
            "error": error_msg
        }

# Singleton instance
code_executor = CodeExecutor()
if __name__ == "__main__":
    # Small self-test
    exec_engine = CodeExecutor()
    print("Testing python execution...")
    res = exec_engine.execute("python", "print('hello from python')", time_limit=2.0)
    print("Result:", res)
    
    print("\nTesting infinite loop execution safety...")
    res_loop = exec_engine.execute("python", "import time\nwhile True:\n    pass", time_limit=1.5)
    print("Result:", res_loop)
