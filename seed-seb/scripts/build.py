import os
import sys
import subprocess
import shutil

def run_command(cmd, cwd=None):
    print(f"Running: {' '.join(cmd)} in {cwd or os.getcwd()}")
    res = subprocess.run(cmd, cwd=cwd, shell=True)
    if res.returncode != 0:
        print(f"Error: Command failed with exit code {res.returncode}")
        sys.exit(res.returncode)

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_dir = os.path.join(root_dir, "frontend")
    desktop_dir = os.path.join(root_dir, "desktop")
    
    print("=== STEP 1: Building React Frontend ===")
    if os.path.exists(os.path.join(frontend_dir, "package.json")):
        # Install node modules if missing
        if not os.path.exists(os.path.join(frontend_dir, "node_modules")):
            print("Installing frontend dependencies...")
            run_command(["npm", "install"], cwd=frontend_dir)
            
        print("Compiling production React build...")
        run_command(["npm", "run", "build"], cwd=frontend_dir)
    else:
        print("Warning: frontend/package.json not found. Skipping React compilation.")

    print("\n=== STEP 2: Checking Directories and Seeding Questions ===")
    # Generate questions JSON files
    generator_path = os.path.join(root_dir, "scripts", "generate_questions.py")
    if os.path.exists(generator_path):
        run_command(["python", "scripts/generate_questions.py"], cwd=root_dir)

    print("\n=== STEP 3: Compiling PyQt Application with PyInstaller ===")
    
    # Locate pyinstaller
    pyinstaller_bin = "pyinstaller"
    if shutil.which("pyinstaller") is None:
        print("Warning: PyInstaller is not installed in the current Python environment.")
        print("Please run: pip install pyinstaller pyqt6 PyQt6-WebEngine")
        # Try to install dependencies
        run_command(["pip", "install", "pyinstaller", "pyqt6", "PyQt6-WebEngine"])

    # Build spec options
    # We want a single file executable (-F / --onefile) or a folder directory.
    # The prompt requires: "a single Windows executable named KITE.exe"
    # We add React build and data folders. 
    # NOTE: minGW-w64 and openJDK runtimes are huge. We add resources/assets for icons/splash, 
    # but exclude resources/runtimes from internal packaging so that startup remains instant.
    # The runtimes directory is placed directly next to the executable.
    
    add_data_args = []
    
    # Path format for PyInstaller: source;dest
    frontend_build = os.path.join(frontend_dir, "build")
    if os.path.exists(frontend_build):
        add_data_args.extend(["--add-data", f"{frontend_build};frontend/build"])
        
    data_dir = os.path.join(root_dir, "data")
    if os.path.exists(data_dir):
        add_data_args.extend(["--add-data", f"{data_dir};data"])

    assets_dir = os.path.join(root_dir, "resources", "assets")
    if os.path.exists(assets_dir):
        add_data_args.extend(["--add-data", f"{assets_dir};resources/assets"])

    # Specifying build command
    pyi_cmd = [
        pyinstaller_bin,
        "--noconfirm",
        "--onefile",
        "--windowed", # Hide console
        "--name", "KITE",
        "--workpath", os.path.join(root_dir, "build_pyi"),
        "--distpath", os.path.join(root_dir, "dist"),
        "--specpath", root_dir,
    ]
    
    pyi_cmd.extend(add_data_args)
    pyi_cmd.append(os.path.join(desktop_dir, "main.py"))
    
    run_command(pyi_cmd, cwd=root_dir)

    print("\n=== STEP 4: Creating Runtime Distribution Directory ===")
    dist_dir = os.path.join(root_dir, "dist")
    runtimes_src = os.path.join(root_dir, "resources", "runtimes")
    runtimes_dest = os.path.join(dist_dir, "resources", "runtimes")
    
    # Copy runtimes directory to the dist folder so they reside next to KITE.exe
    if os.path.exists(runtimes_src):
        os.makedirs(os.path.dirname(runtimes_dest), exist_ok=True)
        if os.path.exists(runtimes_dest):
            shutil.rmtree(runtimes_dest)
        print(f"Copying portable runtimes next to executable for distribution...")
        shutil.copytree(runtimes_src, runtimes_dest)
        print("Compilers successfully distributed next to KITE.exe.")
    else:
        print("Note: resources/runtimes folder is empty. During development the executable will look on system PATH.")

    print("\n=======================================================")
    print("Build complete! Output executable is located at:")
    print(f"  {os.path.join(dist_dir, 'KITE.exe')}")
    print("=======================================================")

if __name__ == "__main__":
    main()
