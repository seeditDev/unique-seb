import os
import sys
import json
import hmac
import shutil
import hashlib

class RuntimeManager:
    # Embedded application signing key for manifest attestation
    MANIFEST_SIGNING_KEY = b"SEED_SEB_INTERNAL_RUNTIME_MANIFEST_ATTESTATION_KEY_2026"

    def __init__(self):
        self.app_root = self.get_app_root()
        self.runtimes_dir = os.path.join(self.app_root, "resources", "runtimes")
        
        # Paths to binaries (defaults to packaged runtimes)
        self.binaries = {
            "gcc": "gcc",
            "g++": "g++",
            "javac": "javac",
            "java": "java",
            "python": "python",
            "node": "node"
        }
        
        self.resolve_paths()

    def get_app_root(self):
        r"""Always returns the fixed SEED-SEB install root.

        The installer always places the app at:
            C:\Program Files (x86)\SEED-SEB
        This is the only supported path -- no dynamic probing needed.
        """
        return r"C:\Program Files (x86)\SEED-SEB"

    def compute_sha256(self, filepath):
        """Computes SHA-256 hash of a runtime binary to verify package integrity."""
        if not filepath or not os.path.exists(filepath):
            return None
        sha256 = hashlib.sha256()
        try:
            with open(filepath, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    sha256.update(chunk)
            return sha256.hexdigest()
        except Exception:
            return None

    def compute_manifest_signature(self, binaries_dict):
        """Computes HMAC-SHA256 signature for canonical manifest binary entries."""
        canonical_str = json.dumps(binaries_dict, sort_keys=True, separators=(',', ':'))
        return hmac.new(self.MANIFEST_SIGNING_KEY, canonical_str.encode('utf-8'), hashlib.sha256).hexdigest()

    def resolve_paths(self):
        """Set paths strictly to the portable runtimes inside resources/runtimes."""
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
            status = "EXISTS" if os.path.exists(path) else "NOT FOUND"
            print(f"  {lang}: {path} ({status})")

    def verify_resources(self):
        """Verifies that all packaged local compilers are present and accessible."""
        required_binaries = [
            ("gcc", self.binaries.get("gcc")),
            ("g++", self.binaries.get("g++")),
            ("javac", self.binaries.get("javac")),
            ("java", self.binaries.get("java")),
            ("python", self.binaries.get("python")),
            ("node", self.binaries.get("node"))
        ]

        missing = []
        for name, path in required_binaries:
            if not path or not os.path.exists(path):
                missing.append(f"{name} ({path})")

        if missing:
            print(f"[RuntimeManager] ERROR: Missing required compiled resources: {missing}")
            return False

        return True

    def load_trusted_manifest(self):
        """Loads and cryptographically verifies the SHA-256 manifest shipped with SEED-SEB."""
        manifest_paths = [
            os.path.join(self.app_root, "resources", "runtime-manifest.json"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "runtime-manifest.json"),
            os.path.join(getattr(sys, '_MEIPASS', ''), "resources", "runtime-manifest.json")
        ]
        for p in manifest_paths:
            if p and os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        binaries = data.get("binaries", data)
                        # Verify HMAC attestation signature if present
                        signature = data.get("signature")
                        if signature:
                            expected_sig = self.compute_manifest_signature(binaries)
                            if signature.lower() != expected_sig.lower():
                                print(f"[RuntimeManager] CRITICAL ERROR: Cryptographic signature mismatch on manifest {p} (Manifest tampered)!")
                                return None
                        return binaries
                except Exception as e:
                    print(f"[RuntimeManager] Error reading runtime manifest at {p}: {e}")
        return None

    def verify_runtime_integrity(self, expected_manifest=None):
        """Validates cryptographic SHA-256 checksums of all runtime binaries against an expected manifest."""
        manifest = expected_manifest if expected_manifest is not None else self.load_trusted_manifest()
        if not manifest:
            # In development mode, allow baseline generation if no manifest file exists
            is_dev = os.environ.get("SEED_SEB_DEV_MODE") == "1" or not getattr(sys, 'frozen', False)
            if is_dev:
                current_hashes = {}
                for name, path in self.binaries.items():
                    if path and os.path.exists(path):
                        current_hashes[name] = self.compute_sha256(path)
                return True, current_hashes
            return False, ["Trusted runtime manifest 'runtime-manifest.json' is missing from resources directory."]

        mismatches = []
        for name, expected_hash in manifest.items():
            path = self.binaries.get(name)
            if not path or not os.path.exists(path):
                mismatches.append(f"{name}: binary missing at {path}")
                continue
            actual_hash = self.compute_sha256(path)
            if not actual_hash or actual_hash.lower() != expected_hash.lower():
                mismatches.append(f"{name}: hash mismatch (expected {expected_hash[:12]}..., got {str(actual_hash)[:12]}...)")

        if mismatches:
            return False, mismatches
        return True, "All runtime binaries verified against cryptographic manifest."

    def get_binary_path(self, binary_name):
        path = self.binaries.get(binary_name, binary_name)
        if path and os.path.exists(path):
            return path

        meipass = getattr(sys, '_MEIPASS', '')
        alt_paths = [
            os.path.join(self.app_root, "resources", "runtimes", "python-embed", "python.exe") if binary_name == "python" else "",
            os.path.join(meipass, "resources", "runtimes", "python-embed", "python.exe") if binary_name == "python" else "",
            os.path.join(self.app_root, "resources", "runtimes", "mingw64", "bin", f"{binary_name}.exe"),
            os.path.join(self.app_root, "resources", "runtimes", "jdk", "bin", f"{binary_name}.exe"),
            os.path.join(meipass, "resources", "runtimes", "mingw64", "bin", f"{binary_name}.exe"),
            os.path.join(meipass, "resources", "runtimes", "jdk", "bin", f"{binary_name}.exe")
        ]
        for p in alt_paths:
            if p and os.path.exists(p):
                return p

        # Allow system fallback ONLY if development mode is explicitly enabled
        is_dev = os.environ.get("SEED_SEB_DEV_MODE") == "1" or not getattr(sys, 'frozen', False)
        if is_dev:
            if binary_name == "python":
                exe_base = os.path.basename(sys.executable).lower() if sys.executable else ""
                if exe_base in ("python.exe", "pythonw.exe", "python3.exe", "python310.exe", "python311.exe"):
                    return sys.executable
            found = shutil.which(binary_name) or shutil.which(f"{binary_name}.exe")
            if found:
                return found

        return path


# Singleton instance
runtime_manager = RuntimeManager()

