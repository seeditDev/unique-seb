# KITE.exe - Desktop Assessment Platform Architecture

This document describes the architecture, compilation logic, and runtime management of **KITE.exe** (SEED-IT Desktop Edition), a fully self-contained, offline-first assessment environment for students.

---

## 1. Architecture Diagram

The system operates as a hybrid PyQt-React application. System-level commands and compiler subprocesses are strictly isolated in Python, while the student interface is loaded from a React build:

```
+------------------------------------------------------------+
|                          KITE.exe                          |
|                                                            |
|  +------------------------------------------------------+  |
|  |                 PyQt Desktop Shell                   |  |
|  |  (Window controls, Shortcut filters, Splash Screen)  |  |
|  +---------------------------+--------------------------+  |
|                              | (Qt QWebChannel Bridge)     |
|  +---------------------------v--------------------------+  |
|  |                  React User Interface                |  |
|  |  (Login, Dashboard, MCQ, Code Editor, Results Tabs)  |  |
|  +---------------------------+--------------------------+  |
|                              | (JS Promises)               |
|  +---------------------------v--------------------------+  |
|  |                 Local Assessment Engine              |  |
|  | (Checks sample/hidden tests, saves answers & scores) |  |
|  +---------------------------+--------------------------+  |
|                              | (Isolated Subprocesses)     |
|  +---------------------------v--------------------------+  |
|  |                 Subprocess execution engine           |  |
|  |     (Enforces Time Limits, Captures stdout/stderr)   |  |
|  +---------------------------+--------------------------+  |
|                              |                             |
|  +---------------------------v--------------------------+  |
|  |                Embedded Language Runtimes            |  |
|  |    - MinGW-w64 (GCC/G++)                             |  |
|  |    - OpenJDK (javac/java)                            |  |
|  |    - Python Interpreter                              |  |
|  +------------------------------------------------------+  |
+------------------------------------------------------------+
```

---

## 2. Local Execution Flow

Code execution follows a synchronous, isolated workflow on the local machine:

1. **Student Code input** is written in the React Monaco Editor.
2. When the student clicks **Run** or **Submit**, React calls `desktopBridge.runCode()` or `desktopBridge.submitCode()`.
3. The PyQt backend receives the call over `QWebChannel`.
4. The **Assessment Engine** creates a unique, isolated directory under `temp_workspace/run_[uuid]/` to prevent file conflicts.
5. The **Code Executor** writes the source file:
   - C -> `solution.c`
   - C++ -> `solution.cpp`
   - Python -> `solution.py`
   - Java -> `Main.java`
6. The compiler is invoked (for C, C++, and Java) through a Python subprocess. Any compilation error is captured from `stderr` and returned immediately.
7. The compiled executable or Python interpreter is executed. Stdin is fed into the process.
8. The subprocess is monitored. If execution exceeds the `timeLimit` (default `2.0s`), the process is killed using `proc.kill()` to prevent infinite loops, returning a **Time Limit Exceeded (TLE)** error.
9. Output `stdout` and `stderr` are collected.
10. The temporary workspace folder is cleaned up and deleted.
11. The results are compared and returned to the React frontend to display.

---

## 3. Embedded Runtime Configuration

To guarantee that KITE.exe runs offline without requiring the student to install GCC, Java, or Python, portable language compilers must be placed under `resources/runtimes/` in the build structure:

- **C/C++ Compiler**: MinGW-w64 folder named `mingw64` containing `bin/gcc.exe` and `bin/g++.exe`.
- **Java Compiler**: JDK folder named `jdk` containing `bin/javac.exe` and `bin/java.exe`.
- **Python Compiler**: Python embedded distribution folder named `python-embed` containing `python.exe`.

### Runtime Detection Order:
1. First, the application looks inside `resources/runtimes/` relative to the executable path.
2. If the portable compilers are not found, the executor automatically falls back to search the system environment `PATH` (using standard `gcc`, `g++`, `javac`, and `python` binaries). This allows seamless development and testing on personal machines that already have these tools.

---

## 4. Assessment Engine & State Sync

* **Obfuscation of Hidden Test Cases**: Hidden test case JSON files are stored separately under `data/questions/hidden/{id}_hidden.json`. They are scrambled using a base64 XOR key. The React app never receives hidden test cases; evaluation is performed in Python and only generic Pass/Fail case metrics are returned.
* **Student Progress Auto-Save**: Student answer files are saved to `data/student/{studentId}_answers.json` every 30 seconds. On page reload, the React app queries `desktopBridge.loadAnswer` to retrieve and restore editor state.
* **Online Syncing**: The React app tries to write scores to Firestore if an internet connection is available, but falls back silently to local log records if offline.

---

## 5. Build and Compilation Instructions

### Prerequisites
1. Install Python 3.8+ (including pip).
2. Install Node.js (including npm).
3. Install Python packaging modules:
   ```bash
   pip install pyinstaller pyqt6 PyQt6-WebEngine
   ```

### Compile Process
Execute the build script in the root directory:
```bash
python scripts/build.py
```
This script will:
1. Compile the React code into `frontend/build/`.
2. Seed the offline questions directory under `data/questions/`.
3. Invoke `pyinstaller` using `kite.spec` to generate `dist/KITE.exe`.
4. Copy the portable runtimes folder next to `KITE.exe` in the `dist/` directory.

### Distribution
Distribute the contents of the `dist/` directory:
```
dist/
├── KITE.exe
└── resources/
    └── runtimes/
        ├── mingw64/
        ├── jdk/
        └── python-embed/
```
The student runs `KITE.exe` directly.
