import os
import sys
import shutil

class RuntimeManager:
    def __init__(self):
        self.app_root = self.get_app_root()
        self.runtimes_dir = os.path.join(self.app_root, "resources", "runtimes")
        
        # Paths to binaries (defaults to system fallback)
        self.binaries = {
            "gcc": "gcc",
            "g++": "g++",
            "javac": "javac",
            "java": "java",
            "python": sys.executable if sys.executable else "python"
        }
        
        self.resolve_paths()

    def get_app_root(self):
        r"""Always returns the fixed SEED-SEB install root.

        The installer always places the app at:
            C:\Program Files (x86)\SEED-SEB
        This is the only supported path -- no dynamic probing needed.
        """
        return r"C:\Program Files (x86)\SEED-SEB"

    def resolve_paths(self):
        """Set paths strictly to the portable runtimes inside resources/runtimes.
        Searches adjacent to executable, installed path, and local dev paths."""
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        exe_runtimes = os.path.join(exe_dir, "resources", "runtimes")
        hardcoded_dir = r"C:\Program Files (x86)\SEED-SEB\resources\runtimes"
        file_dir = os.path.dirname(os.path.abspath(__file__))
        file_runtimes = os.path.join(os.path.dirname(file_dir), "resources", "runtimes")
        
        if os.path.exists(exe_runtimes):
            self.runtimes_dir = exe_runtimes
        elif os.path.exists(hardcoded_dir):
            self.runtimes_dir = hardcoded_dir
        elif os.path.exists(file_runtimes):
            self.runtimes_dir = file_runtimes
        else:
            # Sibling / Parent fallback check during local development if not installed
            candidates = [
                os.path.join(os.path.dirname(file_dir), "runtimes"),
                os.path.join(os.path.dirname(self.app_root), "runtimes"),
                os.path.join(os.path.dirname(os.path.dirname(self.app_root)), "runtimes"),
            ]
            for c in candidates:
                if os.path.exists(c):
                    self.runtimes_dir = c
                    break

        # C/C++ (MinGW)
        mingw_bin = os.path.join(self.runtimes_dir, "mingw64", "bin")
        self.binaries["gcc"] = os.path.join(mingw_bin, "gcc.exe")
        self.binaries["g++"] = os.path.join(mingw_bin, "g++.exe")

        # Java (JDK)
        jdk_bin = os.path.join(self.runtimes_dir, "jdk", "bin")
        self.binaries["javac"] = os.path.join(jdk_bin, "javac.exe")
        self.binaries["java"] = os.path.join(jdk_bin, "java.exe")

        # Python (Portable Python)
        self.binaries["python"] = os.path.join(self.runtimes_dir, "python-embed", "python.exe")

        # JavaScript (Node.js)
        self.binaries["node"] = os.path.join(self.runtimes_dir, "node", "node.exe")

        print("[RuntimeManager] Runtime Service Configuration:")
        for lang, path in self.binaries.items():
            status = "EXISTS" if os.path.exists(path) else "NOT FOUND (Must pack in resources/runtimes)"
            print(f"  {lang}: {path} ({status})")

    def verify_resources(self):
        """Verifies that all packaged local compilers are present.
        Always checks -- no frozen/dev bypass."""
        required_binaries = [
            self.binaries.get("gcc"),
            self.binaries.get("javac"),
            self.binaries.get("python"),
            self.binaries.get("node")
        ]

        missing = []
        for path in required_binaries:
            if not path or not os.path.exists(path):
                missing.append(str(path))

        if missing:
            print(f"[RuntimeManager] ERROR: Missing compiled resources: {missing}")
            return False

        return True
    def get_binary_path(self, binary_name):
        path = self.binaries.get(binary_name, binary_name)
        if path and os.path.exists(path):
            return path

        if binary_name == "python":
            meipass = getattr(sys, '_MEIPASS', '')
            candidates = [
                os.path.join(self.runtimes_dir, "python-embed", "python.exe"),
                os.path.join(self.app_root, "resources", "runtimes", "python-embed", "python.exe"),
                os.path.join(meipass, "resources", "runtimes", "python-embed", "python.exe"),
                os.path.join(self.app_root, "python-embed", "python.exe"),
                os.path.join(os.path.dirname(self.app_root), "runtimes", "python-embed", "python.exe"),
                os.path.join(os.path.dirname(os.path.dirname(self.app_root)), "runtimes", "python-embed", "python.exe"),
                shutil.which("python.exe"),
                shutil.which("python")
            ]
            for c in candidates:
                if c and os.path.exists(c) and os.path.basename(c).lower() not in ("seed-seb.exe", os.path.basename(sys.executable).lower()):
                    return c

            exe_base = os.path.basename(sys.executable).lower() if sys.executable else ""
            if exe_base in ("python.exe", "pythonw.exe", "python3.exe", "python311.exe", "python314.exe"):
                return sys.executable

            return "python"

        meipass = getattr(sys, '_MEIPASS', '')
        alt_paths = [
            os.path.join(self.app_root, "resources", "runtimes", "mingw64", "bin", f"{binary_name}.exe"),
            os.path.join(self.app_root, "resources", "runtimes", "jdk", "bin", f"{binary_name}.exe"),
            os.path.join(meipass, "resources", "runtimes", "mingw64", "bin", f"{binary_name}.exe"),
            os.path.join(meipass, "resources", "runtimes", "jdk", "bin", f"{binary_name}.exe")
        ]
        for p in alt_paths:
            if p and os.path.exists(p):
                return p

        found = shutil.which(binary_name)
        if found:
            return found
        return path


# Singleton instance
runtime_manager = RuntimeManager()

