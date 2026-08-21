import os
import sys
import uuid
import time
import shutil
import subprocess
import tempfile
import threading
from runtime_manager import runtime_manager

class CodeExecutor:
    def __init__(self):
        self.app_root = runtime_manager.app_root
        candidate_dir = os.path.join(self.app_root, "temp_workspace")
        is_dev = os.environ.get("SEED_SEB_DEV_MODE") == "1" or not getattr(sys, 'frozen', False)
        try:
            os.makedirs(candidate_dir, exist_ok=True)
            test_file = os.path.join(candidate_dir, ".write_test")
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
            self.workspace_dir = candidate_dir
        except Exception as e:
            if is_dev:
                self.workspace_dir = os.path.join(tempfile.gettempdir(), "seed_seb_temp_workspace")
                os.makedirs(self.workspace_dir, exist_ok=True)
            else:
                raise RuntimeError(f"CRITICAL: Production workspace directory {candidate_dir} is unavailable or unwritable: {e}")

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
        # Enforce cryptographic runtime integrity gate
        integrity_ok, integrity_info = runtime_manager.verify_runtime_integrity()
        if not integrity_ok:
            return {
                "stdout": "",
                "stderr": f"Runtime Security Verification Error: {integrity_info}",
                "exit_code": -1,
                "execution_time": 0.0,
                "error": "Compiler integrity verification failed"
            }

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

    def _get_run_env(self, binary_path, run_dir=None):
        """Prepares a sanitized, isolated environment with sensitive credentials, tokens, and user paths stripped."""
        # Whitelist only safe minimal system environment variables
        safe_keys = {
            "SystemRoot", "SYSTEMROOT", "SYSTEMDRIVE", "COMSPEC", "PATHEXT",
            "WINDIR", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
            "OS", "PROCESSOR_IDENTIFIER", "PROCESSOR_LEVEL", "PROCESSOR_REVISION"
        }
        env = {k: v for k, v in os.environ.items() if k in safe_keys or k.upper() in safe_keys}

        # Ensure SystemRoot and SYSTEMROOT are guaranteed set
        sys_root = os.environ.get("SystemRoot", os.environ.get("SYSTEMROOT", "C:\\Windows"))
        env["SystemRoot"] = sys_root
        env["SYSTEMROOT"] = sys_root

        # Isolate temporary files strictly to run_dir if provided
        if run_dir and os.path.exists(run_dir):
            env["TEMP"] = run_dir
            env["TMP"] = run_dir

        path_additions = []
        if binary_path:
            bin_dir = os.path.dirname(os.path.abspath(binary_path))
            path_additions.append(bin_dir)
            arch_bin = os.path.join(os.path.dirname(bin_dir), "x86_64-w64-mingw32", "bin")
            if os.path.exists(arch_bin):
                path_additions.append(arch_bin)

        # Retain standard Windows system paths for system DLLs & core executables
        path_additions.extend([
            os.path.join(sys_root, "System32"),
            sys_root,
            os.path.join(sys_root, "System32", "Wbem")
        ])
        env["PATH"] = os.pathsep.join(path_additions)

        # Block any proxy or credential injection
        banned_prefixes = ("HTTP_", "HTTPS_", "ALL_", "NO_", "VITE_", "REACT_APP_", "GITHUB_", "SUPABASE_", "AWS_", "GOOGLE_", "FIREBASE_")
        for k in list(env.keys()):
            if any(k.upper().startswith(p) for p in banned_prefixes):
                del env[k]

        # Prevent Node / Python runtime environment poisoning
        for var in ["PYTHONHOME", "PYTHONPATH", "PYTHONIOENCODING", "NODE_OPTIONS", "NODE_PATH"]:
            if var in env:
                del env[var]

        # Enforce sandbox network isolation: block outbound web requests by setting dummy unreachable proxy
        env["http_proxy"] = "http://127.0.0.1:0"
        env["https_proxy"] = "http://127.0.0.1:0"
        env["all_proxy"] = "http://127.0.0.1:0"
        env["HTTP_PROXY"] = "http://127.0.0.1:0"
        env["HTTPS_PROXY"] = "http://127.0.0.1:0"
        env["ALL_PROXY"] = "http://127.0.0.1:0"
        env["NO_PROXY"] = ""

        return env

    def _execute_javascript(self, run_dir, code, stdin, time_limit):
        file_path = os.path.join(run_dir, "solution.js")
        
        # Self-contained Node sandbox guard (allows stdio pipes, blocks network and child process spawning)
        js_prelude = (
            "try {\n"
            "  const _net = require('net');\n"
            "  const _child = require('child_process');\n"
            "  const _OrigSocket = _net.Socket;\n"
            "  const _block = (op) => { throw new Error('Sandbox Security: ' + op + ' is disabled during assessment execution.'); };\n"
            "  _net.Socket = function(options) {\n"
            "    if (options && (typeof options.fd === 'number' || options.handle)) {\n"
            "      return new _OrigSocket(options);\n"
            "    }\n"
            "    _block('Network operations');\n"
            "  };\n"
            "  _net.Socket.prototype = _OrigSocket.prototype;\n"
            "  _net.connect = () => _block('Network connect');\n"
            "  _net.createConnection = () => _block('Network createConnection');\n"
            "  _child.spawn = () => _block('Subprocess spawning');\n"
            "  _child.exec = () => _block('Subprocess execution');\n"
            "  _child.execFile = () => _block('Subprocess execFile');\n"
            "  _child.spawnSync = () => _block('Subprocess spawnSync');\n"
            "  _child.execSync = () => _block('Subprocess execSync');\n"
            "} catch(e) {\n"
            "  console.error('CRITICAL SANDBOX ERROR: Security initialization failed: ' + e.message);\n"
            "  process.exit(1);\n"
            "}\n"
        )
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(js_prelude + code)

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
        env = self._get_run_env(node_bin, run_dir)
        return self._run_process(cmd, run_dir, stdin, time_limit, env=env)

    def _execute_python(self, run_dir, code, stdin, time_limit):
        file_path = os.path.join(run_dir, "solution.py")
        
        # Self-contained Python sandbox guard with CPython audit hook (immune to importlib.reload or module deletion)
        py_prelude = (
            "# --- SEED-SEB Sandbox Security Isolation ---\n"
            "import sys as _sec_sys\n"
            "import socket as _sec_socket\n"
            "def _sec_block_net(*a, **kw):\n"
            "    raise PermissionError('Sandbox Security: Network operations are disabled during assessment execution.')\n"
            "_sec_socket.socket = _sec_block_net\n"
            "_sec_socket.create_connection = _sec_block_net\n"
            "_sec_socket.getaddrinfo = _sec_block_net\n"
            "_sec_socket.gethostbyname = _sec_block_net\n"
            "def _sec_audit_hook(event, args):\n"
            "    if event in ('socket.connect', 'socket.bind', 'socket.send', 'socket.getaddrinfo', 'socket.gethostbyname'):\n"
            "        raise PermissionError(f'Sandbox Security: Network call [{event}] is blocked in assessment mode.')\n"
            "    if event in ('os.system', 'subprocess.Popen'):\n"
            "        raise PermissionError(f'Sandbox Security: Subprocess spawning [{event}] is blocked in assessment mode.')\n"
            "try:\n"
            "    _sec_sys.addaudithook(_sec_audit_hook)\n"
            "except Exception as _e:\n"
            "    raise SystemExit(f'CRITICAL SANDBOX ERROR: Security initialization failed: {_e}')\n"
            "# --------------------------------------------\n"
        )
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(py_prelude + code)

        python_bin = runtime_manager.get_binary_path("python")
        cmd = [python_bin, "solution.py"]
        env = self._get_run_env(python_bin, run_dir)
        
        return self._run_process(cmd, run_dir, stdin, time_limit, env=env)

    def _check_disk_quota(self, run_dir, max_bytes=50*1024*1024, max_files=100):
        """Validates that the execution run directory does not exceed disk quota or file count limit."""
        total_size = 0
        total_files = 0
        for root, dirs, files in os.walk(run_dir):
            for f in files:
                total_files += 1
                if total_files > max_files:
                    return False, f"File Count Quota Exceeded (Max {max_files} files limit exceeded)"
                try:
                    fp = os.path.join(root, f)
                    total_size += os.path.getsize(fp)
                    if total_size > max_bytes:
                        return False, f"Disk Quota Exceeded (Max {max_bytes // (1024*1024)}MB limit exceeded)"
                except Exception:
                    pass
        return True, None

    def _write_c_guard_header(self, run_dir):
        """Creates a security header to block socket and child process spawning in C/C++ without breaking stdlib."""
        guard_path = os.path.join(run_dir, "sandbox_guard.h")
        guard_content = (
            "#ifndef SEED_SANDBOX_GUARD_H\n"
            "#define SEED_SANDBOX_GUARD_H\n"
            "#ifdef __cplusplus\n"
            "#include <cstdlib>\n"
            "#include <cstdio>\n"
            "extern \"C\" {\n"
            "#else\n"
            "#include <stdlib.h>\n"
            "#include <stdio.h>\n"
            "#endif\n"
            "static inline int __seed_blocked_call(void) { return -1; }\n"
            "static inline void* __seed_blocked_null(void) { return (void*)0; }\n"
            "#define socket(...) __seed_blocked_call()\n"
            "#define connect(...) __seed_blocked_call()\n"
            "#define WSAStartup(...) (1)\n"
            "#define getaddrinfo(...) __seed_blocked_call()\n"
            "#define gethostbyname(...) ((void*)0)\n"
            "#define system(...) __seed_blocked_call()\n"
            "#define popen(...) ((FILE*)__seed_blocked_null())\n"
            "#define _popen(...) ((FILE*)__seed_blocked_null())\n"
            "#define CreateProcessA(...) (0)\n"
            "#define CreateProcessW(...) (0)\n"
            "#define CreateProcess(...) (0)\n"
            "#define WinExec(...) (0)\n"
            "#define ShellExecuteA(...) ((void*)0)\n"
            "#define ShellExecuteW(...) ((void*)0)\n"
            "#define ShellExecute(...) ((void*)0)\n"
            "#ifdef __cplusplus\n"
            "}\n"
            "#endif\n"
            "#endif\n"
        )
        with open(guard_path, "w", encoding="utf-8") as f:
            f.write(guard_content)
        return guard_path

    def _execute_c(self, run_dir, code, stdin, time_limit):
        source_path = os.path.join(run_dir, "solution.c")
        exe_path = os.path.join(run_dir, "solution.exe")
        self._write_c_guard_header(run_dir)
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        gcc_bin = runtime_manager.get_binary_path("gcc")
        compile_cmd = [gcc_bin, "-include", "sandbox_guard.h", "-O2", "-o", exe_path, source_path]
        env = self._get_run_env(gcc_bin, run_dir)
        
        # Compile inside protected run process with 10s compile limit
        compile_res = self._run_process(compile_cmd, run_dir, "", time_limit=10.0, env=env)
        if compile_res["exit_code"] != 0:
            return {
                "stdout": "",
                "stderr": compile_res["stderr"] or compile_res["stdout"],
                "exit_code": compile_res["exit_code"],
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res['stderr'] or compile_res['stdout']}"
            }
            
        # Run
        return self._run_process([exe_path], run_dir, stdin, time_limit, env=env)

    def _execute_cpp(self, run_dir, code, stdin, time_limit):
        source_path = os.path.join(run_dir, "solution.cpp")
        exe_path = os.path.join(run_dir, "solution.exe")
        self._write_c_guard_header(run_dir)
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        gpp_bin = runtime_manager.get_binary_path("g++")
        compile_cmd = [gpp_bin, "-include", "sandbox_guard.h", "-O2", "-std=c++17", "-o", exe_path, source_path]
        env = self._get_run_env(gpp_bin, run_dir)
        
        # Compile inside protected run process with 10s compile limit
        compile_res = self._run_process(compile_cmd, run_dir, "", time_limit=10.0, env=env)
        if compile_res["exit_code"] != 0:
            return {
                "stdout": "",
                "stderr": compile_res["stderr"] or compile_res["stdout"],
                "exit_code": compile_res["exit_code"],
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res['stderr'] or compile_res['stdout']}"
            }
            
        # Run
        return self._run_process([exe_path], run_dir, stdin, time_limit, env=env)

    def _execute_java(self, run_dir, code, stdin, time_limit):
        # Java class needs to be Main.java
        source_path = os.path.join(run_dir, "Main.java")
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Write strict sandbox.policy for Java execution
        policy_path = os.path.join(run_dir, "sandbox.policy")
        policy_content = (
            "grant {\n"
            "    permission java.util.PropertyPermission \"*\", \"read\";\n"
            "    permission java.lang.RuntimePermission \"getenv.*\";\n"
            "    permission java.lang.RuntimePermission \"exitVM.*\";\n"
            "    permission java.io.FilePermission \"${java.home}/-\", \"read\";\n"
            "    permission java.io.FilePermission \"${user.dir}/-\", \"read,write,delete\";\n"
            "};\n"
        )
        with open(policy_path, "w", encoding="utf-8") as f:
            f.write(policy_content)
            
        javac_bin = runtime_manager.get_binary_path("javac")
        compile_cmd = [javac_bin, "-d", ".", "Main.java"]
        env = self._get_run_env(javac_bin, run_dir)
        
        # Compile inside protected run process with 15s compile limit
        compile_res = self._run_process(compile_cmd, run_dir, "", time_limit=15.0, env=env)
        if compile_res["exit_code"] != 0:
            return {
                "stdout": "",
                "stderr": compile_res["stderr"] or compile_res["stdout"],
                "exit_code": compile_res["exit_code"],
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res['stderr'] or compile_res['stdout']}"
            }
            
        # Run with security manager policy, memory cap, and SOCKS/HTTP proxy isolation
        java_bin = runtime_manager.get_binary_path("java")
        run_cmd = [
            java_bin,
            "-Xmx128m", "-Xms16m",
            "-Djava.security.manager",
            f"-Djava.security.policy={policy_path}",
            "-Djava.net.preferIPv4Stack=true",
            "-DsocksProxyHost=127.0.0.1", "-DsocksProxyPort=0",
            "-Dhttp.proxyHost=127.0.0.1", "-Dhttp.proxyPort=0",
            "-Dhttps.proxyHost=127.0.0.1", "-Dhttps.proxyPort=0",
            "-Djava.awt.headless=true",
            "-cp", ".", "Main"
        ]
        env_run = self._get_run_env(java_bin, run_dir)
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
            
            # Attach to Windows Job Object with KILL_ON_JOB_CLOSE & UI Restrictions
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
                        # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000) | PROCESS_MEMORY (0x0100) | JOB_MEMORY (0x0200) | DIE_ON_UNHANDLED_EXCEPTION (0x0400)
                        limits.Basic.LimitFlags = 0x2000 | 0x0100 | 0x0200 | 0x0400
                        mem_limit_bytes = 512 * 1024 * 1024  # 512 MB RAM limit
                        limits.ProcessMemoryLimit = mem_limit_bytes
                        limits.JobMemoryLimit = mem_limit_bytes
                        kernel32.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits))
                        
                        # Apply UI restrictions (0x00FF = handles, clipboard, desktop, system parameters)
                        class UI_RESTRICTIONS(ctypes.Structure):
                            _fields_ = [("UIRestrictionsClass", wintypes.DWORD)]
                        ui_limits = UI_RESTRICTIONS(0x00FF)
                        kernel32.SetInformationJobObject(job, 4, ctypes.byref(ui_limits), ctypes.sizeof(ui_limits))
                        
                        kernel32.AssignProcessToJobObject(job, int(proc._handle))
                except Exception:
                    pass
            
            # Start real-time active disk & file count quota monitor
            stop_monitor = threading.Event()
            quota_violated = threading.Event()
            quota_reason = [""]

            def _active_disk_monitor():
                while not stop_monitor.is_set():
                    total_size = 0
                    total_files = 0
                    try:
                        for root, dirs, files in os.walk(run_dir):
                            total_files += len(files)
                            if total_files > 100:
                                quota_reason[0] = "File Count Quota Exceeded (Max 100 files limit exceeded during execution)"
                                quota_violated.set()
                                try:
                                    proc.kill()
                                except Exception:
                                    pass
                                return
                            for f in files:
                                fp = os.path.join(root, f)
                                total_size += os.path.getsize(fp)
                                if total_size > 50 * 1024 * 1024:
                                    quota_reason[0] = "Disk Quota Exceeded (50MB limit exceeded during execution)"
                                    quota_violated.set()
                                    try:
                                        proc.kill()
                                    except Exception:
                                        pass
                                    return
                    except Exception:
                        pass
                    stop_monitor.wait(0.04) # Check every 40ms

            monitor_thread = threading.Thread(target=_active_disk_monitor, daemon=True)
            monitor_thread.start()

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
            stop_monitor.set()
            if job and sys.platform == "win32":
                try:
                    import ctypes
                    ctypes.windll.kernel32.CloseHandle(job)
                except Exception:
                    pass
            
        end_time = time.perf_counter()
        execution_time = end_time - start_time
        
        # If quota was actively violated during execution or after execution, flag error
        if quota_violated.is_set():
            error_msg = quota_reason[0]
            exit_code = -1
        else:
            quota_ok, post_err = self._check_disk_quota(run_dir)
            if not quota_ok:
                error_msg = post_err
                exit_code = -1
        
        # Protect against memory exhaustion from excessive output (truncate at 1MB)
        MAX_BYTES = 1024 * 1024
        if stdout and len(stdout) > MAX_BYTES:
            stdout = stdout[:MAX_BYTES] + "\n... [Output Truncated: Exceeded 1MB limit]"
        if stderr and len(stderr) > MAX_BYTES:
            stderr = stderr[:MAX_BYTES] + "\n... [Error Output Truncated: Exceeded 1MB limit]"

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
