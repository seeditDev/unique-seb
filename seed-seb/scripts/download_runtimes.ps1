$ProgressPreference = 'SilentlyContinue'

$runtimesDir = "c:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\resources\runtimes"
if (!(Test-Path $runtimesDir)) {
    New-Item -ItemType Directory -Path $runtimesDir | Out-Null
    Write-Host "Created runtimes directory: $runtimesDir"
}

# --- 1. Python Embed ---
Write-Host "Downloading Python Embed (10MB)..."
$pythonZip = Join-Path $runtimesDir "python-embed.zip"
$pythonDest = Join-Path $runtimesDir "python-embed"
if (Test-Path $pythonDest) { Remove-Item $pythonDest -Recurse -Force -ErrorAction SilentlyContinue }
Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip" -OutFile $pythonZip
Write-Host "Extracting Python..."
Expand-Archive -Path $pythonZip -DestinationPath $pythonDest -Force
Remove-Item $pythonZip -Force
Write-Host "Python Embed successfully configured."

# --- 2. w64devkit (C/C++) ---
Write-Host "Downloading w64devkit (78MB)..."
$devkitZip = Join-Path $runtimesDir "w64devkit.zip"
$devkitTemp = Join-Path $runtimesDir "temp_devkit"
$mingwDest = Join-Path $runtimesDir "mingw64"
if (Test-Path $mingwDest) { Remove-Item $mingwDest -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $devkitTemp) { Remove-Item $devkitTemp -Recurse -Force -ErrorAction SilentlyContinue }
Invoke-WebRequest -Uri "https://github.com/skeeto/w64devkit/releases/download/v1.20.0/w64devkit-1.20.0.zip" -OutFile $devkitZip
Write-Host "Extracting w64devkit..."
Expand-Archive -Path $devkitZip -DestinationPath $devkitTemp -Force
if (Test-Path (Join-Path $devkitTemp "w64devkit")) {
    Move-Item -Path (Join-Path $devkitTemp "w64devkit") -Destination $mingwDest
}
Remove-Item $devkitTemp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $devkitZip -Force
Write-Host "w64devkit (MinGW64) successfully configured."

# --- 3. JDK 17 ---
Write-Host "Downloading JDK 17 (158MB)..."
$jdkZip = Join-Path $runtimesDir "jdk.zip"
$jdkTemp = Join-Path $runtimesDir "temp_jdk"
$jdkDest = Join-Path $runtimesDir "jdk"
if (Test-Path $jdkDest) { Remove-Item $jdkDest -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $jdkTemp) { Remove-Item $jdkTemp -Recurse -Force -ErrorAction SilentlyContinue }
Invoke-WebRequest -Uri "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.11_9.zip" -OutFile $jdkZip
Write-Host "Extracting JDK..."
Expand-Archive -Path $jdkZip -DestinationPath $jdkTemp -Force
$extractedJdkDir = Get-ChildItem -Path $jdkTemp -Directory | Select-Object -First 1
if ($extractedJdkDir) {
    Move-Item -Path $extractedJdkDir.FullName -Destination $jdkDest
}
Remove-Item $jdkTemp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $jdkZip -Force
Write-Host "JDK 17 successfully configured."

Write-Host "All portable compilers/runtimes downloaded and configured successfully in resources/runtimes!"
