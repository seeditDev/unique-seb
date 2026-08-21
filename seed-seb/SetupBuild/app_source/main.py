import os
import sys

# Disable Chromium sandbox to allow loading dependencies/runtimes in secure layouts
os.environ["QTWEBENGINE_DISABLE_SANDBOX"] = "1"

# Ensure the directory containing this script is in sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

import logging
import http.server
import socketserver
import threading
import time
import random
import requests
import cv2
import psutil
import keyboard
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QSplashScreen, QMessageBox, 
    QDialog, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QProgressBar, QWidget
)
from PyQt6.QtCore import QUrl, QEvent, QObject, pyqtSlot, QTimer, Qt, QThread, QSize
from PyQt6.QtGui import QPixmap, QIcon, QKeySequence, QFont
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile, QWebEngineScript, QWebEnginePage
from PyQt6.QtWebChannel import QWebChannel

from bridge import DesktopBridge
from runtime_manager import runtime_manager
from assessment_engine import assessment_engine

# Configure logging to both file and console
log_dir = os.path.join(runtime_manager.app_root, "data", "student")
try:
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "app.log")
    
    # file_handler = logging.FileHandler(log_file, encoding='utf-8')
    console_handler = logging.StreamHandler(sys.stdout)
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[console_handler]
    )
except Exception as e:
    # Fallback to basic console logging if directory creation/write fails
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    logging.warning(f"Failed to initialize file logging: {e}")

logging.info("Application starting up...")

# App version
CURRENT_VERSION = "1.0.4"

# - Binary Integrity Check -
# Computes SHA-256 hash of the running EXE and validates it against the server.
# Even if a student has admin rights and modifies the EXE, the server will
# reject their session because the hash won't match the official build.
# This is the correct security model for exam software on student-owned laptops.

def compute_exe_hash():
    """Calculate SHA-256 hash of the running executable."""
    import hashlib
    exe_path = sys.executable if getattr(sys, 'frozen', False) else None
    # When compiled with Nuitka, sys.executable points to SEED-SEB.exe itself
    if not exe_path or not os.path.exists(exe_path):
        # Fallback: try to find the exe next to this script
        exe_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "SEED-SEB.exe")
    if not exe_path or not os.path.exists(exe_path):
        return None
    sha256 = hashlib.sha256()
    try:
        with open(exe_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    except Exception as e:
        logging.warning(f"Could not hash executable: {e}")
        return None

def verify_binary_integrity():
    """
    Verify the running executable against the Firestore-registered hash.

    Logic:
    - Compute SHA-256 of the running EXE.
    - Query Firebase Firestore document app_build_hashes/{CURRENT_VERSION}
    - If the document exists AND sha256_hash matches AND is_active = true -> allow launch.
    - If document does not match or is revoked -> BLOCK.
    - If Firestore is UNREACHABLE (network error) -> fail-open (offline grace).
    - If not running as a compiled exe (no sys.executable path) -> skip check.
    """
    exe_hash = compute_exe_hash()
    if not exe_hash:
        logging.info("Integrity check skipped: not running as compiled executable.")
        return True

    logging.info(f"Binary integrity hash: {exe_hash[:16]}...  (validating against Firestore)")

    url = (
        f"https://firestore.googleapis.com/v1/projects/{FIREBASE_CONFIG['projectId']}/databases/(default)/"
        f"documents/app_build_hashes/{CURRENT_VERSION}"
    )
    params = {"key": FIREBASE_CONFIG["apiKey"]}

    try:
        resp = requests.get(url, params=params, timeout=8)

        if resp.status_code == 200:
            doc = resp.json()
            fields = doc.get("fields", {})
            registered_hash = fields.get("sha256_hash", {}).get("stringValue", "").lower()
            is_active = fields.get("is_active", {}).get("booleanValue", True)

            if registered_hash and registered_hash == exe_hash.lower() and is_active:
                logging.info("Binary integrity check PASSED (hash verified in Firestore).")
                return True
            else:
                logging.error(
                    f"INTEGRITY VIOLATION: Hash {exe_hash[:16]}... does not match "
                    f"registered hash in Firestore (revoked or unregistered binary). Version={CURRENT_VERSION}"
                )
                return False

        elif resp.status_code == 404:
            logging.warning(
                f"Integrity check: No hash document found in Firestore for version {CURRENT_VERSION} - "
                f"allowing launch."
            )
            return True

        else:
            logging.warning(
                f"Integrity check: Firestore returned HTTP {resp.status_code} - "
                f"failing open to preserve availability."
            )
            return True

    except Exception as e:
        logging.info(f"Integrity check skipped (Firestore unreachable): {e}")
        return True


# Firebase Configuration
FIREBASE_CONFIG = {
    "apiKey": "AIzaSyANO2d-RUXV0x5fvTjRT1UkpssP-T_Qz1Q",
    "authDomain": "daily-tracker-a4092.firebaseapp.com",
    "projectId": "daily-tracker-a4092",
    "storageBucket": "daily-tracker-a4092.firebasestorage.app",
    "messagingSenderId": "1023352927583",
    "appId": "1:1023352927583:web:2f0234b40a448390b6b2ea",
    "measurementId": "G-G9GDW34WTS"
}

# Forbidden background processes to terminate
FORBIDDEN_PROCESSES = [
    # Browsers
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
    'opera.exe', 'opera_gx.exe', 'vivaldi.exe', 'chromium.exe',
    'iexplore.exe', 'torch.exe', 'maxthon.exe', 'tor.exe', 'tor-browser.exe',
    # Remote Access / Screen Sharing / Display Streaming
    'AnyDesk.exe', 'TeamViewer.exe', 'TeamViewer_Service.exe',
    'RustDesk.exe', 'UltraViewer.exe', 'DWAgent.exe',
    'ChromeRemoteDesktop.exe', 'LogMeIn.exe', 'Splashtop.exe',
    'ZohoAssist.exe', 'RemotePC.exe', 'GoToAssist.exe',
    'parsec.exe', 'parsecd.exe', 'moonlight.exe', 'sunshine.exe', 'deskreen.exe',
    'spacedeskService.exe', 'spacedeskViewer.exe', 'vncviewer.exe', 'vncserver.exe',
    'tvnserver.exe', 'winvnc.exe', 'nomachine.exe', 'scrcpy.exe', 'awe_client.exe',
    'awe_service.exe', 'ToDesk.exe', 'ToDesk_Service.exe',
    # Messaging / Chat
    'WhatsApp.exe', 'Telegram.exe', 'Signal.exe', 'Viber.exe',
    'WeChat.exe', 'Line.exe', 'KakaoTalk.exe', 'Slack.exe', 'Discord.exe',
    # Video Meetings
    'Teams.exe', 'ms-teams.exe', 'Zoom.exe', 'Skype.exe', 'Webex.exe',
    # IDEs / Code Editors
    'Code.exe', 'code.exe', 'eclipse.exe', 'idea64.exe', 'pycharm64.exe',
    'webstorm64.exe', 'androidstudio.exe', 'netbeans.exe', 'sublime_text.exe',
    'notepad++.exe', 'notepad.exe', 'cursor.exe', 'windsurf.exe',
    # AI Tools / Assistants / Local LLMs
    'ChatGPT.exe', 'chatgpt.exe', 'Copilot.exe', 'BingChat.exe',
    'Claude.exe', 'Perplexity.exe', 'Replit.exe',
    'ollama.exe', 'ollama_app.exe', 'lmstudio.exe', 'jan.exe',
    'gpt4all.exe', 'localai.exe', 'text-generation-webui.exe', 'anythingllm.exe',
    # Reverse Proxies & Tunnels (Bypassing network / firewall controls)
    'ngrok.exe', 'cloudflared.exe', 'localtunnel.exe', 'frpc.exe', 'playit.exe', 'bore.exe',
    # Screen Recording / Streaming
    'obs64.exe', 'obs32.exe', 'Streamlabs.exe', 'XSplit.exe', 'Bandicam.exe',
    'Camtasia.exe', 'ShareX.exe', 'Snagit32.exe', 'Snagit64.exe', 'Loom.exe',
    # Virtual Machines / Emulators
    'vmware.exe', 'vmplayer.exe', 'VirtualBox.exe', 'VBoxHeadless.exe',
    'Bluestacks.exe', 'Nox.exe', 'LDPlayer.exe', 'Genymotion.exe',
    # Windows Subsystem for Linux (WSL)
    'wsl.exe', 'wslhost.exe', 'wslclient.exe', 'wsl-service.exe',
    'wslservice.exe', 'vmmem', 'vmmemWSL', 'bash.exe', 'sh.exe',
    # Debuggers / Reverse Engineering / Cheat Tools
    'x64dbg.exe', 'x32dbg.exe', 'ollydbg.exe', 'windbg.exe', 'ida64.exe', 'ida.exe',
    'ghidra.exe', 'radare2.exe', 'cutter.exe', 'dnspy.exe', 'procmon.exe',
    'procexp.exe', 'wireshark.exe', 'fiddler.exe', 'burpsuite.exe',
    'cheatengine.exe', 'cheatengine-x86_64.exe', 'cheatengine-i386.exe',
    'processhacker.exe', 'systeminformer.exe', 'ProcessHacker.exe', 'SystemInformer.exe',
    'speedfan.exe', 'artmoney.exe', 'hxD.exe',
    'python.exe', 'python3.exe', 'pythonw.exe',
    # Office Suites & PDF Readers (potential malpractice sources)
    'wps.exe', 'wpp.exe', 'et.exe', 'wpspdf.exe', 'wpscenter.exe', 'wpscloudlaunch.exe',
    'winword.exe', 'excel.exe', 'powerpnt.exe', 'onenote.exe', 'outlook.exe',
    'Acrobat.exe', 'AcroRd32.exe', 'FoxitReader.exe', 'FoxitPDFReader.exe',
    'SumatraPDF.exe', 'NitroPDF.exe', 'soffice.exe', 'soffice.bin', 'pdf24.exe',
    # Terminals / Command Prompts (attacker-accessible)
    'cmd.exe', 'powershell.exe', 'pwsh.exe', 'WindowsTerminal.exe', 'wt.exe',
    'conhost.exe', 'mintty.exe', 'putty.exe', 'kitty.exe', 'SecureCRT.exe'
]


class ReactHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler that serves React build files and falls back to index.html for client routing."""
    def translate_path(self, path):
        translated = super().translate_path(path)
        if not os.path.exists(translated):
            base_dir = self.directory if hasattr(self, 'directory') else os.getcwd()
            if '.' not in os.path.basename(translated):
                return os.path.join(base_dir, "index.html")
        return translated

    def log_message(self, format, *args):
        logging.info("[LocalServer] " + (format % args))


class StyledJSDialog(QDialog):
    """Academic Light-themed branded dialog for JavaScript alert() and confirm() calls.
    Replaces the plain native QMessageBox with a styled SEED-SEB popup."""
    def __init__(self, title="SEED-IT", message="", confirm_mode=False, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setModal(True)
        self.setFixedSize(450, 220)
        self._build_ui(title, message, confirm_mode)

    def _build_ui(self, title, message, confirm_mode):
        self.setObjectName("styledJSDialog")
        self.setStyleSheet("""
            QDialog#styledJSDialog {
                background-color: #ffffff;
                border: 1.5px solid #e2e8f0;
                border-radius: 14px;
            }
            QLabel#titleLabel {
                color: #0f172a;
                font-size: 15px;
                font-weight: 700;
                background: transparent;
                border: none;
            }
            QLabel#msgLabel {
                color: #475569;
                font-size: 13px;
                line-height: 1.4;
                background: transparent;
                border: none;
            }
            QPushButton {
                border-radius: 8px;
                padding: 8px 22px;
                font-size: 13px;
                font-weight: 600;
                border: none;
            }
            QPushButton#okBtn {
                background-color: #15803d;
                color: #ffffff;
            }
            QPushButton#okBtn:hover { background-color: #166534; }
            QPushButton#yesBtn {
                background-color: #15803d;
                color: #ffffff;
            }
            QPushButton#yesBtn:hover { background-color: #166534; }
            QPushButton#noBtn {
                background-color: #f1f5f9;
                color: #475569;
                border: 1px solid #cbd5e1;
            }
            QPushButton#noBtn:hover { background-color: #e2e8f0; color: #0f172a; }
        """)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 22)
        layout.setSpacing(14)

        # Title row
        title_row = QHBoxLayout()
        title_lbl = QLabel(title)
        title_lbl.setObjectName("titleLabel")
        title_row.addWidget(title_lbl)
        title_row.addStretch()
        layout.addLayout(title_row)

        # Message
        msg_lbl = QLabel(message)
        msg_lbl.setObjectName("msgLabel")
        msg_lbl.setWordWrap(True)
        layout.addWidget(msg_lbl)

        layout.addStretch()

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        if confirm_mode:
            no_btn = QPushButton("Cancel")
            no_btn.setObjectName("noBtn")
            no_btn.clicked.connect(self.reject)
            yes_btn = QPushButton("Confirm")
            yes_btn.setObjectName("yesBtn")
            yes_btn.clicked.connect(self.accept)
            btn_row.addWidget(no_btn)
            btn_row.addWidget(yes_btn)
        else:
            ok_btn = QPushButton("OK")
            ok_btn.setObjectName("okBtn")
            ok_btn.clicked.connect(self.accept)
            btn_row.addWidget(ok_btn)
        layout.addLayout(btn_row)


class CustomWebEnginePage(QWebEnginePage):
    """Custom QWebEnginePage to redirect JavaScript console output to Python log file."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.featurePermissionRequested.connect(self.handleFeaturePermissionRequested)

    def handleFeaturePermissionRequested(self, securityOrigin, feature):
        logging.info(f"Permission requested by origin {securityOrigin.toString()} for feature {feature}")
        self.setFeaturePermission(securityOrigin, feature, QWebEnginePage.PermissionPolicy.PermissionGrantedByUser)

    def javaScriptConsoleMessage(self, level, message, line, source_id):
        logging.info(f"[JS Console] Line {line} ({source_id}): {message}")

    def javaScriptAlert(self, securityOrigin, msg):
        """Replace native alert() popup with styled SEED-IT dialog."""
        dlg = StyledJSDialog(title="SEED-IT Notice", message=msg, confirm_mode=False)
        dlg.exec()

    def javaScriptConfirm(self, securityOrigin, msg):
        """Replace native confirm() popup with styled SEED-IT dialog."""
        dlg = StyledJSDialog(title="SEED-IT Confirmation", message=msg, confirm_mode=True)
        return dlg.exec() == QDialog.DialogCode.Accepted


class CustomWebEngineView(QWebEngineView):
    """Custom QWebEngineView to block right-clicks and control devtools."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setPage(CustomWebEnginePage(self))
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        
        # Set custom HTTP User-Agent to allow frontend detection
        profile = self.page().profile()
        profile.setHttpUserAgent(profile.httpUserAgent() + " SEEDSEB")

    def contextMenuEvent(self, event):
        event.accept()


class PreLaunchDialog(QDialog):
    """Pre-launch dialog that checks system requirements before starting the secure browser.
    Redesigned in SEED-SEB Academic White theme with strict security & version checking."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("SEED-SEB Launch Check")
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint)
        self.setModal(True)
        self.setFixedSize(640, 520)
        
        self.checks_passed = False
        self.version_check_passed = False
        self.camera_check_passed = False
        self.internet_check_passed = False
        self.mic_check_passed = False        # warning-only (non-blocking)
        self.debugger_check_passed = True    # must pass  blocks launch if debugger found
        
        self.drag_position = None
        self.init_ui()

    def init_ui(self):
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        
        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(10, 10, 10, 10)
        
        self.main_frame = QWidget(self)
        self.main_frame.setObjectName("mainFrame")
        self.main_frame.setStyleSheet("""
            QWidget#mainFrame {
                background-color: #ffffff;
                border: 1.5px solid #e2e8f0;
                border-radius: 16px;
            }
        """)
        outer_layout.addWidget(self.main_frame)
        
        layout = QVBoxLayout(self.main_frame)
        layout.setContentsMargins(32, 28, 32, 28)
        layout.setSpacing(16)
        
        # Header with Logo & Brand Title
        header_layout = QHBoxLayout()
        header_layout.setSpacing(12)
        
        logo_label = QLabel()
        logo_path = None
        for candidate in [
            os.path.join(script_dir, "..", "frontend", "public", "SEED_Logo_Transparent.png"),
            os.path.join(runtime_manager.app_root, "frontend", "public", "SEED_Logo_Transparent.png"),
            os.path.join(runtime_manager.app_root, "SEED_Logo_Transparent.png"),
            os.path.join(script_dir, "SEED_Logo_Transparent.png"),
            os.path.join(script_dir, "SEED_Logo.ico"),
        ]:
            if os.path.exists(candidate):
                logo_path = candidate
                break

        if logo_path:
            pixmap = QPixmap(logo_path)
            if not pixmap.isNull():
                scaled_pixmap = pixmap.scaled(38, 38, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                logo_label.setPixmap(scaled_pixmap)
                logo_label.setStyleSheet("border: none; background: transparent;")
                header_layout.addWidget(logo_label)

        title_box = QVBoxLayout()
        title_box.setSpacing(2)
        
        brand_title = QLabel("<b><span style='color: #0f172a;'>SEED </span><span style='color: #15803d;'>SEB</span></b>")
        brand_title.setStyleSheet("font-size: 20px; font-weight: 800; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        
        brand_subtitle = QLabel("Secure Examination Browser • System Readiness Check")
        brand_subtitle.setStyleSheet("color: #64748b; font-size: 12px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        
        title_box.addWidget(brand_title)
        title_box.addWidget(brand_subtitle)
        header_layout.addLayout(title_box)
        header_layout.addStretch()
        layout.addLayout(header_layout)
        
        # Security notice banner
        self.warning_banner = QWidget()
        self.warning_banner.setObjectName("warningBanner")
        self.warning_banner.setStyleSheet("""
            QWidget#warningBanner {
                background-color: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
            }
        """)
        warning_layout = QHBoxLayout(self.warning_banner)
        warning_layout.setContentsMargins(14, 10, 14, 10)
        
        warning_text = QLabel("<b>Security Protocol:</b> Academic proctoring active. External communication, secondary displays, and desktop shortcuts will be secured.")
        warning_text.setWordWrap(True)
        warning_text.setStyleSheet("color: #475569; font-size: 12px; line-height: 1.4; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        warning_layout.addWidget(warning_text)
        layout.addWidget(self.warning_banner)
        
        # Status container
        status_container = QWidget()
        status_container.setObjectName("statusContainer")
        status_container.setStyleSheet("""
            QWidget#statusContainer {
                background-color: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
            }
        """)
        status_layout = QVBoxLayout(status_container)
        status_layout.setContentsMargins(20, 16, 20, 16)
        status_layout.setSpacing(12)
        
        self.version_label = QLabel("• Verifying application version...")
        self.version_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        status_layout.addWidget(self.version_label)
        
        self.internet_label = QLabel("• Verifying network connection...")
        self.internet_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        status_layout.addWidget(self.internet_label)
        
        self.camera_label = QLabel("• Checking camera device access...")
        self.camera_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        status_layout.addWidget(self.camera_label)
        
        self.mic_label = QLabel("• Checking audio microphone access...")
        self.mic_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        status_layout.addWidget(self.mic_label)
        
        self.debugger_label = QLabel("• Scanning system process integrity...")
        self.debugger_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        status_layout.addWidget(self.debugger_label)
        
        layout.addWidget(status_container)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setMaximum(5)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: none;
                border-radius: 3px;
                background-color: #e2e8f0;
                height: 6px;
            }
            QProgressBar::chunk {
                background-color: #15803d;
                border-radius: 3px;
            }
        """)
        layout.addWidget(self.progress_bar)
        
        # Buttons Row
        buttons_layout = QHBoxLayout()
        buttons_layout.setSpacing(12)
        
        self.close_button = QPushButton("Close")
        self.close_button.setStyleSheet("""
            QPushButton {
                background-color: #ffffff;
                color: #475569;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                padding: 10px 22px;
                font-size: 13px;
                font-weight: 600;
                font-family: 'Segoe UI', sans-serif;
            }
            QPushButton:hover {
                background-color: #f1f5f9;
                color: #0f172a;
                border-color: #94a3b8;
            }
        """)
        self.close_button.clicked.connect(self.reject)
        
        self.launch_button = QPushButton("Launch Application")
        self.launch_button.setEnabled(False)
        self.launch_button.setStyleSheet("""
            QPushButton {
                background-color: #e2e8f0;
                color: #94a3b8;
                border: none;
                border-radius: 8px;
                padding: 10px 26px;
                font-size: 13px;
                font-weight: 700;
                font-family: 'Segoe UI', sans-serif;
            }
            QPushButton:enabled {
                background-color: #15803d;
                color: #ffffff;
            }
            QPushButton:enabled:hover {
                background-color: #166534;
            }
        """)
        self.launch_button.clicked.connect(self.accept)
        
        buttons_layout.addStretch()
        buttons_layout.addWidget(self.close_button)
        buttons_layout.addWidget(self.launch_button)
        layout.addLayout(buttons_layout)
        
        self.error_label = QLabel("")
        self.error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.error_label.setStyleSheet("""
            color: #b91c1c;
            font-size: 12px;
            font-weight: 600;
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            padding: 8px 14px;
            border-radius: 8px;
            font-family: 'Segoe UI', sans-serif;
        """)
        self.error_label.hide()
        layout.addWidget(self.error_label)
        
        QTimer.singleShot(500, self.perform_checks)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self.drag_position)
            event.accept()

    def perform_checks(self):
        self.check_internet()
        self.check_camera()
        self.check_microphone()
        self.check_debuggers()
        if self.internet_check_passed:
            self.check_version()
        else:
            self.version_check_passed = False
            self.version_label.setText(" <b>Application Version:</b> Check failed (no internet)")
            self.version_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
            self.progress_bar.setValue(self.progress_bar.value() + 1)
        self.update_launch_button()

    def check_internet(self):
        try:
            r = requests.get("https://www.google.com", timeout=5)
            if r.status_code == 200:
                self.internet_check_passed = True
                self.internet_label.setText(" <b>Internet Connection:</b> Active & Stable")
                self.internet_label.setStyleSheet("color: #15803d; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
                self.progress_bar.setValue(self.progress_bar.value() + 1)
            else:
                self.internet_check_passed = False
                self.internet_label.setText(" <b>Internet Connection:</b> Limited connection")
                self.internet_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        except Exception as e:
            self.internet_check_passed = False
            self.internet_label.setText(" <b>Internet Connection:</b> Connection failed")
            self.internet_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")

    def check_camera(self):
        try:
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                self.camera_check_passed = True
                self.camera_label.setText(" <b>Camera Device:</b> Ready & Available")
                self.camera_label.setStyleSheet("color: #15803d; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
                self.progress_bar.setValue(self.progress_bar.value() + 1)
                cap.release()
            else:
                self.camera_check_passed = False
                self.camera_label.setText(" <b>Camera Device:</b> No camera detected")
                self.camera_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        except Exception as e:
            self.camera_check_passed = False
            self.camera_label.setText(" <b>Camera Device:</b> Permission denied or unavailable")
            self.camera_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")

    def check_microphone(self):
        """Check if a microphone is accessible. Warning-only (non-blocking)."""
        mic_found = False
        try:
            import pyaudio
            pa = pyaudio.PyAudio()
            for i in range(pa.get_device_count()):
                info = pa.get_device_info_by_index(i)
                if info.get('maxInputChannels', 0) > 0:
                    mic_found = True
                    break
            pa.terminate()
        except ImportError:
            try:
                import ctypes
                num_devs = ctypes.windll.winmm.waveInGetNumDevs()
                mic_found = num_devs > 0
            except Exception:
                mic_found = False
        except Exception:
            mic_found = False

        self.mic_check_passed = True  # non-blocking
        if mic_found:
            self.mic_label.setText(" <b>Microphone:</b> Detected & Ready")
            self.mic_label.setStyleSheet("color: #15803d; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        else:
            self.mic_label.setText(" <b>Microphone:</b> Not detected (audio proctoring limited)")
            self.mic_label.setStyleSheet("color: #d97706; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        self.progress_bar.setValue(self.progress_bar.value() + 1)

    def check_debuggers(self):
        """Scan for debuggers attached to this process and kill any FORBIDDEN_PROCESSES already running."""
        threats_found = []

        try:
            import ctypes
            if ctypes.windll.kernel32.IsDebuggerPresent():
                threats_found.append('Debugger attached to process')
                logging.critical('[Security] Debugger detected via IsDebuggerPresent!')
        except Exception:
            pass

        mypid = os.getpid()
        SAFE_SYSTEM_BINARIES = {
            'cmd.exe', 'powershell.exe', 'pwsh.exe', 'conhost.exe',
            'windowsterminal.exe', 'wt.exe', 'python.exe', 'python3.exe', 'pythonw.exe'
        }
        killed = []
        for proc in psutil.process_iter(attrs=['pid', 'name']):
            try:
                name = proc.info.get('name', '')
                pid = proc.info.get('pid')
                if not name or not pid or pid == mypid:
                    continue
                if is_descendant(pid, mypid):
                    continue
                name_lower = name.lower()
                if name_lower in SAFE_SYSTEM_BINARIES:
                    continue
                if name_lower in [p.lower() for p in FORBIDDEN_PROCESSES]:
                    psutil.Process(pid).terminate()
                    killed.append(name)
                    logging.warning(f'[Security] Pre-launch terminated: {name}')
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        if threats_found:
            self.debugger_check_passed = False
            self.debugger_label.setText(f" <b>Process Integrity:</b> Debugger detected ({threats_found[0]})")
            self.debugger_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
            self.show_error('Debugger detected. Please close all debugging tools and restart.')
        else:
            self.debugger_check_passed = True
            if killed:
                unique_killed = list(set(killed))
                detail = ', '.join(unique_killed[:3])
                self.debugger_label.setText(f" <b>Process Integrity:</b> Cleaned background apps ({detail})")
                self.debugger_label.setStyleSheet("color: #15803d; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
            else:
                self.debugger_label.setText(" <b>Process Integrity:</b> System secure (No threats)")
                self.debugger_label.setStyleSheet("color: #15803d; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
        self.progress_bar.setValue(self.progress_bar.value() + 1)

    def check_version(self):
        try:
            url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_CONFIG['projectId']}/databases/(default)/documents/version_seedit"
            response = requests.get(url, params={"key": FIREBASE_CONFIG["apiKey"]}, timeout=10)
            if response.status_code == 200:
                data = response.json()
                documents = data.get("documents", [])
                if documents:
                    doc = documents[0]
                    fields = doc.get("fields", {})
                    version_id = fields.get("versionId", {}).get("stringValue")
                    if version_id:
                        if version_id == CURRENT_VERSION:
                            self.version_check_passed = True
                            self.version_label.setText(f" <b>Application Version:</b> v{CURRENT_VERSION} (Up to date)")
                            self.version_label.setStyleSheet("color: #15803d; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
                        else:
                            self.version_check_passed = False
                            self.version_label.setText(f" <b>Application Version:</b> Outdated (Installed: v{CURRENT_VERSION} • Required: v{version_id})")
                            self.version_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
                            self.show_error(f"Application update required: Please upgrade to version {version_id}.")
                    else:
                        self.version_check_passed = False
                        self.version_label.setText(f" <b>Application Version:</b> Version configuration missing")
                        self.version_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
                        self.show_error("Could not verify application version with server.")
                else:
                    self.version_check_passed = False
                    self.version_label.setText(f" <b>Application Version:</b> Version record not found")
                    self.version_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
                    self.show_error("Version record not found on server.")
            else:
                self.version_check_passed = False
                self.version_label.setText(f" <b>Application Version:</b> Server verification failed (HTTP {response.status_code})")
                self.version_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
                self.show_error(f"Version check failed with status {response.status_code}.")
        except Exception as e:
            self.version_check_passed = False
            self.version_label.setText(f" <b>Application Version:</b> Network check error")
            self.version_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent; font-family: 'Segoe UI', sans-serif;")
            self.show_error("Could not reach version verification service.")
        self.progress_bar.setValue(self.progress_bar.value() + 1)

    def update_launch_button(self):
        if self.internet_check_passed and self.version_check_passed and self.debugger_check_passed:
            self.checks_passed = True
            self.launch_button.setEnabled(True)
            self.launch_button.setText("Launch Application")
        else:
            self.checks_passed = False
            self.launch_button.setEnabled(False)
            failed = []
            if not self.internet_check_passed:
                failed.append("Internet")
            if not self.version_check_passed:
                failed.append("Version")
            if not self.debugger_check_passed:
                failed.append("Security")
            self.launch_button.setText(f" Cannot Launch ({', '.join(failed)} required)")

    def show_error(self, message):
        self.error_label.setText(f" {message}")
        self.error_label.show()



def is_descendant(pid, parent_pid):
    """Check if a process is a descendant of parent_pid or runs from app directories."""
    try:
        # Check parent-child hierarchy
        curr_pid = pid
        visited = set()
        while curr_pid and curr_pid > 0 and curr_pid not in visited:
            if curr_pid == parent_pid:
                return True
            visited.add(curr_pid)
            p = psutil.Process(curr_pid)
            curr_pid = p.ppid()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

    try:
        # Fallback path check
        p = psutil.Process(pid)
        exe_path = p.exe()
        if exe_path:
            exe_path_lower = exe_path.lower()
            app_root_lower = runtime_manager.app_root.lower()
            if app_root_lower in exe_path_lower:
                return True
    except (psutil.NoSuchProcess, psutil.AccessDenied, AttributeError):
        pass

    return False


class ProcessTerminationThread(QThread):
    """Background daemon thread to continuously terminate unauthorized software (browsers, discord, OBS, VMs etc)"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.stopped = False

    def stop(self):
        self.stopped = True

    def run(self):
        mypid = os.getpid()
        forbidden_lower = {p.lower() for p in FORBIDDEN_PROCESSES}
        SAFE_SYSTEM_BINARIES = {
            'cmd.exe', 'powershell.exe', 'pwsh.exe', 'conhost.exe',
            'windowsterminal.exe', 'wt.exe', 'python.exe', 'python3.exe', 'pythonw.exe'
        }
        while not self.stopped:
            for proc in psutil.process_iter(attrs=['pid', 'name']):
                name = proc.info.get('name')
                if name:
                    name_lower = name.lower()
                    if name_lower in SAFE_SYSTEM_BINARIES:
                        continue
                    if name_lower in forbidden_lower:
                        pid = proc.info['pid']
                        if pid == mypid or is_descendant(pid, mypid):
                            continue
                        try:
                            p = psutil.Process(pid)
                            p.terminate()
                            logging.warning(f"Terminated unauthorized process: {name} (PID: {pid})")
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
            self.sleep(1)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SEED-IT Secure Assessment Portal")
        
        # Configure windowless fullscreen view
        self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        screen = QApplication.primaryScreen().geometry()
        self.setGeometry(0, 0, screen.width(), screen.height())

        # Setup focus-loss swipe tracking
        self.focus_loss_count = 0

        # Keep track of local server if running
        self.local_server = None
        self.local_server_port = None
        self.is_loading_fallback = False
        
        # Local model assets server variables
        self.model_server = None
        self.model_server_port = 0
        
        # Setup central widget and main layout (Navbar + Webview)
        self.central_widget = QWidget(self)
        self.setCentralWidget(self.central_widget)
        self.main_layout = QVBoxLayout(self.central_widget)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(0)

        # Setup WebEngine View
        self.web_view = CustomWebEngineView(self)

        # Build emergency and navigation controls bar
        self.setup_nav_bar()

        # Add web view below the navbar
        self.main_layout.addWidget(self.web_view)
        
        # Initialize communication channel
        self.channel = QWebChannel()
        self.bridge = DesktopBridge(self)
        self.channel.registerObject("desktopBackend", self.bridge)
        self.web_view.page().setWebChannel(self.channel)
        
        # Connect load finished signal to handle network failure fallbacks
        self.web_view.loadFinished.connect(self.handle_load_finished)
        
        # Load QWebChannel script automatically on every page load
        self.inject_webchannel_script()

        # Keyboard Shortcut Blocker Filter
        self.installEventFilter(self)
        
        # Lock keyboard (block Windows keys, Alt gr, Alt, Ctrl, Caps Lock)
        self.block_win_shortcuts()

        # Start background app termination thread
        self.process_terminator = ProcessTerminationThread(self)
        self.process_terminator.start()
        
        # Load content
        self.load_frontend()
        
        # Connect URL changed signal to track assessment state
        self.web_view.urlChanged.connect(self.on_url_changed)

        # Internet connectivity monitor timer (every 30 seconds)
        self.conn_monitor_timer = QTimer(self)
        self.conn_monitor_timer.timeout.connect(self.verify_internet_connectivity)
        self.conn_monitor_timer.start(30000)

        # Disable Windows three-finger swipe / virtual desktop gestures via registry
        self.disable_swipe_gestures()

        # Virtual desktop enforcement: poll every 500ms and forcibly reclaim focus
        self.vd_guard_timer = QTimer(self)
        self.vd_guard_timer.timeout.connect(self._enforce_foreground)
        self.vd_guard_timer.start(500)

        # Enable Fullscreen
        self.showFullScreen()
        logging.info("Main Window initialized in secure fullscreen mode")

        # Start local model server
        self.start_model_server()

    def start_model_server(self):
        """Starts a background HTTP server serving local model files with CORS headers."""
        class ModelHTTPHandler(http.server.SimpleHTTPRequestHandler):
            def end_headers(self):
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                super().end_headers()

            def do_OPTIONS(self):
                self.send_response(200, "ok")
                self.end_headers()

            def translate_path(self, path):
                # Request path starts with /interviewmodels/
                model_dir = r"C:\Program Files (x86)\SEED-SEB\resources\interviewmodels"
                # Fallback path for local testing during development
                if not os.path.exists(model_dir):
                    model_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "public", "models")
                
                # Make sure the target directory exists
                os.makedirs(model_dir, exist_ok=True)
                
                # Strip prefix if it starts with /interviewmodels/
                # Note path translation mapping
                cleaned_path = path
                if cleaned_path.startswith("/interviewmodels/"):
                    cleaned_path = cleaned_path[len("/interviewmodels/"):]
                elif cleaned_path.startswith("/"):
                    cleaned_path = cleaned_path[1:]
                    
                return os.path.join(model_dir, cleaned_path)

        try:
            self.model_server = socketserver.TCPServer(("127.0.0.1", 0), ModelHTTPHandler)
            self.model_server_port = self.model_server.socket.getsockname()[1]
            server_thread = threading.Thread(target=self.model_server.serve_forever)
            server_thread.daemon = True
            server_thread.start()
            logging.info(f"Model HTTP server started on port {self.model_server_port}")
        except Exception as e:
            logging.error(f"Failed to start Model HTTP server: {e}")

    def setup_nav_bar(self):
        """Create and style a modern navigation toolbar at the top of the browser view"""
        nav_bar = QWidget()
        nav_bar.setObjectName("navBar")
        nav_bar.setStyleSheet("""
            QWidget#navBar {
                background-color: #0f172a;
                border-bottom: 1px solid #1e293b;
                min-height: 48px;
                max-height: 48px;
            }
            QPushButton {
                background-color: #1e293b;
                color: #cbd5e1;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 6px 14px;
                margin: 4px;
                font-weight: 600;
                font-size: 13px;
            }
            QPushButton:hover {
                background-color: #334155;
                color: #f8fafc;
                border-color: #475569;
            }
            QPushButton#wifiBtn {
                background-color: #1e293b;
                color: #38bdf8;
                border: 1px solid #334155;
            }
            QPushButton#wifiBtn:hover {
                background-color: #334155;
                color: #7dd3fc;
                border-color: #38bdf8;
            }
            QPushButton#wifiBtn.disconnected {
                color: #ef4444;
                border-color: #ef4444;
            }
            QPushButton#logoutBtn {
                background-color: #ef4444;
                color: white;
                border: none;
            }
            QPushButton#logoutBtn:hover {
                background-color: #dc2626;
            }
            QPushButton#forceCloseBtn {
                background-color: #7f1d1d;
                color: #fca5a5;
                border: 1px solid #991b1b;
            }
            QPushButton#forceCloseBtn:hover {
                background-color: #b91c1c;
                color: white;
                border-color: #ef4444;
            }
        """)
        
        nav_layout = QHBoxLayout(nav_bar)
        nav_layout.setContentsMargins(15, 4, 15, 4)
        nav_layout.setSpacing(10)

        # Back / Forward / Refresh buttons
        back_btn = QPushButton("Back")
        back_btn.clicked.connect(self.web_view.back)
        forward_btn = QPushButton("Forward ")
        forward_btn.clicked.connect(self.web_view.forward)
        refresh_btn = QPushButton("Refresh")
        refresh_btn.clicked.connect(self.web_view.reload)

        # Title Logo
        logo_label = QLabel("SEED-IT Secure Portal")
        logo_label.setStyleSheet("color: white; font-weight: bold; font-size: 14px; margin-right: 15px;")

        # Wi-Fi Quick Settings Button (header near Logout)
        wifi_btn = QPushButton("Wi-Fi")
        wifi_btn.setObjectName("wifiBtn")
        wifi_btn.clicked.connect(self.toggle_wifi_panel)

        # Logout Button (Triggers 10-second countdown closing page)
        logout_btn = QPushButton("Logout")
        logout_btn.setObjectName("logoutBtn")
        logout_btn.clicked.connect(self.start_logout_sequence)

        # Store button references as attributes to enable/disable dynamically
        self.back_btn = back_btn
        self.forward_btn = forward_btn
        self.wifi_btn = wifi_btn
        self.logout_btn = logout_btn

        # Add to layout
        nav_layout.addWidget(back_btn)
        nav_layout.addWidget(forward_btn)
        nav_layout.addWidget(refresh_btn)
        nav_layout.addStretch(1)
        nav_layout.addWidget(logo_label)
        nav_layout.addWidget(wifi_btn)
        nav_layout.addWidget(logout_btn)

        self.main_layout.addWidget(nav_bar)

    def block_win_shortcuts(self):
        """Block Windows, Alt, Ctrl, and Caps Lock key hooks to secure exam context"""
        try:
            keyboard.block_key('left windows')
            keyboard.block_key('right windows')
            keyboard.block_key('alt')
            keyboard.block_key('alt gr')
            keyboard.block_key('left ctrl')
            keyboard.block_key('right ctrl')
            keyboard.block_key('caps lock')
            logging.info("Keyboard lock hooks enabled successfully")
        except Exception as e:
            logging.error(f"Failed to enable keyboard hooks: {e}")

    def unblock_win_shortcuts(self):
        """Unblock key hooks on application exit"""
        try:
            keyboard.unblock_key('left windows')
            keyboard.unblock_key('right windows')
            keyboard.unblock_key('alt')
            keyboard.unblock_key('alt gr')
            keyboard.unblock_key('left ctrl')
            keyboard.unblock_key('right ctrl')
            keyboard.unblock_key('caps lock')
            logging.info("Keyboard locks unhooked successfully")
        except Exception as e:
            pass

    def force_close_application(self):
        """Quit immediately without triggering confirmations"""
        logging.info("Force close button clicked. Quitting immediately.")
        self.unblock_win_shortcuts()
        try:
            assessment_engine.cleanup_student_session_data()
        except Exception:
            pass
        try:
            if hasattr(self, 'process_terminator') and self.process_terminator:
                self.process_terminator.stop()
        except:
            pass
        try:
            if self.local_server:
                self.local_server.shutdown()
        except:
            pass
        try:
            if self.model_server:
                self.model_server.shutdown()
                self.model_server.server_close()
        except:
            pass
        os._exit(0)

    def inject_webchannel_script(self):
        """Injects qwebchannel.js into the pages automatically.

        Search order:
          1. PyInstaller _MEIPASS (frozen EXE bundled resource)
          2. runtime_manager.app_root / frontend / public
          3. runtime_manager.app_root / public
          4. script_dir/../frontend/public
          5. Inline minimal QWebChannel stub (guarantees bridge works even without the file)
        """
        qwebchannel_content = ""
        possible_paths = [
            # 1. PyInstaller frozen bundle
            os.path.join(getattr(sys, '_MEIPASS', ''), "qwebchannel.js"),
            os.path.join(getattr(sys, '_MEIPASS', ''), "frontend", "public", "qwebchannel.js"),
            # 2-4. Development / app_root paths
            os.path.join(runtime_manager.app_root, "frontend", "public", "qwebchannel.js"),
            os.path.join(runtime_manager.app_root, "public", "qwebchannel.js"),
            os.path.join(script_dir, "..", "frontend", "public", "qwebchannel.js"),
            os.path.join(script_dir, "qwebchannel.js"),
        ]
        for p in possible_paths:
            if p and os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        qwebchannel_content = f.read()
                        logging.info(f"Loaded qwebchannel.js source from {p}")
                        break
                except Exception as e:
                    logging.warning(f"Failed to read qwebchannel.js from {p}: {e}")

        if not qwebchannel_content:
            logging.info("Using embedded official QWebChannel implementation.")
            qwebchannel_content = r"""
"use strict";

var QWebChannelMessageTypes = {
    signal: 1,
    propertyUpdate: 2,
    init: 3,
    idle: 4,
    debug: 5,
    invokeMethod: 6,
    connectToSignal: 7,
    disconnectFromSignal: 8,
    setProperty: 9,
    response: 10,
};

var QWebChannel = function(transport, initCallback, converters)
{
    if (typeof transport !== "object" || typeof transport.send !== "function") {
        console.error("The QWebChannel expects a transport object with a send function and onmessage callback property." +
                      " Given is: transport: " + typeof(transport) + ", transport.send: " + typeof(transport.send));
        return;
    }

    var channel = this;
    this.transport = transport;

    var converterRegistry =
    {
        Date : function(response) {
            if (typeof response === "string"
                && response.match(
                        /^-?\d+-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d*)?([-+\u2212](\d{2}):(\d{2})|Z)?$/)) {
                var date = new Date(response);
                if (!isNaN(date))
                    return date;
            }
            return undefined;
        }
    };

    this.usedConverters = [];

    this.addConverter = function(converter)
    {
        if (typeof converter === "string") {
            if (converterRegistry.hasOwnProperty(converter))
                this.usedConverters.push(converterRegistry[converter]);
            else
                console.error("Converter '" + converter + "' not found");
        } else if (typeof converter === "function") {
            this.usedConverters.push(converter);
        } else {
            console.error("Invalid converter object type " + typeof converter);
        }
    }

    if (Array.isArray(converters)) {
        for (const converter of converters)
            this.addConverter(converter);
    } else if (converters !== undefined) {
        this.addConverter(converters);
    }

    this.send = function(data)
    {
        if (typeof(data) !== "string") {
            data = JSON.stringify(data);
        }
        channel.transport.send(data);
    }

    this.transport.onmessage = function(message)
    {
        var data = message.data;
        if (typeof data === "string") {
            data = JSON.parse(data);
        }
        switch (data.type) {
            case QWebChannelMessageTypes.signal:
                channel.handleSignal(data);
                break;
            case QWebChannelMessageTypes.response:
                channel.handleResponse(data);
                break;
            case QWebChannelMessageTypes.propertyUpdate:
                channel.handlePropertyUpdate(data);
                break;
            default:
                console.error("invalid message received:", message.data);
                break;
        }
    }

    this.execCallbacks = {};
    this.execId = 0;
    this.exec = function(data, callback)
    {
        if (!callback) {
            channel.send(data);
            return;
        }
        if (channel.execId === Number.MAX_VALUE) {
            channel.execId = Number.MIN_VALUE;
        }
        if (data.hasOwnProperty("id")) {
            console.error("Cannot exec message with property id: " + JSON.stringify(data));
            return;
        }
        data.id = channel.execId++;
        channel.execCallbacks[data.id] = callback;
        channel.send(data);
    };

    this.objects = {};

    this.handleSignal = function(message)
    {
        var object = channel.objects[message.object];
        if (object) {
            object.signalEmitted(message.signal, message.args);
        } else {
            console.warn("Unhandled signal: " + message.object + "::" + message.signal);
        }
    }

    this.handleResponse = function(message)
    {
        if (!message.hasOwnProperty("id")) {
            console.error("Invalid response message received: ", JSON.stringify(message));
            return;
        }
        channel.execCallbacks[message.id](message.data);
        delete channel.execCallbacks[message.id];
    }

    this.handlePropertyUpdate = function(message)
    {
        message.data.forEach(data => {
            var object = channel.objects[data.object];
            if (object) {
                object.propertyUpdate(data.signals, data.properties);
            } else {
                console.warn("Unhandled property update: " + data.object + "::" + data.signal);
            }
        });
        channel.exec({type: QWebChannelMessageTypes.idle});
    }

    this.debug = function(message)
    {
        channel.send({type: QWebChannelMessageTypes.debug, data: message});
    };

    channel.exec({type: QWebChannelMessageTypes.init}, function(data) {
        for (const objectName of Object.keys(data)) {
            new QObject(objectName, data[objectName], channel);
        }

        for (const objectName of Object.keys(channel.objects)) {
            channel.objects[objectName].unwrapProperties();
        }

        if (initCallback) {
            initCallback(channel);
        }
        channel.exec({type: QWebChannelMessageTypes.idle});
    });
};

function QObject(name, data, webChannel)
{
    this.__id__ = name;
    webChannel.objects[name] = this;
    this.__objectSignals__ = {};
    this.__propertyCache__ = {};

    var object = this;

    this.unwrapQObject = function(response)
    {
        for (const converter of webChannel.usedConverters) {
            var result = converter(response);
            if (result !== undefined)
                return result;
        }

        if (response instanceof Array) {
            return response.map(qobj => object.unwrapQObject(qobj))
        }
        if (!(response instanceof Object))
            return response;

        if (!response["__QObject*__"] || response.id === undefined) {
            var jObj = {};
            for (const propName of Object.keys(response)) {
                jObj[propName] = object.unwrapQObject(response[propName]);
            }
            return jObj;
        }

        var objectId = response.id;
        if (webChannel.objects[objectId])
            return webChannel.objects[objectId];

        if (!response.data) {
            console.error("Cannot unwrap unknown QObject " + objectId + " without data.");
            return;
        }

        var qObject = new QObject( objectId, response.data, webChannel );
        qObject.destroyed.connect(function() {
            if (webChannel.objects[objectId] === qObject) {
                delete webChannel.objects[objectId];
                Object.keys(qObject).forEach(name => delete qObject[name]);
            }
        });
        qObject.unwrapProperties();
        return qObject;
    }

    this.unwrapProperties = function()
    {
        for (const propertyIdx of Object.keys(object.__propertyCache__)) {
            object.__propertyCache__[propertyIdx] = object.unwrapQObject(object.__propertyCache__[propertyIdx]);
        }
    }

    function addSignal(signalData, isPropertyNotifySignal)
    {
        var signalName = signalData[0];
        var signalIndex = signalData[1];
        object[signalName] = {
            connect: function(callback) {
                if (typeof(callback) !== "function") {
                    console.error("Bad callback given to connect to signal " + signalName);
                    return;
                }

                object.__objectSignals__[signalIndex] = object.__objectSignals__[signalIndex] || [];
                object.__objectSignals__[signalIndex].push(callback);

                if (isPropertyNotifySignal)
                    return;

                if (signalName === "destroyed" || signalName === "destroyed()" || signalName === "destroyed(QObject*)")
                    return;

                if (object.__objectSignals__[signalIndex].length == 1) {
                    webChannel.exec({
                        type: QWebChannelMessageTypes.connectToSignal,
                        object: object.__id__,
                        signal: signalIndex
                    });
                }
            },
            disconnect: function(callback) {
                if (typeof(callback) !== "function") {
                    console.error("Bad callback given to disconnect from signal " + signalName);
                    return;
                }
                object.__objectSignals__[signalIndex] = (object.__objectSignals__[signalIndex] || []).filter(function(c) {
                  return c != callback;
                });
                if (!isPropertyNotifySignal && object.__objectSignals__[signalIndex].length === 0) {
                    webChannel.exec({
                        type: QWebChannelMessageTypes.disconnectFromSignal,
                        object: object.__id__,
                        signal: signalIndex
                    });
                }
            }
        };
    }

    function invokeSignalCallbacks(signalName, signalArgs)
    {
        var connections = object.__objectSignals__[signalName];
        if (connections) {
            connections.forEach(function(callback) {
                callback.apply(callback, signalArgs);
            });
        }
    }

    this.propertyUpdate = function(signals, propertyMap)
    {
        for (const propertyIndex of Object.keys(propertyMap)) {
            var propertyValue = propertyMap[propertyIndex];
            object.__propertyCache__[propertyIndex] = this.unwrapQObject(propertyValue);
        }

        for (const signalName of Object.keys(signals)) {
            invokeSignalCallbacks(signalName, signals[signalName]);
        }
    }

    this.signalEmitted = function(signalName, signalArgs)
    {
        invokeSignalCallbacks(signalName, this.unwrapQObject(signalArgs));
    }

    function addMethod(methodData)
    {
        var methodName = methodData[0];
        var methodIdx = methodData[1];
        var invokedMethod = methodName[methodName.length - 1] === ')' ? methodIdx : methodName

        object[methodName] = function() {
            var args = [];
            var callback;
            var errCallback;
            for (var i = 0; i < arguments.length; ++i) {
                var argument = arguments[i];
                if (typeof argument === "function")
                    callback = argument;
                else
                    args.push(argument);
            }

            var result;
            if (!callback && (typeof(Promise) === 'function')) {
              result = new Promise(function(resolve, reject) {
                callback = resolve;
                errCallback = reject;
              });
            }

            webChannel.exec({
                "type": QWebChannelMessageTypes.invokeMethod,
                "object": object.__id__,
                "method": invokedMethod,
                "args": args
            }, function(response) {
                if (response !== undefined) {
                    var result = object.unwrapQObject(response);
                    if (callback) {
                        (callback)(result);
                    }
                } else if (errCallback) {
                  (errCallback)();
                }
            });

            return result;
        };
    }

    function bindGetterSetter(propertyInfo)
    {
        var propertyIndex = propertyInfo[0];
        var propertyName = propertyInfo[1];
        var notifySignalData = propertyInfo[2];
        object.__propertyCache__[propertyIndex] = propertyInfo[3];

        if (notifySignalData) {
            if (notifySignalData[0] === 1) {
                notifySignalData[0] = propertyName + "Changed";
            }
            addSignal(notifySignalData, true);
        }

        Object.defineProperty(object, propertyName, {
            configurable: true,
            get: function () {
                var propertyValue = object.__propertyCache__[propertyIndex];
                if (propertyValue === undefined) {
                    console.warn("Undefined value in property cache for property \"" + propertyName + "\" in object " + object.__id__);
                }
                return propertyValue;
            },
            set: function(value) {
                if (value === undefined) {
                    console.warn("Property setter for " + propertyName + " called with undefined value!");
                    return;
                }
                object.__propertyCache__[propertyIndex] = value;
                var valueToSend = value;
                webChannel.exec({
                    "type": QWebChannelMessageTypes.setProperty,
                    "object": object.__id__,
                    "property": propertyIndex,
                    "value": valueToSend
                });
            }
        });
    }

    data.methods.forEach(addMethod);
    data.properties.forEach(bindGetterSetter);
    data.signals.forEach(function(signal) { addSignal(signal, false); });
    Object.assign(object, data.enums);
}

QObject.prototype.toJSON = function() {
    if (this.__id__ === undefined) return {};
    return {
        id: this.__id__,
        "__QObject*__": true
    };
};

window.QWebChannel = QWebChannel;
"""

        full_injection = qwebchannel_content + "\nwindow.pyqtFlag = true;\n"

        script = QWebEngineScript()
        script.setName("qwebchannel_loader")
        script.setSourceCode(full_injection)
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setRunsOnSubFrames(True)
        self.web_view.page().profile().scripts().insert(script)


    def load_frontend(self):
        """Loads React app from load-balanced Netlify sites, or falls back to local build/server."""
        # List of 4 Netlify domains for load balancing
        netlify_urls = [
            "https://seed-seb.seed-skillup.workers.dev"
            # "https://seed-seb-1.netlify.app",
            # "https://seed-seb-2.netlify.app",
            # "https://seed-seb-3.netlify.app",
            # "https://seed-seb-4.netlify.app"
        ]
        
        # Select randomly
        selected_url = random.choice(netlify_urls)
        logging.info(f"Load-balanced selection: {selected_url}")
        
        # Locate build/index.html directory for offline fallback if needed
        build_dir = os.path.join(runtime_manager.app_root, "frontend", "build")
        if not os.path.exists(os.path.join(build_dir, "index.html")):
            build_dir = os.path.join(runtime_manager.app_root, "build")
        
        logging.info(f"Loading React app from remote: {selected_url}")
        self.web_view.load(QUrl(selected_url))

    def handle_load_finished(self, ok):
        """Callback triggered when page loading finishes. Handles fallback to offline local server on network errors."""
        if not ok and not self.is_loading_fallback:
            logging.warning("Remote Netlify URL failed to load. Attempting offline fallback to local server...")
            self.is_loading_fallback = True
            
            build_dir = os.path.join(runtime_manager.app_root, "frontend", "build")
            if not os.path.exists(os.path.join(build_dir, "index.html")):
                build_dir = os.path.join(runtime_manager.app_root, "build")
                
            if os.path.exists(os.path.join(build_dir, "index.html")):
                try:
                    if not self.local_server:
                        self.start_local_http_server(build_dir)
                    url = f"http://127.0.0.1:{self.local_server_port}/"
                    logging.info(f"Loading local offline fallback server URL: {url}")
                    self.web_view.load(QUrl(url))
                except Exception as e:
                    logging.error(f"Failed to start fallback server: {e}")
                    self.web_view.setHtml(f"<h3>Connection Error</h3><p>Could not connect to the assessment server. Please check your network connection.</p>")
            else:
                logging.error("Connection failed: Server unreachable.")
                self.web_view.setHtml("""
                    <html>
                        <body style="font-family: Arial; padding: 50px; background: #0f172a; color: white; text-align: center;">
                            <h2 style="color: #ef4444;">Connection Error</h2>
                            <p>Unable to connect to the assessment server.</p>
                            <p style="color: #64748b;">Please check your network connection and retry.</p>
                        </body>
                    </html>
                """)

    def start_local_http_server(self, directory):
        """Spins up a lightweight background daemon HTTP server on a random free port."""
        class CustomHTTPHandler(ReactHTTPHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=directory, **kwargs)

        self.local_server = socketserver.TCPServer(("127.0.0.1", 0), CustomHTTPHandler)
        self.local_server_port = self.local_server.socket.getsockname()[1]
        
        server_thread = threading.Thread(target=self.local_server.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        logging.info(f"Background HTTP server started on port {self.local_server_port} serving {directory}")

    def eventFilter(self, obj, event):
        """Event filter to block exit shortcuts and refresh events."""
        if event.type() == QEvent.Type.KeyPress:
            key = event.key()
            modifiers = event.modifiers()
            
            # Block F5, F11, F12
            if key in [Qt.Key.Key_F5, Qt.Key.Key_F11, Qt.Key.Key_F12]:
                logging.warning(f"Blocked key press: F{key - Qt.Key.Key_F1 + 1}")
                return True
                
            # Block Ctrl+R, Ctrl+Shift+I, Ctrl+Shift+R
            if modifiers & Qt.KeyboardModifier.ControlModifier:
                if key in [Qt.Key.Key_R, Qt.Key.Key_I]:
                    logging.warning(f"Blocked key combination: Ctrl + {chr(key) if key < 128 else key}")
                    return True
                    
            # Block Alt+F4 (prompt close confirmation)
            if modifiers & Qt.KeyboardModifier.AltModifier and key == Qt.Key.Key_F4:
                logging.info("Alt+F4 pressed. Prompting user...")
                self.close()
                return True
                
        return super().eventFilter(obj, event)

    def changeEvent(self, event):
        """Security monitor for window deactivation (workspace swipe/minimize actions). Silently blocks switches by refocusing."""
        if event.type() in [QEvent.Type.ActivationChange, QEvent.Type.WindowStateChange]:
            if not self.isActiveWindow() or self.isMinimized():
                logging.warning("Security Alert: Sandbox deactivated or minimized. Silently blocking and refocusing window...")
                
                # Instantly force window back to front fullscreen kiosk mode
                self.showFullScreen()
                self.raise_()
                self.activateWindow()
                try:
                    import ctypes
                    hwnd = int(self.winId())
                    # Force OS focus/desktop switch back to this window
                    ctypes.windll.user32.SetForegroundWindow(hwnd)
                except Exception as e:
                    logging.error(f"Failed SetForegroundWindow: {e}")
        super().changeEvent(event)

    def on_url_changed(self, url):
        """Monitors the active page URL to hide exits and navigation controls during active assessments."""
        url_str = url.toString().lower()
        
        # Determine if user is currently inside an active assessment
        # Covers: /student/mcq/<slug>, /student/coding/<slug>, /student/multisection
        import urllib.parse
        try:
            parsed = urllib.parse.urlparse(url_str)
            path = parsed.path.rstrip('/')
            parts = path.split('/')
            # MCQ/Coding have slug: /student/mcq/test-name (4+ parts)
            # MultiSection is just: /student/multisection (3 parts)
            is_assessment = (
                (len(parts) >= 4 and parts[1] == "student" and parts[2] in ["mcq", "coding"])
                or "multisection" in parts
            )
        except Exception:
            is_assessment = False

        self.is_assessment_active = is_assessment
        
        # Hide exit/navigation buttons on assessment pages, show them on dashboards/login
        self.back_btn.setVisible(not is_assessment)
        self.forward_btn.setVisible(not is_assessment)
        if hasattr(self, 'wifi_btn'):
            self.wifi_btn.setVisible(not is_assessment)
        self.logout_btn.setVisible(not is_assessment)
        
        logging.info(f"URL changed: {url.toString()} (Assessment Active: {is_assessment})")

    def disable_swipe_gestures(self):
        """Disable Windows three-finger swipe and virtual desktop gesture via registry at runtime."""
        try:
            import winreg
            # Disable touchpad three-finger and four-finger gestures (Windows 10/11)
            keys_to_disable = [
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "ThreeFingerSlideEnabled", 0),
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "FourFingerSlideEnabled", 0),
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "ThreeFingerTapEnabled", 0),
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "FourFingerTapEnabled", 0),
            ]
            for reg_path, name, val in keys_to_disable:
                try:
                    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path, 0, winreg.KEY_SET_VALUE)
                    winreg.SetValueEx(key, name, 0, winreg.REG_DWORD, val)
                    winreg.CloseKey(key)
                except Exception:
                    pass  # Key may not exist on all systems
            logging.info("[Security] Three-finger swipe gestures disabled via registry.")
        except Exception as e:
            logging.warning(f"[Security] Could not disable swipe gestures: {e}")

    def _enforce_foreground(self):
        """Poll every 500ms: if our window is not the foreground window, immediately reclaim it.
        This prevents virtual desktop switches and second desktop creation from taking effect."""
        try:
            import ctypes
            hwnd = int(self.winId())
            fg = ctypes.windll.user32.GetForegroundWindow()
            if fg != hwnd:
                self.showFullScreen()
                self.raise_()
                self.activateWindow()
                ctypes.windll.user32.SetForegroundWindow(hwnd)
                logging.warning("[Security] Foreground window stolen  reclaiming focus.")
        except Exception:
            pass

    def toggle_wifi_panel(self):
        """Opens or closes the Windows-style Wi-Fi Quick Panel underneath the Wi-Fi navbar button."""
        if hasattr(self, 'wifi_panel') and self.wifi_panel and self.wifi_panel.isVisible():
            self.wifi_panel.close()
            self.wifi_panel = None
            return

        self.wifi_panel = WindowsWifiPanel(self)
        
        # Position panel directly under the Wi-Fi header button
        btn_pos = self.wifi_btn.mapToGlobal(self.wifi_btn.rect().bottomLeft())
        panel_x = btn_pos.x() - self.wifi_panel.width() + self.wifi_btn.width()
        panel_y = btn_pos.y() + 4
        
        screen_geo = QApplication.primaryScreen().geometry()
        if panel_x + self.wifi_panel.width() > screen_geo.width():
            panel_x = screen_geo.width() - self.wifi_panel.width() - 10
        if panel_x < 10:
            panel_x = 10
            
        self.wifi_panel.move(panel_x, panel_y)
        self.wifi_panel.show()

    def update_wifi_button_status(self, is_connected):
        """Updates the Wi-Fi button status color & text silently without intrusive popups."""
        if not hasattr(self, 'wifi_btn'):
            return
        if is_connected:
            self.wifi_btn.setText("Wi-Fi")
            self.wifi_btn.setProperty("class", "")
            self.wifi_btn.setStyleSheet("""
                QPushButton#wifiBtn {
                    background-color: #1e293b;
                    color: #38bdf8;
                    border: 1px solid #334155;
                }
                QPushButton#wifiBtn:hover {
                    background-color: #334155;
                    color: #7dd3fc;
                    border-color: #38bdf8;
                }
            """)
        else:
            self.wifi_btn.setText("Wi-Fi (Offline)")
            self.wifi_btn.setStyleSheet("""
                QPushButton#wifiBtn {
                    background-color: rgba(239, 68, 68, 0.15);
                    color: #f87171;
                    border: 1px solid #ef4444;
                }
                QPushButton#wifiBtn:hover {
                    background-color: rgba(239, 68, 68, 0.3);
                    color: #white;
                }
            """)

    def verify_internet_connectivity(self):
        """Periodic check for internet connectivity. Updates header status silently without intrusive popups."""
        try:
            requests.get("https://www.google.com", timeout=4)
            self.update_wifi_button_status(True)
        except Exception:
            logging.warning("Internet connection check: Offline status detected.")
            self.update_wifi_button_status(False)

    def start_logout_sequence(self):
        """Immediate exit on Logout click. Servers are shut down in daemon threads."""
        logging.info("Logout clicked. Exiting immediately.")

        # Stop periodic Qt timers.
        try:
            if hasattr(self, "conn_monitor_timer"):
                self.conn_monitor_timer.stop()
            if hasattr(self, "vd_guard_timer"):
                self.vd_guard_timer.stop()
        except Exception:
            pass

        # Unhook keyboard locks & restore touchpad gestures.
        self.unblock_win_shortcuts()
        self._restore_swipe_gestures()

        # Stop the process killer.
        try:
            if hasattr(self, "process_terminator") and self.process_terminator:
                self.process_terminator.stop()
        except Exception:
            pass

        # Shutdown servers in daemon threads (non-blocking).
        def _shutdown_server(srv):
            try:
                if srv:
                    srv.shutdown()
                    srv.server_close()
            except Exception:
                pass

        threading.Thread(target=_shutdown_server, args=(self.local_server,), daemon=True).start()
        threading.Thread(target=_shutdown_server, args=(self.model_server,), daemon=True).start()

        os._exit(0)
        def _shutdown_server(srv):
            try:
                if srv:
                    srv.shutdown()
                    srv.server_close()
            except Exception:
                pass

        threading.Thread(target=_shutdown_server, args=(self.local_server,), daemon=True).start()
        threading.Thread(target=_shutdown_server, args=(self.model_server,), daemon=True).start()

        # Show the countdown dialog - the main thread stays responsive throughout.
        logging.info("Logout: exiting immediately.")
        os._exit(0)

    def closeEvent(self, event):
        """Asks for confirmation using custom ExitConfirmDialog, blocking it entirely during assessments."""
        if getattr(self, 'is_assessment_active', False):
            logging.warning("Close attempt blocked: Active assessment in progress. Refocusing window...")
            event.ignore()
            self.showFullScreen()
            self.raise_()
            self.activateWindow()
            try:
                import ctypes
                hwnd = int(self.winId())
                ctypes.windll.user32.SetForegroundWindow(hwnd)
            except Exception as e:
                logging.error(f"Failed SetForegroundWindow: {e}")
            return

        # Show our custom exit confirmation popup dialog
        dialog = ExitConfirmDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            logging.info("Application closed by student choice.")
            self.unblock_win_shortcuts()
            self._restore_swipe_gestures()  # re-enable touchpad gestures for normal use
            try:
                assessment_engine.cleanup_student_session_data()
            except Exception:
                pass
            try:
                if hasattr(self, 'vd_guard_timer'):
                    self.vd_guard_timer.stop()
                if hasattr(self, 'process_terminator') and self.process_terminator:
                    self.process_terminator.stop()
            except:
                pass
            if self.local_server:
                try:
                    self.local_server.shutdown()
                    self.local_server.server_close()
                except:
                    pass
                logging.info("Local HTTP Server shut down.")
            if self.model_server:
                try:
                    self.model_server.shutdown()
                    self.model_server.server_close()
                except:
                    pass
                logging.info("Model HTTP Server shut down.")
            event.accept()
            os._exit(0)
        else:
            logging.info("Application close prevented.")
            event.ignore()

    def _restore_swipe_gestures(self):
        """Restore three-finger and four-finger touchpad gestures after the app exits cleanly."""
        try:
            import winreg
            keys_to_restore = [
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "ThreeFingerSlideEnabled", 1),
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "FourFingerSlideEnabled",  1),
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "ThreeFingerTapEnabled",   1),
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\PrecisionTouchPad", "FourFingerTapEnabled",    1),
            ]
            for reg_path, name, val in keys_to_restore:
                try:
                    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path, 0, winreg.KEY_SET_VALUE)
                    winreg.SetValueEx(key, name, 0, winreg.REG_DWORD, val)
                    winreg.CloseKey(key)
                except Exception:
                    pass
            logging.info("[Security] Touchpad gestures restored on exit.")
        except Exception as e:
            logging.warning(f"[Security] Could not restore swipe gestures: {e}")



class LogoutCountdownDialog(QDialog):
    """10-second countdown dialog displayed upon Logout to allow complete background cleanup."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Closing SEED-SEB")
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setModal(True)
        self.setFixedSize(520, 260)
        self.remaining_seconds = 10
        self.init_ui()

    def init_ui(self):
        self.setObjectName("logoutCountdownDialog")
        self.setStyleSheet("""
            QDialog#logoutCountdownDialog {
                background-color: #0f172a;
                border: 2px solid #3b82f6;
                border-radius: 14px;
            }
            QLabel#titleLabel {
                color: #f8fafc;
                font-size: 18px;
                font-weight: 700;
            }
            QLabel#descLabel {
                color: #94a3b8;
                font-size: 13px;
                line-height: 1.5;
            }
            QLabel#timerLabel {
                color: #38bdf8;
                font-size: 36px;
                font-weight: 800;
            }
            QProgressBar {
                border: none;
                border-radius: 5px;
                background-color: #1e293b;
                height: 10px;
            }
            QProgressBar::chunk {
                background-color: #3b82f6;
                border-radius: 5px;
            }
            QPushButton#closeNowBtn {
                background-color: #ef4444;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 8px 20px;
                font-weight: 600;
                font-size: 13px;
            }
            QPushButton#closeNowBtn:hover {
                background-color: #dc2626;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 26, 30, 26)
        layout.setSpacing(14)

        # Header Title
        title_row = QHBoxLayout()
        icon = QLabel("")
        icon.setStyleSheet("font-size: 24px; background: transparent;")
        title = QLabel("Logging Out & Closing Application...", self)
        title.setObjectName("titleLabel")
        title_row.addWidget(icon)
        title_row.addWidget(title)
        title_row.addStretch()
        layout.addLayout(title_row)

        # Description
        desc = QLabel(
            "Safely saving progress, flushing proctoring logs, and releasing system hooks.\n"
            "The application will automatically close when complete.",
            self
        )
        desc.setObjectName("descLabel")
        desc.setWordWrap(True)
        layout.addWidget(desc)

        # Countdown Display + Progress Bar
        counter_row = QHBoxLayout()
        self.timer_label = QLabel("10s", self)
        self.timer_label.setObjectName("timerLabel")
        counter_row.addWidget(self.timer_label)

        self.progress_bar = QProgressBar(self)
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(100)
        self.progress_bar.setTextVisible(False)
        counter_row.addWidget(self.progress_bar, 1)
        layout.addLayout(counter_row)

        # Bottom row with Exit Now button
        btn_row = QHBoxLayout()
        status_info = QLabel("Releasing hardware & network locks...", self)
        status_info.setStyleSheet("color: #64748b; font-size: 12px; font-style: italic;")
        btn_row.addWidget(status_info)
        btn_row.addStretch()

        exit_now_btn = QPushButton("Close Immediately ", self)
        exit_now_btn.setObjectName("closeNowBtn")
        exit_now_btn.clicked.connect(self.accept)
        btn_row.addWidget(exit_now_btn)
        layout.addLayout(btn_row)

        # Start 1-second countdown timer
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(1000)

    def tick(self):
        self.remaining_seconds -= 1
        self.timer_label.setText(f"{self.remaining_seconds}s")
        self.progress_bar.setValue(int((self.remaining_seconds / 10.0) * 100))

        if self.remaining_seconds <= 0:
            self.timer.stop()
            self.accept()


class WindowsWifiPanel(QDialog):
    """Windows 11 / Windows 10 Quick Settings style Wi-Fi Dropdown Panel."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Wi-Fi Quick Panel")
        self.setWindowFlags(Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setModal(False)
        self.setFixedSize(360, 420)
        self.init_ui()

    def init_ui(self):
        self.setObjectName("windowsWifiPanel")
        self.setStyleSheet("""
            QDialog#windowsWifiPanel {
                background-color: #0f172a;
                border: 1px solid #334155;
                border-radius: 12px;
            }
            QLabel {
                color: #f8fafc;
                font-family: 'Segoe UI', sans-serif;
            }
            QComboBox, QLineEdit {
                background-color: #1e293b;
                color: #f8fafc;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 13px;
            }
            QComboBox:focus, QLineEdit:focus {
                border-color: #38bdf8;
            }
            QPushButton {
                border-radius: 6px;
                padding: 7px 14px;
                font-weight: 600;
                font-size: 12px;
            }
            QPushButton#connectBtn {
                background-color: #38bdf8;
                color: #0f172a;
                border: none;
            }
            QPushButton#connectBtn:hover {
                background-color: #0284c7;
                color: white;
            }
            QPushButton#refreshBtn {
                background-color: #334155;
                color: #cbd5e1;
                border: 1px solid #475569;
            }
            QPushButton#refreshBtn:hover {
                background-color: #475569;
                color: #f8fafc;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(12)

        # Header Title Row
        header_row = QHBoxLayout()
        wifi_title = QLabel("Wi-Fi Networks", self)
        wifi_title.setStyleSheet("font-size: 15px; font-weight: bold; color: #f8fafc;")
        header_row.addWidget(wifi_title)
        header_row.addStretch()

        self.refresh_btn = QPushButton("Refresh", self)
        self.refresh_btn.setObjectName("refreshBtn")
        self.refresh_btn.clicked.connect(self.refresh_networks)
        header_row.addWidget(self.refresh_btn)
        layout.addLayout(header_row)

        # Active Network Status Card
        self.status_card = QWidget(self)
        self.status_card.setStyleSheet("""
            QWidget {
                background-color: #1e293b;
                border: 1px solid #334155;
                border-radius: 8px;
                padding: 10px;
            }
        """)
        card_layout = QVBoxLayout(self.status_card)
        card_layout.setContentsMargins(10, 8, 10, 8)
        
        self.status_lbl = QLabel("Checking connection...", self)
        self.status_lbl.setStyleSheet("font-size: 12px; font-weight: 600; color: #38bdf8;")
        card_layout.addWidget(self.status_lbl)
        layout.addWidget(self.status_card)

        # Wi-Fi Select dropdown
        layout.addWidget(QLabel("Select Available Network:", self))
        from PyQt6.QtWidgets import QComboBox, QLineEdit
        self.wifi_combo = QComboBox(self)
        layout.addWidget(self.wifi_combo)

        # Password input
        layout.addWidget(QLabel("Security Key / Password:", self))
        self.password_input = QLineEdit(self)
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Enter Wi-Fi password")
        layout.addWidget(self.password_input)

        # Status Notice
        self.msg_label = QLabel("", self)
        self.msg_label.setStyleSheet("color: #fca5a5; font-size: 12px; font-weight: 600;")
        layout.addWidget(self.msg_label)

        # Connect button
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        self.connect_btn = QPushButton("Connect", self)
        self.connect_btn.setObjectName("connectBtn")
        self.connect_btn.clicked.connect(self.attempt_connect)
        btn_row.addWidget(self.connect_btn)
        layout.addLayout(btn_row)

        # Initial scan
        self.refresh_networks()

    def refresh_networks(self):
        self.wifi_combo.clear()
        self.msg_label.setText("Scanning Wi-Fi networks...")
        QApplication.processEvents()
        
        # Check current internet state
        connected = False
        try:
            r = requests.get("https://www.google.com", timeout=3)
            connected = (r.status_code == 200)
        except Exception:
            connected = False

        if connected:
            self.status_lbl.setText("Connected to Internet")
            self.status_lbl.setStyleSheet("color: #10b981; font-weight: bold;")
        else:
            self.status_lbl.setText("Disconnected  No Internet Access")
            self.status_lbl.setStyleSheet("color: #ef4444; font-weight: bold;")

        wifis = get_available_wifis()
        if wifis:
            for w in wifis:
                self.wifi_combo.addItem(f"{w}")
            self.msg_label.setText(f"Found {len(wifis)} networks nearby.")
            self.msg_label.setStyleSheet("color: #10b981; font-size: 12px;")
        else:
            self.wifi_combo.addItem("No Wi-Fi networks found")
            self.msg_label.setText("No wireless networks detected.")
            self.msg_label.setStyleSheet("color: #f59e0b; font-size: 12px;")

    def attempt_connect(self):
        selected_text = self.wifi_combo.currentText()
        if not selected_text or "No Wi-Fi" in selected_text:
            self.msg_label.setText("Please select a valid Wi-Fi network.")
            self.msg_label.setStyleSheet("color: #ef4444; font-size: 12px;")
            return

        ssid = selected_text.replace(" ", "").strip()
        password = self.password_input.text()

        self.msg_label.setText(f"Connecting to {ssid}...")
        self.msg_label.setStyleSheet("color: #38bdf8; font-size: 12px;")
        QApplication.processEvents()

        success = connect_to_wifi(ssid, password)
        if success:
            self.msg_label.setText("Connected successfully!")
            self.msg_label.setStyleSheet("color: #10b981; font-size: 12px;")
            self.status_lbl.setText("Connected to Internet")
            self.status_lbl.setStyleSheet("color: #10b981; font-weight: bold;")
            if self.parent() and hasattr(self.parent(), 'update_wifi_button_status'):
                self.parent().update_wifi_button_status(True)
        else:
            self.msg_label.setText("Connection failed. Check password.")
            self.msg_label.setStyleSheet("color: #ef4444; font-size: 12px;")


class ExitConfirmDialog(QDialog):
    """Custom styled dark-themed exit confirmation popup dialog"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Exit Confirmation")
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setModal(True)
        self.setFixedSize(400, 200)
        self.init_ui()

    def init_ui(self):
        self.setObjectName("exitConfirmDialog")
        self.setStyleSheet("""
            QDialog#exitConfirmDialog {
                background-color: #0f172a;
                border: 2px solid #334155;
                border-radius: 12px;
            }
            QLabel {
                color: #f8fafc;
                font-family: 'Segoe UI', sans-serif;
            }
            QPushButton {
                border-radius: 6px;
                padding: 8px 18px;
                font-weight: 600;
                font-size: 13px;
                font-family: 'Segoe UI', sans-serif;
            }
        """)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(25, 25, 25, 25)
        layout.setSpacing(20)

        title = QLabel("Exit SEED-SEB Sandbox")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #f8fafc;")
        layout.addWidget(title)

        desc = QLabel("Are you sure you want to exit the assessment sandbox? Your progress will be saved.")
        desc.setWordWrap(True)
        desc.setStyleSheet("font-size: 13px; color: #cbd5e1; line-height: 1.4;")
        layout.addWidget(desc)

        buttons = QHBoxLayout()
        buttons.setSpacing(12)

        no_btn = QPushButton("Cancel")
        no_btn.setStyleSheet("""
            background-color: #334155;
            color: #cbd5e1;
            border: 1px solid #475569;
        """)
        no_btn.clicked.connect(self.reject)

        yes_btn = QPushButton("Yes, Exit")
        yes_btn.setStyleSheet("""
            background-color: #ef4444;
            color: white;
            border: none;
        """)
        yes_btn.clicked.connect(self.accept)

        buttons.addStretch()
        buttons.addWidget(no_btn)
        buttons.addWidget(yes_btn)
        layout.addLayout(buttons)


class WifiSetupDialog(QDialog):
    """Custom styled Wi-Fi reconnection dialog shown upon connection failure"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Wi-Fi Connection Required")
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setModal(True)
        self.setFixedSize(450, 340)
        self.init_ui()

    def init_ui(self):
        self.setObjectName("wifiSetupDialog")
        self.setStyleSheet("""
            QDialog#wifiSetupDialog {
                background-color: #0f172a;
                border: 2px solid #f59e0b;
                border-radius: 12px;
            }
            QLabel {
                color: #f8fafc;
                font-family: 'Segoe UI', sans-serif;
            }
            QComboBox, QLineEdit {
                background-color: #1e293b;
                color: #f8fafc;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 13px;
                font-family: 'Segoe UI', sans-serif;
            }
            QComboBox:focus, QLineEdit:focus {
                border-color: #f59e0b;
            }
            QPushButton {
                border-radius: 6px;
                padding: 8px 18px;
                font-weight: 600;
                font-size: 13px;
                font-family: 'Segoe UI', sans-serif;
            }
        """)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(25, 25, 25, 25)
        layout.setSpacing(12)

        title = QLabel("Internet Connection Lost")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #f59e0b;")
        layout.addWidget(title)

        desc = QLabel("Your internet connection was lost. Please select a Wi-Fi network below to reconnect and continue your assessment.")
        desc.setWordWrap(True)
        desc.setStyleSheet("font-size: 13px; color: #cbd5e1; line-height: 1.4;")
        layout.addWidget(desc)

        # Wi-Fi Select dropdown
        layout.addWidget(QLabel("Select Wi-Fi Network:"))
        from PyQt6.QtWidgets import QComboBox, QLineEdit
        self.wifi_combo = QComboBox()
        self.refresh_wifis()
        layout.addWidget(self.wifi_combo)

        # Password input
        layout.addWidget(QLabel("Wi-Fi Password:"))
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Enter network password")
        layout.addWidget(self.password_input)

        # Status message label
        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: #fca5a5; font-size: 12px; font-weight: bold;")
        layout.addWidget(self.status_label)

        # Action buttons
        buttons = QHBoxLayout()
        
        refresh_btn = QPushButton("Refresh List")
        refresh_btn.setStyleSheet("""
            background-color: #334155;
            color: #cbd5e1;
            border: 1px solid #475569;
        """)
        refresh_btn.clicked.connect(self.refresh_wifis)

        connect_btn = QPushButton("Connect")
        connect_btn.setStyleSheet("""
            background-color: #f59e0b;
            color: #0f172a;
            border: none;
        """)
        connect_btn.clicked.connect(self.attempt_connect)

        buttons.addWidget(refresh_btn)
        buttons.addStretch()
        buttons.addWidget(connect_btn)
        layout.addLayout(buttons)

    def refresh_wifis(self):
        self.wifi_combo.clear()
        wifis = get_available_wifis()
        if wifis:
            self.wifi_combo.addItems(wifis)
        else:
            self.wifi_combo.addItem("No Wi-Fi networks found")

    def attempt_connect(self):
        ssid = self.wifi_combo.currentText()
        password = self.password_input.text()
        
        if ssid == "No Wi-Fi networks found" or not ssid:
            self.status_label.setText("Please select a valid Wi-Fi network.")
            return

        self.status_label.setText("Connecting...")
        QApplication.processEvents()

        # Connect logic
        success = connect_to_wifi(ssid, password)
        if success:
            self.status_label.setText("Connected successfully!")
            QApplication.processEvents()
            time.sleep(1.5)
            self.accept()
        else:
            self.status_label.setText("Connection failed. Check password.")


def get_available_wifis():
    """Shells out to netsh on Windows to list available SSIDs safely without shell=True."""
    import subprocess
    try:
        res = subprocess.run(["netsh", "wlan", "show", "networks"], capture_output=True, text=True)
        networks = []
        if res.returncode == 0:
            lines = res.stdout.split("\n")
            for line in lines:
                if "SSID" in line and ":" in line:
                    parts = line.split(":")
                    if len(parts) > 1:
                        ssid = parts[1].strip()
                        if ssid:
                            networks.append(ssid)
        return list(set(networks))
    except Exception as e:
        logging.error(f"Failed to scan Wi-Fi networks: {e}")
        return []


def connect_to_wifi(ssid, password):
    """Generates an XML profile dynamically and connects via netsh using safe argument lists."""
    import subprocess
    import tempfile
    import socket
    import html

    safe_ssid = html.escape(ssid or "")
    safe_pwd = html.escape(password or "")
    temp_path = None

    try:
        # Check if network is open (no password)
        if not password:
            xml = f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{safe_ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{safe_ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>open</authentication>
                <encryption>none</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
        </security>
    </MSM>
</WLANProfile>
"""
        else:
            xml = f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{safe_ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{safe_ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{safe_pwd}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>
"""
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False, mode="w", encoding="utf-8") as f:
            f.write(xml)
            temp_path = f.name

        # Import profile XML with user=current scope
        subprocess.run(["netsh", "wlan", "add", "profile", f"filename={temp_path}", "user=current"], capture_output=True)

        # Request connect
        subprocess.run(["netsh", "wlan", "connect", f"name={ssid}"], capture_output=True, text=True)

        # Verify connection status up to 4 seconds (fast check)
        for _ in range(8):
            time.sleep(0.5)
            # Allow PyQt UI to redraw/process events during connect checks to avoid frozen UI
            QApplication.processEvents()
            try:
                # Fast socket connection check to Cloudflare DNS
                socket.setdefaulttimeout(0.5)
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.connect(("1.1.1.1", 53))
                s.close()
                return True
            except Exception:
                pass
        return False
    except Exception as e:
        logging.error(f"Error connecting to Wi-Fi: {e}")
        return False
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def check_and_disable_caps_lock():
    """Checks if Caps Lock is ON at application launch and automatically turns it OFF."""
    if sys.platform == 'win32':
        try:
            import ctypes
            VK_CAPITAL = 0x14
            # GetKeyState: low-order bit (1) indicates Caps Lock is toggled ON
            is_on = bool(ctypes.windll.user32.GetKeyState(VK_CAPITAL) & 1)
            if is_on:
                logging.info("[Keyboard] Caps Lock detected ON at launch. Turning it OFF...")
                # Simulate Caps Lock key press and release
                ctypes.windll.user32.keybd_event(VK_CAPITAL, 0x45, 0x0001, 0)
                ctypes.windll.user32.keybd_event(VK_CAPITAL, 0x45, 0x0001 | 0x0002, 0)
                logging.info("[Keyboard] Caps Lock turned OFF successfully.")
            else:
                logging.info("[Keyboard] Caps Lock is OFF.")
        except Exception as e:
            logging.warning(f"[Keyboard] Could not check or disable Caps Lock: {e}")


def main():
    # Enforce single instance using a Win32 Mutex check
    import ctypes
    mutex = ctypes.windll.kernel32.CreateMutexW(None, True, "Local\\SEED_SEB_SingleInstance_Mutex")
    if ctypes.windll.kernel32.GetLastError() == 183: # ERROR_ALREADY_EXISTS
        temp_app = QApplication(sys.argv)
        QMessageBox.critical(
            None,
            "Already Running",
            "An instance of SEED-SEB is already running. Please close it first.",
            QMessageBox.StandardButton.Ok
        )
        sys.exit(1)

    # 0a. Verify binary integrity against server (blocks tampered EXE on student laptops)
    if not verify_binary_integrity():
        temp_app = QApplication(sys.argv)
        QMessageBox.critical(
            None,
            "Security Violation",
            "SEED-SEB integrity check failed.\n\nThis application has been tampered with or is not an official release.\n\nYour attempt has been logged. Please reinstall from the official SEED-IT portal.",
            QMessageBox.StandardButton.Ok
        )
        sys.exit(1)

    # 0b. Verify compiler resources first
    if not runtime_manager.verify_resources():
        temp_app = QApplication(sys.argv)
        QMessageBox.critical(
            None,
            "Application Corrupted",
            "Required resource runtimes (Python, Java, or C++ compilers) are missing or corrupted.\n\nPlease reinstall the application to resolve this issue.",
            QMessageBox.StandardButton.Ok
        )
        sys.exit(1)

    # 1. Block macOS and Linux execution
    if sys.platform != 'win32':
        temp_app = QApplication(sys.argv)
        QMessageBox.critical(
            None,
            "Unsupported OS",
            "SEED-SEB is only supported on native Windows operating systems.\nExecution on macOS, Linux, or Unix-based platforms is strictly blocked.",
            QMessageBox.StandardButton.Ok
        )
        sys.exit(1)

    # 2. Block Windows Subsystem for Linux (WSL) environments
    is_wsl = False
    if 'WSL_DISTRO_NAME' in os.environ or 'WSL_INTEROP' in os.environ or 'WSL_UTF8' in os.environ:
        is_wsl = True
    else:
        try:
            if os.path.exists('/proc/version'):
                with open('/proc/version', 'r') as f:
                    if 'microsoft' in f.read().lower():
                        is_wsl = True
        except Exception:
            pass

    if is_wsl:
        temp_app = QApplication(sys.argv)
        QMessageBox.critical(
            None,
            "WSL Blocked",
            "SEED-SEB cannot be run inside Windows Subsystem for Linux (WSL).\nPlease run the application natively in Windows.",
            QMessageBox.StandardButton.Ok
        )
        sys.exit(1)

    if hasattr(Qt, 'AA_EnableHighDpiScaling'):
        QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    if hasattr(Qt, 'AA_UseHighDpiPixmaps'):
        QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)

    app = QApplication(sys.argv)
    app.setApplicationName("SEED-SEB")
    
    # Check if Caps Lock is ON at application launch and turn it OFF
    check_and_disable_caps_lock()

    # Clean up temp_workspace directory on startup to remove orphaned folders from previous crashes
    try:
        import shutil
        workspace_dir = os.path.join(runtime_manager.app_root, "data", "temp_workspace")
        if os.path.exists(workspace_dir):
            shutil.rmtree(workspace_dir, ignore_errors=True)
            os.makedirs(workspace_dir, exist_ok=True)
    except Exception as e:
        pass
    
    # - Show Pre-Launch System Check Dialog first
    prelaunch = PreLaunchDialog()
    result = prelaunch.exec()
    if result != QDialog.DialogCode.Accepted or not prelaunch.checks_passed:
        logging.info("Prelaunch system checks failed or cancelled. Exiting.")
        os._exit(0)

    # Initialize Main Window
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()

