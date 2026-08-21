@echo off
echo ===================================================
echo SEED-SEB Native C++ Compilation using Nuitka
echo ===================================================
echo.

:: Sync latest source files from desktop folder cleanly
echo Syncing latest source files from desktop folder...
if exist "app_source" rmdir /s /q "app_source"
mkdir "app_source"
if exist "..\desktop" (
    xcopy /E /I /Y "..\desktop" "app_source"
)
if not exist "app_source\SEED_Logo.ico" (
    if exist "SEED_Logo.ico" copy /Y "SEED_Logo.ico" "app_source\SEED_Logo.ico"
)

:: Clean old build outputs
if exist dist rmdir /s /q dist
if exist main.build rmdir /s /q main.build
if exist main.dist rmdir /s /q main.dist
if exist SEED-SEB.build rmdir /s /q SEED-SEB.build
if exist SEED-SEB.dist rmdir /s /q SEED-SEB.dist

echo Starting compilation of main.py (this might take several minutes)...
py -3.11 -m nuitka --standalone --windows-console-mode=disable --windows-uac-admin --enable-plugin=pyqt6 --windows-icon-from-ico=app_source\SEED_Logo.ico --output-dir=dist --output-filename=SEED-SEB app_source\main.py

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Nuitka compilation failed.
    exit /b 1
)

:: Nuitka outputs the executable SEED-SEB.exe inside dist\main.dist folder.
:: Rename dist\main.dist to dist\SEED-SEB to match the application name.
if exist dist\main.dist (
    echo Renaming output directory to dist\SEED-SEB...
    rename dist\main.dist SEED-SEB
)

:: Copy required folder resources into dist\SEED-SEB\ relative to the executable

echo Locating and copying data folder...
set "DATA_SRC="
if exist "..\data" (
    set "DATA_SRC=..\data"
) else if exist "..\..\seed-website-desktop-edition\data" (
    set "DATA_SRC=..\..\seed-website-desktop-edition\data"
) else if exist "C:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\data" (
    set "DATA_SRC=C:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\data"
)

if not "%DATA_SRC%"=="" (
    echo Copying data from %DATA_SRC% to dist\SEED-SEB\data...
    xcopy /E /I /Y "%DATA_SRC%" "dist\SEED-SEB\data"
) else (
    echo WARNING: data folder not found anywhere!
)

echo Locating and copying resources folder...
set "RESOURCES_SRC="
if exist "..\resources" (
    set "RESOURCES_SRC=..\resources"
) else if exist "..\..\seed-website-desktop-edition\resources" (
    set "RESOURCES_SRC=..\..\seed-website-desktop-edition\resources"
) else if exist "C:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\resources" (
    set "RESOURCES_SRC=C:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\resources"
)

if not "%RESOURCES_SRC%"=="" (
    echo Copying resources from %RESOURCES_SRC% to dist\SEED-SEB\resources...
    xcopy /E /I /Y "%RESOURCES_SRC%" "dist\SEED-SEB\resources"
) else (
    echo WARNING: resources folder not found anywhere!
)

echo Locating and copying runtimes folder...
set "RUNTIMES_SRC="
if exist "..\..\runtimes" (
    set "RUNTIMES_SRC=..\..\runtimes"
) else if exist "..\runtimes" (
    set "RUNTIMES_SRC=..\runtimes"
) else if exist "C:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\runtimes" (
    set "RUNTIMES_SRC=C:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\runtimes"
)

if not "%RUNTIMES_SRC%"=="" (
    echo Copying runtimes from %RUNTIMES_SRC% to dist\SEED-SEB\resources\runtimes...
    robocopy "%RUNTIMES_SRC%" "dist\SEED-SEB\resources\runtimes" /E /NFL /NDL /NP /R:3 /W:1
    if errorlevel 8 (
        echo ERROR: Robocopy failed copying runtimes.
        exit /b 1
    )
) else (
    echo WARNING: runtimes folder not found anywhere!
)

echo Copying qwebchannel.js into distribution...
if exist "..\frontend\public\qwebchannel.js" (
    copy /Y "..\frontend\public\qwebchannel.js" "dist\SEED-SEB\qwebchannel.js"
    if not exist "dist\SEED-SEB\public" mkdir "dist\SEED-SEB\public"
    copy /Y "..\frontend\public\qwebchannel.js" "dist\SEED-SEB\public\qwebchannel.js"
) else if exist "..\build\qwebchannel.js" (
    copy /Y "..\build\qwebchannel.js" "dist\SEED-SEB\qwebchannel.js"
)

echo.
echo Native compilation and resource staging completed successfully!
echo Binary distribution is ready at dist\SEED-SEB\
exit /b 0
