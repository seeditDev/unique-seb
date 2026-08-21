# SEED-SEB Secure Installer Build Suite

This directory contains the automated scripts and configuration to compile, secure, and package the **SEED-SEB Secure Assessment Browser** PyQt application into a locked-down Windows Setup installer.

## Dual-Layer Technical Security Architecture

To prevent source code leaks, reverse engineering, and user-end malpractice, the application is packaged and deployed with two layers of security:

### Layer 1: Native C++ Compilation (Nuitka)
Standard Python packaging tools (like PyInstaller) pack raw Python bytecode (`.pyc` files) into the binary, which can easily be extracted and decompiled using online tools or simple scripts.
- **Nuitka Solution:** Nuitka translates Python source code into optimized native C++ code, compiles it using a local C++ compiler (e.g., Microsoft Visual C++), and produces standalone machine code. There is no raw Python code or bytecode present in the final binary, making decompilation virtually impossible.

### Layer 2: Folder ACL Lockout and Hiding (Inno Setup)
Even with a compiled binary, users could browse the installation folder, inspect resource assets, copy auxiliary DLLs, or access local files.
- **Lockout Solution:** The `setup.iss` Inno Setup script runs custom `icacls` post-installation commands using language-independent Windows Security Identifiers (SIDs) to strictly lock down permissions on the installation directory (`{commonpf}\SEED-SEB`):
  1. Hides the installation folder: `attrib +h +s "{app}"` (system-hidden).
  2. Disables inheritance to strip general read permissions.
  3. Grants **Administrators** (`*S-1-5-32-544`) and **SYSTEM** (`*S-1-5-18`) Full Access.
  4. Grants standard **Users** (`*S-1-5-32-545`) inherit-only Read/Execute (`(OI)(CI)(IO)RX`) on files *inside* the folder, but denies listing/browsing the installation folder itself (`List Directory / Read Data` permission is omitted, granting only `Rc,S,X`).
  
This makes the directory completely blind to standard users (they cannot open it or list its files), while allowing the OS loader to successfully read and execute `SEED-SEB.exe` and its dependencies.

---

## Build Prerequisites

To run the compiler suite on Windows, you must install:
1. **Python 3.10+ (x64)** (Ensure "Add Python to PATH" is checked during installation).
2. **Microsoft Visual C++ Build Tools** (Highly recommended for Nuitka, download from Microsoft website, selecting "C++ Build Tools" workload).
3. **Inno Setup 6** (Free installer builder, download and install from: [Inno Setup Downloads](https://jrsoftware.org/isdl.php)).

---

## Quick-Start Build Instructions

To build the executable and installer in one go:
1. Open PowerShell or Command Prompt as **Administrator** (necessary to run Inno Setup and Nuitka successfully).
2. Navigate to the `SetupBuild` directory.
3. Run the automated script:
   ```cmd
   build_all.bat
   ```

This batch script will automatically:
- Install all required Python packages.
- Compile the PyQt application into native machine code under `dist/SEED-SEB/`.
- Compile the installer package into `SEED-SEB-Setup.exe` in the current directory.
