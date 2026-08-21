import os
import sys
import json
import hashlib

class RuntimeManager:
    # Embedded public key for Ed25519 digital signature attestation
    MANIFEST_PUBLIC_KEY = "a9f8e90b70d2316f31e3a903730142bb2cc987571961d91b2f0d0d70798d7f3a"
    
    # Exact required runtime binaries
    REQUIRED_RUNTIMES = ["gcc", "g++", "javac", "java", "python", "node"]

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

    def verify_manifest_signature(self, binaries_dict, signature_hex):
        """Verifies Ed25519 digital signature of canonical manifest binaries dictionary using embedded public key."""
        if not signature_hex or not isinstance(signature_hex, str):
            return False
        try:
            from cryptography.hazmat.primitives.asymmetric import ed25519
            canonical_str = json.dumps(binaries_dict, sort_keys=True, separators=(',', ':'))
            pub_bytes = bytes.fromhex(self.MANIFEST_PUBLIC_KEY)
            sig_bytes = bytes.fromhex(signature_hex)
            pub_key = ed25519.Ed25519PublicKey.from_public_bytes(pub_bytes)
            pub_key.verify(sig_bytes, canonical_str.encode('utf-8'))
            return True
        except Exception as e:
            print(f"[RuntimeManager] Cryptographic signature verification failed: {e}")
            return False

    def resolve_paths(self):
        r"""Set paths strictly to the single canonical location: C:\Program Files (x86)\SEED-SEB\resources\runtimes."""
        self.runtimes_dir = r"C:\Program Files (x86)\SEED-SEB\resources\runtimes"

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
        """Loads, validates strict schema, and cryptographically verifies the Ed25519 signed manifest."""
        prod_manifest = r"C:\Program Files (x86)\SEED-SEB\resources\runtime-manifest.json"
        is_dev = os.environ.get("SEED_SEB_DEV_MODE") == "1" or not getattr(sys, 'frozen', False)
        manifest_paths = [prod_manifest]
        if is_dev:
            manifest_paths.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "runtime-manifest.json"))

        for p in manifest_paths:
            if p and os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    # 1. Strict Schema Validation
                    if not isinstance(data, dict):
                        print(f"[RuntimeManager] CRITICAL: Manifest at {p} is not a valid JSON object.")
                        return None

                    binaries = data.get("binaries")
                    if not isinstance(binaries, dict):
                        print(f"[RuntimeManager] CRITICAL: Manifest at {p} missing 'binaries' dictionary.")
                        return None

                    # 2. Strict Signature Requirement (FAIL-CLOSED if missing or empty)
                    signature = data.get("signature")
                    if not signature or not isinstance(signature, str):
                        print(f"[RuntimeManager] CRITICAL: Manifest at {p} missing required cryptographic signature. Fail-closed.")
                        return None

                    # 3. Exact 6 Runtime Binaries Schema Enforcement
                    bin_keys = set(binaries.keys())
                    expected_keys = set(self.REQUIRED_RUNTIMES)
                    if bin_keys != expected_keys:
                        print(f"[RuntimeManager] CRITICAL: Manifest schema mismatch. Expected: {expected_keys}, Found: {bin_keys}")
                        return None

                    for name, hash_val in binaries.items():
                        if not isinstance(hash_val, str) or len(hash_val) != 64:
                            print(f"[RuntimeManager] CRITICAL: Manifest contains malformed SHA-256 hash for {name}: {hash_val}")
                            return None

                    # 4. Asymmetric Ed25519 Signature Verification
                    if not self.verify_manifest_signature(binaries, signature):
                        print(f"[RuntimeManager] CRITICAL: Cryptographic Ed25519 signature mismatch on manifest {p} (Manifest tampered)!")
                        return None

                    return binaries
                except Exception as e:
                    print(f"[RuntimeManager] Error reading runtime manifest at {p}: {e}")
                    return None
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
        """Retrieves absolute binary path from strict allow-list; rejects unknown runtime names."""
        if binary_name not in self.binaries:
            raise ValueError(f"CRITICAL: Unknown or unsupported runtime binary requested: '{binary_name}'")
        return self.binaries[binary_name]


# Singleton instance
runtime_manager = RuntimeManager()

