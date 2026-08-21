@echo off
echo ===================================================
echo SEED-SEB Automated Build Suite
echo ===================================================
echo.

echo Step 1: Installing dependencies...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to install Python dependencies.
    pause
    exit /b 1
)

echo.
echo Step 2: Compiling application to native C++ machine code...
call compile_nuitka.bat
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Nuitka compilation failed.
    pause
    exit /b 1
)

echo.
echo Step 3: Compiling secure setup installer...
call build_inno.bat
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Installer compilation failed.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo BUILD COMPLETED SUCCESSFULLY!
echo Installer is ready: SetupBuild\SEED-SEB-Setup.exe
echo ===================================================
pause
exit /b 0
