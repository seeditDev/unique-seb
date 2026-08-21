"""
register_build_hash.py
======================
Run this ONCE after compiling a new SEED-SEB.exe to register its SHA-256
hash in Firebase Firestore. After registration, only this exact binary
will pass the integrity check on student laptops.

Authentication:
  1. Automatic: Uses serviceAccountKey.json if present.
  2. Fallback: Prompts for Firebase Admin/Staff email & password.

Usage:
    python register_build_hash.py
"""

import hashlib
import os
import sys
import json
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("Installing requests...")
    os.system(f"{sys.executable} -m pip install requests")
    import requests

# ── Configuration ─────────────────────────────────────────────────────────────

FIREBASE_PROJECT_ID = "daily-tracker-a4092"
FIREBASE_API_KEY    = "AIzaSyANO2d-RUXV0x5fvTjRT1UkpssP-T_Qz1Q"

APP_VERSION = "1.0.4"  # must match CURRENT_VERSION in desktop/main.py

# Path to compiled SEED-SEB.exe (relative to this script)
POSSIBLE_EXE_PATHS = [
    os.path.join(os.path.dirname(__file__), "SEED-SEB.exe"),
    os.path.join(os.path.dirname(__file__), "..", "SetupBuild", "SEED-SEB.exe"),
    os.path.join(os.path.dirname(__file__), "..", "SetupBuild", "dist", "SEED-SEB", "SEED-SEB.exe"),
    os.path.join(os.path.dirname(__file__), "dist", "SEED-SEB", "SEED-SEB.exe"),
    os.path.join(os.path.dirname(__file__), "..", "dist", "SEED-SEB.exe"),
    os.path.join(os.path.dirname(__file__), "..", "dist", "SEED-SEB", "SEED-SEB.exe"),
]

# Service account key paths
POSSIBLE_SERVICE_KEYS = [
    os.path.join(os.path.dirname(__file__), "..", "serviceAccountKey.json"),
    os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"),
    os.path.join(os.path.dirname(__file__), "..", "..", "serviceAccountKey.json"),
    r"C:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\SEED SEB CENTRAL\serviceAccountKey.json",
]


def compute_sha256(filepath):
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    except FileNotFoundError:
        return None


def register_with_service_account(sa_path, version, sha256_hash, notes):
    """Register hash directly using Firebase Admin SDK."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred = credentials.Certificate(sa_path)
            firebase_admin.initialize_app(cred, {"projectId": FIREBASE_PROJECT_ID})
        
        db = firestore.client()
        doc_ref = db.collection("app_build_hashes").document(str(version))
        doc_ref.set({
            "version": str(version),
            "sha256_hash": str(sha256_hash).lower(),
            "is_active": True,
            "notes": str(notes),
            "registeredAt": datetime.now(timezone.utc).isoformat()
        })
        return True, "Registered via Firebase Admin SDK"
    except Exception as e:
        return False, str(e)


def register_with_id_token(id_token, version, sha256_hash, notes):
    """Register hash via Firestore REST API with an authenticated user's ID token."""
    url = (
        f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/"
        f"documents/app_build_hashes/{version}"
    )
    headers = {"Authorization": f"Bearer {id_token}"}
    payload = {
        "fields": {
            "version":      {"stringValue": str(version)},
            "sha256_hash":  {"stringValue": str(sha256_hash).lower()},
            "is_active":    {"booleanValue": True},
            "notes":        {"stringValue": str(notes)},
            "registeredAt": {"stringValue": datetime.now(timezone.utc).isoformat()}
        }
    }
    resp = requests.patch(url, headers=headers, json=payload, timeout=15)
    if resp.status_code == 200:
        return True, "Registered via Authenticated REST API"
    return False, f"HTTP {resp.status_code}: {resp.text}"


def sign_in_firebase_auth(email, password):
    """Obtain Firebase ID token using email/password."""
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    payload = {"email": email, "password": password, "returnSecureToken": True}
    resp = requests.post(url, json=payload, timeout=15)
    if resp.status_code == 200:
        return resp.json().get("idToken")
    return None


if __name__ == "__main__":
    print("=" * 60)
    print("  SEED-SEB Firebase Build Hash Registration Tool")
    print("=" * 60)

    # 1. Locate EXE
    exe_path = None
    for p in POSSIBLE_EXE_PATHS:
        if os.path.exists(p):
            exe_path = os.path.abspath(p)
            break

    if not exe_path:
        print("\n[ERROR] SEED-SEB.exe not found in standard paths.")
        custom_p = input("Enter custom path to SEED-SEB.exe: ").strip()
        if os.path.exists(custom_p):
            exe_path = custom_p
        else:
            print("File not found. Exiting.")
            sys.exit(1)

    print(f"\n[FILE] Target Binary: {exe_path}")
    print(f"       Size: {os.path.getsize(exe_path) / 1024 / 1024:.1f} MB")
    print(f"\n[HASH] Computing SHA-256 hash...")
    sha256_hash = compute_sha256(exe_path)
    print(f"       Hash:    {sha256_hash}")
    print(f"       Version: {APP_VERSION}")

    # Build notes
    notes = f"Auto-registered on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"

    # 2. Check for service account key
    sa_key_path = None
    for p in POSSIBLE_SERVICE_KEYS:
        if os.path.exists(p):
            sa_key_path = os.path.abspath(p)
            break

    success = False
    msg = ""

    if sa_key_path:
        print(f"\n[AUTH] Found service account key: {sa_key_path}")
        print("[INFO] Registering to Firestore using Firebase Admin SDK...")
        success, msg = register_with_service_account(sa_key_path, APP_VERSION, sha256_hash, notes)

    if not success:
        print(f"\n[WARN] Service Account registration: {msg or 'No key found'}")
        print("Falling back to Admin Email & Password login...")
        email = input("Admin/Staff Email: ").strip()
        import getpass
        password = getpass.getpass("Password: ")
        id_token = sign_in_firebase_auth(email, password)
        if not id_token:
            print("[ERROR] Authentication failed. Invalid email or password.")
            sys.exit(1)
        print("[INFO] Authenticated! Writing to Firestore...")
        success, msg = register_with_id_token(id_token, APP_VERSION, sha256_hash, notes)

    if success:
        print("\n" + "=" * 60)
        print("[SUCCESS] Binary hash registered in Firestore!")
        print("=" * 60)
        print(f"   Document:     app_build_hashes/{APP_VERSION}")
        print(f"   SHA-256 Hash: {sha256_hash}")
        print(f"   Notes:        {notes}")
        print(f"   Details:      {msg}")
        print("   Only this exact binary will pass student integrity checks.")
    else:
        print(f"\n[ERROR] FAILED to register hash: {msg}")
        sys.exit(1)
