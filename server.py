import time
START_TIME = time.time()
_CLIENT_LOADED = False

from src.bypass import transport_names, neftcfg_search, init_bypass, IGNORE_LIST, restart_all_adapters, get_adapter_name, rand0m_hex
from flask import Flask, jsonify, send_from_directory, redirect, request, Response, stream_with_context
from hypercorn.asyncio import serve as hypercorn_serve
from src.ping import scan_network, get_default_gateway
from src.netman import GarpSpoofer, ping_manager
from src.monitor import connection_monitor, ConnectionMonitor
from werkzeug.exceptions import NotFound 
from hypercorn.config import Config
from getmac import get_mac_address
from functools import lru_cache
from flask_cors import CORS
from threading import Lock
from waitress import serve
from PIL import Image
import subprocess
import threading
import platform
import datetime
import logging
import asyncio
import win32con
import win32gui
import pystray
import random
import socket
import ctypes
import winreg
import signal
import json
import time
import uuid
import sys
import re
import os

STATIC_ROOT = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, 'frozen', False):
    STATIC_ROOT = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable)) or STATIC_ROOT

def is_running_in_electron():
    return os.environ.get('RUNNING_IN_ELECTRON') == '1' or \
           os.environ.get('ELECTRON_RUN_AS_NODE') is not None or \
           os.path.basename(sys.executable).lower() in ['electron.exe', 'electron'] or \
           os.environ.get('ELECTRON') is not None or \
           '--electron-wrapper' in sys.argv 

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

SETTINGS_FILE = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "settings.json")
SETTINGS_FILE = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "settings.json")
HISTORY_FOLDER = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "historystorage")
if not os.path.exists(HISTORY_FOLDER):
    os.makedirs(HISTORY_FOLDER)
    
SCAN_HISTORY_FILE = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "scans.json")
BYPASS_HISTORY_FILE = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "bypasses.json")
APPDATA_LOCATION = os.path.join(os.getenv('APPDATA'), "ayosbypasser")
OUI_FILE = os.path.join(APPDATA_LOCATION, "oui.txt")
OUI_URL = "https://standards-oui.ieee.org/"

VERSION_FILE = os.path.join(APPDATA_LOCATION, "version.txt")
APP_VERSION = "1.6"

def read_version_file():
    try:
        if os.path.exists(VERSION_FILE):
            with open(VERSION_FILE, "r", encoding="utf-8") as vf:
                v = vf.read().strip()
                if v:
                    return v.replace('v', '')
    except Exception as e:
        print(f"\033[93m[WARN] Failed to read version file: {e}\033[0m")
    return None

def write_version_file(version):
    try:
        if not os.path.exists(APPDATA_LOCATION):
            os.makedirs(APPDATA_LOCATION, exist_ok=True)
        with open(VERSION_FILE, "w", encoding="utf-8") as vf:
            vf.write(str(version).replace('v', ''))
    except Exception as e:
        print(f"\033[93m[WARN] Failed to write version file: {e}\033[0m")

@app.route('/version.txt', methods=['GET'])
def get_version_txt():
    try:
        version = read_version_file() or APP_VERSION
        return Response(str(version), mimetype='text/plain')
    except Exception as e:
        app.logger.error(f"Failed to get version.txt: {e}")
        return Response("Error: Could not retrieve version", status=500, mimetype='text/plain')

LOG_FILE = os.path.join(APPDATA_LOCATION, "latest.log")

if is_running_in_electron():
    if not os.path.exists(APPDATA_LOCATION):
        os.makedirs(APPDATA_LOCATION)
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8', mode='w')
    file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    logging.getLogger().addHandler(file_handler)
    logging.getLogger().setLevel(logging.DEBUG)

DEFAULT_SETTINGS = {
    "hide_website": True,
    "auto_open_page": True,
    "debug_mode": "off",
    "bypass_mode": "registry",
    "run_as_admin": False,
    "hardware_rng": True,
    "pbcc_enabled": False,
    "accelerated_bypassing": False,
    "server_backend": "waitress",
    "scanning_method": "divide_and_conquer",
    "parallel_scans": True,
    "override_multiplier": 4,
    "beta_features": False,
    "auto_update": True,
    "ui_debug_mode": False,
    "network_debug_mode": False
}

# --- Globals for Console Hiding ---
console_hwnd = None
tray_thread = None
tray_icon = None

def get_console_hwnd():
    return ctypes.windll.kernel32.GetConsoleWindow()

def create_icon_image():
    try:
        icon_path = os.path.join(STATIC_ROOT, 'favicon.ico')
        if os.path.exists(icon_path):
            return Image.open(icon_path)
    except Exception as e:
        print(f"\033[93m[WARN] Could not load favicon.ico: {e}. Using a default icon.\033[0m")

def show_console(icon, item):
    global console_hwnd, tray_icon
    if console_hwnd:
        win32gui.ShowWindow(console_hwnd, win32con.SW_SHOW)
        try:
            # This might fail if called from a background thread (like the web server)
            # It's not critical, showing the window is enough.
            win32gui.SetForegroundWindow(console_hwnd)
        except Exception:
            pass # Ignore error if we can't bring it to the foreground
    if tray_icon:
        try:
            tray_icon.stop()
        except Exception:
            pass

def exit_app(icon, item):
    global tray_icon
    if tray_icon:
        tray_icon.stop()
    graceful_shutdown(signal.SIGTERM, None)

def setup_tray_icon():
    global tray_icon
    image = create_icon_image()
    menu = (
        pystray.MenuItem('Show Console', show_console, default=True),
        pystray.MenuItem('Exit', exit_app)
    )
    tray_icon = pystray.Icon("BypassControl", image, "Network Related Thing", menu)
    tray_icon.run()

@app.route('/misc/toggle-console-visibility', methods=['POST'])
def toggle_console_visibility():
    global console_hwnd, tray_thread
    
    if not console_hwnd:
        console_hwnd = get_console_hwnd()

    if not console_hwnd:
        return jsonify({"error": "Could not get console window handle."}), 500

    is_visible = win32gui.IsWindowVisible(console_hwnd)

    if is_visible:
        win32gui.ShowWindow(console_hwnd, win32con.SW_HIDE)
        if tray_thread is None or not tray_thread.is_alive():
            tray_thread = threading.Thread(target=setup_tray_icon, daemon=True)
            tray_thread.start()
        return jsonify({"status": "hidden", "message": "Console hidden to system tray."})
    else:
        show_console(None, None)
        return jsonify({"status": "visible", "message": "Console is now visible."})

@app.route('/misc/console-status', methods=['GET'])
def get_console_status():
    global console_hwnd
    if not console_hwnd:
        console_hwnd = get_console_hwnd()
    
    if not console_hwnd:
        return jsonify({"status": "unknown", "error": "Could not get console window handle."})

    is_visible = win32gui.IsWindowVisible(console_hwnd)
    return jsonify({"status": "visible" if is_visible else "hidden"})

network_controller = GarpSpoofer()

DISABLED_DEVICES = []
DISABLED_DEVICES_FILE = os.path.join(APPDATA_LOCATION, "disabled_devices.json")
disabled_devices_cleared = False

PING_CACHE = {}
PING_CACHE_TIMEOUT = 2
ping_lock = Lock()

SERVICE_NAME = "NetworkRelatedThingAutoBypass"
AUTO_BYPASS_CONFIG_FILE = os.path.join(APPDATA_LOCATION, "auto_bypass_config.json")

def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_schtasks(args):
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
        result = subprocess.run(
            ['schtasks'] + args,
            check=True,
            capture_output=True,
            text=True,
            startupinfo=startupinfo
        )
        return result.stdout, result.stderr
    except subprocess.CalledProcessError as e:
        if "ERROR: The system cannot find the file specified." in e.stderr:
            return "", "Task not found"
        app.logger.error(f"Schtasks error: {e.stderr}")
        raise Exception(e.stderr)
    except Exception as e:
        app.logger.error(f"Failed to run schtasks: {e}")
        raise

@app.route('/auto/status', methods=['GET'])
def auto_status():
    if not settings.get("beta_features"):
        return jsonify({'error': 'This is a beta feature and is not enabled.'}), 403
    import psutil
    try:
        pid = None
        start_time_iso = None
        process_status = "Not running"
        for proc in psutil.process_iter(['pid', 'name', 'create_time']):
            if proc.info['name'] == 'auto_bypass_service.exe':
                pid = proc.info['pid']
                start_time_iso = datetime.datetime.fromtimestamp(proc.info['create_time']).isoformat()
                process_status = "Running"
                break

        stdout, stderr = run_schtasks(['/query', '/tn', SERVICE_NAME, '/fo', 'list'])       
        task_status_str = "Not installed"
        task_enabled = False        
        if "Task not found" not in stderr:
            task_status_str = "Installed" # Default if status line not found
            for line in stdout.splitlines():
                if line.startswith('Status:'):
                    task_status_val = line.split(':', 1)[1].strip()
                    if task_status_val == "Ready":
                        task_status_str = "Enabled (Idle)"
                        task_enabled = True
                    elif task_status_val == "Running":
                        task_status_str = "Enabled (Running)"
                        task_enabled = True
                    elif task_status_val == "Disabled":
                        task_status_str = "Disabled"
                        task_enabled = False
                    else:
                        task_status_str = f"State: {task_status_val}"
                    break
        
        interval = 60
        transport_id = None
        config_enabled = False
        if os.path.exists(AUTO_BYPASS_CONFIG_FILE):
            with open(AUTO_BYPASS_CONFIG_FILE, 'r') as f:
                config = json.load(f)
                interval = config.get('interval', 60)
                transport_id = config.get('transport_id')
                config_enabled = config.get('enabled', False)

        return jsonify({
            'task_status': task_status_str,
            'process_status': process_status,
            'config_enabled': config_enabled,
            'task_enabled': task_enabled,
            'interval': interval,
            'transport_id': transport_id,
            'pid': pid,
            'start_time': start_time_iso
        })

    except Exception as e:
        app.logger.error(f"Error in /auto/status: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/auto/kill', methods=['POST'])
def kill_auto_bypass_process():
    if not settings.get("beta_features"):
        return jsonify({'error': 'This is a beta feature and is not enabled.'}), 403
    import psutil
    if not is_admin():
        return jsonify({'error': 'This action requires administrative privileges.'}), 403
    
    processes_killed = []
    try:
        for proc in psutil.process_iter(['pid', 'name']):
            if proc.info['name'] == 'auto_bypass_service.exe':
                try:
                    proc.kill()
                    processes_killed.append(proc.info['pid'])
                except psutil.NoSuchProcess:
                    pass 
                except Exception as e:
                    app.logger.error(f"Failed to kill process {proc.info['pid']}: {str(e)}")

        if not processes_killed:
            return jsonify({'success': False, 'error': 'Auto Bypass service process not found.'}), 404
        
        return jsonify({'success': True, 'message': f'Terminated {len(processes_killed)} process(es) with PIDs: {", ".join(map(str, processes_killed))}.'})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to kill processes: {str(e)}'}), 500

@app.route('/auto/toggle-task', methods=['POST'])
def toggle_auto_bypass_task():
    if not settings.get("beta_features"):
        return jsonify({'error': 'This is a beta feature and is not enabled.'}), 403
    if not is_admin():
        return jsonify({'error': 'This action requires administrative privileges.'}), 403

    try:
        stdout, stderr = run_schtasks(['/query', '/tn', SERVICE_NAME, '/fo', 'list'])
        if "Task not found" in stderr:
            return jsonify({'success': False, 'error': 'Task not found. Cannot toggle.'}), 404

        is_currently_enabled = False
        for line in stdout.splitlines():
            if line.startswith('Status:') and line.split(':', 1)[1].strip() != "Disabled":
                is_currently_enabled = True
                break
        
        # Toggle the state
        action = '/disable' if is_currently_enabled else '/enable'
        run_schtasks(['/change', '/tn', SERVICE_NAME, action])
        
        message = f"Task '{SERVICE_NAME}' has been {'disabled' if is_currently_enabled else 'enabled'}."
        return jsonify({'success': True, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to toggle task: {str(e)}'}), 500

@app.route('/auto/configure', methods=['POST'])
def auto_configure():
    if not settings.get("beta_features"):
        return jsonify({'error': 'This is a beta feature and is not enabled.'}), 403
    import shutil
    if not is_admin():
        return jsonify({'error': 'This action requires administrative privileges.'}), 403

    data = request.get_json()
    enabled = data.get('enabled', False)
    interval = data.get('interval', 60)
    transport_id = data.get('transport_id')

    with open(AUTO_BYPASS_CONFIG_FILE, 'w') as f:
        json.dump({'enabled': enabled, 'interval': interval, 'transport_id': transport_id}, f)

    try:
        service_exe_path = ""
        if getattr(sys, 'frozen', False): 
            embedded_service_path = os.path.join(sys._MEIPASS, 'auto_bypass_service.exe')
            extracted_service_path = os.path.join(APPDATA_LOCATION, 'auto_bypass_service.exe')
            shutil.copy2(embedded_service_path, extracted_service_path)
            service_exe_path = extracted_service_path
        else: 
            return jsonify({'error': 'This feature only works in the compiled application.'}), 500

        if not os.path.exists(service_exe_path):
             return jsonify({'error': f'Service executable not found at {service_exe_path}. Please rebuild the application.'}), 500

        if enabled:
            run_schtasks([
                '/create', '/tn', SERVICE_NAME, '/tr', f'"{service_exe_path}"',
                '/sc', 'onlogon', '/rl', 'highest', '/f'
            ])
            run_schtasks(['/change', '/tn', SERVICE_NAME, '/it', '/enable']) 
            message = "Auto Bypass service has been enabled and will run on next login."
        else:
            _, stderr = run_schtasks(['/query', '/tn', SERVICE_NAME])
            if "Task not found" not in stderr:
                run_schtasks(['/change', '/tn', SERVICE_NAME, '/disable'])
            message = "Auto Bypass service has been disabled."
            
        return jsonify({'message': message})
    except Exception as e:
        return jsonify({'error': f'Failed to configure task: {str(e)}'}), 500

_VENDOR_CACHE = {}
_VENDOR_CACHE_MTIME = 0
_VENDOR_CACHE_LOCK = threading.Lock()

def _parse_oui_line(line: str):
    if "(hex)" in line:
        parts = line.split("(hex)")
    elif "(base 16)" in line:
        parts = line.split("(base 16)")
    else:
        return None, None
    oui_raw = parts[0].strip()
    vendor = parts[1].strip()
    oui = oui_raw.replace("-", "").replace(":", "").upper()
    if len(oui) != 6 or not all(c in "0123456789ABCDEF" for c in oui):
        return None, None
    return oui, vendor

def _load_vendor_cache(force: bool = False):
    # BUGFIX: correct global name (_VENDOR_CACHE_MTIME), not "__VENDOR_CACHE_MTIME"
    global _VENDOR_CACHE, _VENDOR_CACHE_MTIME
    with _VENDOR_CACHE_LOCK:
        try:
            mtime = os.path.getmtime(OUI_FILE)
        except FileNotFoundError:
            _VENDOR_CACHE = {}
            _VENDOR_CACHE_MTIME = 0
            return

        # cache hit
        if not force and _VENDOR_CACHE and _VENDOR_CACHE_MTIME == mtime:
            return

        vendors = {}
        # errors='ignore' to tolerate weird encodings in large files
        with open(OUI_FILE, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                oui, vendor = _parse_oui_line(line)
                if oui and vendor and oui not in vendors:
                    vendors[oui] = vendor

        _VENDOR_CACHE = vendors
        _VENDOR_CACHE_MTIME = mtime

@app.route('/bypass/vendors', methods=['GET'])
def get_vendors():
    # cached, filterable, limited result set
    if not os.path.exists(OUI_FILE):
        return jsonify({"error": "OUI file not found. Please download it from the settings."}), 404

    _load_vendor_cache()
    q = (request.args.get('q') or '').strip().lower()
    try:
        limit = int(request.args.get('limit', '100'))
        limit = max(1, min(500, limit))
    except ValueError:
        limit = 100

    items = _VENDOR_CACHE.items()
    if q:
        q_oui = q.replace(":", "").replace("-", "")
        items = (
            (oui, vendor) for (oui, vendor) in items
            if q in vendor.lower() or oui.lower().startswith(q_oui)
        )

    # Sort by vendor name for stable UI, then apply limit
    items = sorted(items, key=lambda kv: kv[1])[:limit]

    return jsonify({oui: vendor for (oui, vendor) in items})

@app.route('/bypass/generate-mac', methods=['POST'])
def generate_mac_from_vendor():
    data = request.json
    oui = data.get('oui')
    if not oui or len(oui) != 6:
        return jsonify({"error": "Valid 6-character OUI is required."}), 400
    
    random_part = ''.join(random.choices('0123456789ABCDEF', k=6))
    generated_mac = oui + random_part
    
    # format it nicely
    formatted_mac = ':'.join(generated_mac[i:i+2] for i in range(0, 12, 2)).upper()
    
    return jsonify({"mac": formatted_mac})

@app.route('/bypass/generate-valid-mac', methods=['POST'])
def generate_valid_mac():
    data = request.json
    use_hardware_rng = data.get('hardware_rng', True)
    
    try:
        # Use the 'randomized' mode from bypass.py which creates a valid Unicast LAA MAC
        new_mac, instruction = rand0m_hex(mode='randomized', use_hardware_rng=use_hardware_rng)
        print(f"\033[94m[DEBUG] Generated valid MAC: {new_mac} using {instruction}\033[0m")
        
        # Format it nicely for display
        formatted_mac = ':'.join(new_mac[i:i+2] for i in range(0, 12, 2)).upper()
        
        return jsonify({"mac": formatted_mac})
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to generate valid MAC: {e}\033[0m")
        return jsonify({"error": "Failed to generate valid MAC address"}), 500

@app.route('/settings/get', methods=['GET'])
def get_setting():
    key = request.args.get('key')
    if not key:
        return jsonify({"error": "No key provided"}), 400
        
    value = settings.get(key, DEFAULT_SETTINGS.get(key, None))
    return jsonify({"key": key, "value": value})
    
# Helper function to normalize MAC addresses
def normalize_mac_address(mac):
    if not mac:
        return "Unknown"
    
    mac = re.sub(r'[^0-9a-fA-F:-]', '', mac)
    mac = mac.lower()
    if len(mac) == 12 and not (':' in mac or '-' in mac):
        mac = ':'.join([mac[i:i+2] for i in range(0, 12, 2)])
    mac = mac.replace('-', ':')
    
    return mac

def save_disabled_devices():
    with open(DISABLED_DEVICES_FILE, "w") as f:
        json.dump(DISABLED_DEVICES, f, indent=4)

def load_disabled_devices():
    if os.path.exists(DISABLED_DEVICES_FILE):
        with open(DISABLED_DEVICES_FILE, "r") as f:
            return json.load(f)
    return []

@app.route('/misc/download-oui', methods=['GET'])
def download_oui():
    import requests
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" # doesnt work without this
        }
        response = requests.get(OUI_URL, headers=headers, timeout=10)
        response.raise_for_status()
        with open(OUI_FILE, "w", encoding="utf-8") as f:
            f.write(response.text)
        
        return jsonify({"message": f"OUI file downloaded successfully to {OUI_FILE}."})
    except Exception as e:
        return jsonify({"error": f"Failed to download OUI file: {str(e)}"}), 500

def load_history(file_path):
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            try:
                data = json.load(f)
                return data if isinstance(data, list) else []  
            except json.JSONDecodeError:
                print("\033[91m[ERROR] Failed to decode JSON. Returning empty list.\033[0m")
                return []  
    return [] 

@app.route('/misc/clear-history', methods=['POST'])
def clear_history():
    try:
        data = request.json
        option = data.get("option", "all") 

        if option in ["scan", "all"]:
            if os.path.exists(SCAN_HISTORY_FILE):
                scans = load_history(SCAN_HISTORY_FILE)
                for scan in scans:
                    raw_json_path = os.path.join(HISTORY_FOLDER, os.path.basename(scan["rawJsonUrl"]))
                    if os.path.exists(raw_json_path):
                        os.remove(raw_json_path)
                os.remove(SCAN_HISTORY_FILE)

        if option in ["bypass", "all"]:
            if os.path.exists(BYPASS_HISTORY_FILE):
                os.remove(BYPASS_HISTORY_FILE)

        return jsonify({"message": f"History cleared for: {option}"})
    except Exception as e:
        return jsonify({"error": f"Failed to clear history: {str(e)}"}), 500

@app.route('/misc/oui-info', methods=['GET'])
def get_oui_info():
    if not os.path.exists(OUI_FILE):
        return jsonify({"exists": False})
    
    try:
        _load_vendor_cache() 
        vendor_count = len(set(_VENDOR_CACHE.values())) if _VENDOR_CACHE else 0
        file_size = os.path.getsize(OUI_FILE)
        last_modified = os.path.getmtime(OUI_FILE)
        
        return jsonify({
            "exists": True,
            "vendor_count": vendor_count,
            "size": file_size,
            "last_modified": last_modified
        })
    except Exception as e:
        return jsonify({"error": f"Failed to get OUI info: {str(e)}"}), 500

@app.route('/network/disable', methods=['POST'])
def disable_device():
    try:
        data = request.json
        ip = data.get('ip')
        mac = data.get('mac')

        if not ip or not re.match(r'^(\d{1,3}\.){3}\d{1,3}$', ip):
            return jsonify({"error": "Invalid IP address"}), 400

        mac_regex = r'^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^[0-9A-Fa-f]{12}$'
        if not mac or not re.match(mac_regex, mac):
            return jsonify({"error": "Invalid MAC address"}), 400

        if not network_controller.validate_target(ip, mac):
            return jsonify({"error": "MAC validation failed"}), 400

        # Add the device to the temporary disabled devices list
        DISABLED_DEVICES.append({"ip": ip, "mac": mac})
        save_disabled_devices()  # Save the updated list
        network_controller.block_device(ip, mac)
        return jsonify({"message": f"Device {mac} ({ip}) disabled successfully."})
    except Exception as e:
        return jsonify({"error": f"Failed to disable device: {str(e)}"}), 500

@app.route('/network/enable', methods=['POST'])
def enable_device():
    try:
        data = request.json
        mac = data['mac']

        # Remove the device from the disabled devices list
        global DISABLED_DEVICES
        DISABLED_DEVICES = [d for d in DISABLED_DEVICES if d['mac'] != mac]
        save_disabled_devices()  # Save the updated list

        network_controller.restore_device(mac)
        return jsonify({"message": f"Device with MAC {mac} re-enabled successfully."})
    except Exception as e:
        return jsonify({"error": f"Failed to enable device: {str(e)}"}), 500

@app.route('/network/disabled-devices', methods=['GET'])
def get_disabled_devices():
    return jsonify(DISABLED_DEVICES)

@app.before_request
def clear_disabled_devices_on_startup():
    global DISABLED_DEVICES, disabled_devices_cleared
    if not disabled_devices_cleared:
        DISABLED_DEVICES = load_disabled_devices()
        disabled_devices_cleared = True
        print("\033[93m[INFO] Disabled devices list loaded on server startup.\033[0m")

def get_subnet():
    default_gateway = get_default_gateway()
    if default_gateway:
        subnet = '.'.join(default_gateway.split('.')[:3])
        return f"{subnet}.0/24"
    else:
        raise ValueError("Unable to determine default gateway")
    
def load_settings():
    settings_changed = False
    if not os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "w") as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        print("\033[94m[INFO] Created new settings file with default settings in settings dir.\033[0m")
        return DEFAULT_SETTINGS, settings_changed

    with open(SETTINGS_FILE, "r") as f:
        user_settings = json.load(f)

    # Ensure version/default keys from DEFAULT_SETTINGS exist
    updated_settings = {key: user_settings.get(key, DEFAULT_SETTINGS[key]) for key in DEFAULT_SETTINGS}

    for key in DEFAULT_SETTINGS:
        if key not in user_settings:
            settings_changed = True

    if updated_settings != user_settings:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(updated_settings, f, indent=4)

    return updated_settings, settings_changed

settings, settings_changed = load_settings()

_local_ip_cache = None
def get_local_ip():
    global _local_ip_cache
    if _local_ip_cache:
        return _local_ip_cache
    
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # This is a non-blocking operation and doesn't actually send data
        s.connect(("8.8.8.8", 80))
        _local_ip_cache = s.getsockname()[0]
    except OSError:
        # Fallback for offline scenarios
        _local_ip_cache = "127.0.0.1"
    finally:
        s.close()
    return _local_ip_cache

@app.route('/history/json/<filename>', methods=['GET'])
def get_json_file(filename):
    try:
        file_path = os.path.join(HISTORY_FOLDER, filename)

        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return app.response_class(content, content_type="application/json")
    except Exception as e:
        return jsonify({"error": f"Failed to fetch JSON file: {str(e)}"}), 500

def save_history(file_path, data):
    with open(file_path, "w") as f:
        json.dump(data, f, indent=4)

def log_scan_history(scan_type, device_count, results, scanning_method, duration):
    history = load_history(SCAN_HISTORY_FILE) or [] 
    scan_id = str(uuid.uuid4())
    filename = f"{scan_id}.json"
    raw_json_path = os.path.join(HISTORY_FOLDER, filename)
    with open(raw_json_path, "w") as f:
        json.dump(results, f, indent=4)
    history.append({
        "id": scan_id,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "type": scan_type,
        "deviceCount": device_count,
        "rawJsonUrl": f"/history/json/{filename}",
        "scanning_method": scanning_method,
        "duration": duration
    })
    save_history(SCAN_HISTORY_FILE, history)

def log_bypass_history(previous_mac, new_mac, method, transport, mac_mode=None):
    history = load_history(BYPASS_HISTORY_FILE) or []
    history.append({
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "previousMac": previous_mac,
        "newMac": new_mac,
        "method": method,
        "transport": transport,
        "mac_mode": mac_mode  # Add MAC mode to distinguish between standard, Tmac, and LAA
    })
    save_history(BYPASS_HISTORY_FILE, history)

@lru_cache(maxsize=128)
def parse_ping_output(output, start_time, end_time):
    try:
        if platform.system().lower() == 'windows':
            match = re.search(r'Average = (\d+)ms', output)
            if not match:
                match = re.search(r'time[=<](\d+)ms', output)
            ping_time = int(match.group(1)) if match else int((end_time - start_time) * 1000)
        else:
            match = re.search(r'time=(\d+\.\d+) ms', output)
            ping_time = float(match.group(1)) if match else int((end_time - start_time) * 1000)
        return ping_time
    except:
        return int((end_time - start_time) * 1000)

@app.route('/api/ping', methods=['GET'])
def ping_device():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({'error': 'No IP address provided'}), 400
    
    ping_manager.request_ping(ip)
    
    ping_data = ping_manager.get_ping_data(ip)
    
    if ping_data:
        return jsonify(ping_data)
    else:
        return jsonify({
            'ip': ip,
            'success': True,
            'time': 50, 
            'signal': 75,
            'processing': True
        })

@app.route('/api/ping/batch', methods=['POST'])
def batch_ping_devices():
    data = request.json
    if not data or 'ips' not in data:
        return jsonify({'error': 'No IP addresses provided'}), 400
    
    ips = data['ips']
    
    results = ping_manager.get_ping_batch(ips)
    for ip in ips:
        if ip not in results:
            results[ip] = {
                'ip': ip,
                'success': True,
                'time': 50,  # Default value
                'signal': 75,
                'processing': True
            }
    
    return jsonify(results)

@app.route('/monitor/connections', methods=['GET'])
def monitor_connections():
    try:
        data = connection_monitor.get_connections()
        if settings.get("debug_mode", "off") == "full":
            app.logger.debug(f"/monitor/connections -> {len(data)} processes")
        return jsonify({
            "connections": data,
            "timestamp": time.time()
        })
    except Exception as e:
        app.logger.error(f"/monitor/connections error: {e}")
        return jsonify({"error": "Failed to retrieve connections"}), 500

@app.route('/monitor/whois', methods=['GET'])
def monitor_whois():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({"success": False, "error": "Missing ip parameter"}), 400
    try:
        result = connection_monitor.perform_whois_lookup(ip)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        app.logger.error(f"/monitor/whois error ({ip}): {e}")
        return jsonify({"success": False, "error": "WHOIS lookup failed"}), 500

@app.route('/monitor/deep-dive', methods=['GET'])
def monitor_deep_dive():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({"success": False, "error": "Missing ip parameter"}), 400
    try:
        result = connection_monitor.perform_deep_dive(ip)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        app.logger.error(f"/monitor/deep-dive error ({ip}): {e}")
        return jsonify({"success": False, "error": "Deep dive failed"}), 500

def clear_expired_ping_cache():
    with ping_lock:
        current_time = time.time()
        expired_keys = [ip for ip, data in PING_CACHE.items() 
                       if current_time - data['timestamp'] > PING_CACHE_TIMEOUT * 2]
        for ip in expired_keys:
            del PING_CACHE[ip]

_cleanup_started = False

@app.before_request
def start_cleanup_task():
    global _cleanup_started
    if not _cleanup_started:
        _cleanup_started = True
        from threading import Thread
        import time
        
        def cleanup_task():
            while True:
                time.sleep(PING_CACHE_TIMEOUT * 2)
                clear_expired_ping_cache()
                cleanup_abandoned_ping_connections()
        
        thread = Thread(target=cleanup_task)
        thread.daemon = True
        thread.start()

@app.route('/network/restart-adapters', methods=['POST'])
def restart_network_adapters():
    try:
        data = request.json or {}
        transport_name = data.get('transport')
        
        if transport_name:
            if restart_adapter_by_transport(transport_name):
                return jsonify({"message": f"Network adapter with transport {transport_name} restarted successfully."})
            else:
                return jsonify({"error": f"Failed to restart adapter with transport {transport_name}."}), 500
        else:
            if restart_all_adapters():
                return jsonify({"message": "All network adapters restarted successfully."})
            else:
                return jsonify({"error": "Failed to restart network adapters."}), 500
    except Exception as e:
        return jsonify({"error": f"Failed to restart network adapters: {str(e)}"}), 500

@app.route('/bypass/ignored-adapters', methods=['GET'])
def get_ignored_adapters():
    try:
        return jsonify({"ignored_adapters": IGNORE_LIST})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def restart_adapter_by_transport(transport_name):
    try:
        instances = neftcfg_search(transport_name)
        if not instances:
            print(f"\033[91m[ERROR] No adapter found with transport name: {transport_name}\033[0m")
            return False
        
        _, sub_name = instances[0]
        adapter_desc = get_adapter_name(sub_name)
        
        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] Found adapter description: {adapter_desc} for transport: {transport_name}\033[0m")

        result = subprocess.run(
            ["netsh", "interface", "show", "interface"],
            capture_output=True,
            text=True
        )
        
        adapter_name = None
        for line in result.stdout.splitlines():
            if adapter_desc and adapter_desc in line:
                parts = line.split()
                if len(parts) >= 4:
                    adapter_name = " ".join(parts[3:])
                    break
        
        if not adapter_name:
            print(f"\033[91m[ERROR] Could not find interface name for adapter: {adapter_desc}\033[0m")
            return False
            
        ip_result = subprocess.run(
            ["netsh", "interface", "ip", "show", "addresses", adapter_name],
            capture_output=True,
            text=True
        )
        adapter_ip = None
        for line in ip_result.stdout.splitlines():
            if "IP Address" in line:
                adapter_ip = line.split(":")[1].strip()
                break
        
        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] Found IP address: {adapter_ip} for adapter: {adapter_name}\033[0m")
        
        if adapter_ip:
            print(f"\033[94m[DEBUG] Targeting adapter restart by IP: {adapter_ip}\033[0m")
            return restart_all_adapters(target_ip=adapter_ip)
        else:
            return restart_specific_adapter(adapter_name)
        
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to restart adapter by transport {transport_name}: {e}\033[0m")
        return False

def restart_specific_adapter(adapter_name):
    try:
        print(f"\033[94m[DEBUG] Performing soft restart for adapter: {adapter_name}\033[0m")
        
        # Use PowerShell for a faster, soft restart
        result = subprocess.run(
            ["powershell", "-Command", f"Restart-NetAdapter -Name '{adapter_name}' -Confirm:$false"],
            check=True,
            capture_output=True,
            text=True
        )
        
        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] Powershell output: {result.stdout}\033[0m")

        time.sleep(0.2) # Short delay for link negotiation
        
        print(f"\033[92m[INFO] Successfully requested restart for adapter: {adapter_name}\033[0m")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"\033[91m[ERROR] Failed to restart adapter {adapter_name} using Powershell: {e.stderr}\033[0m")
        return False
    except Exception as e:
        print(f"\033[91m[ERROR] An unexpected error occurred while restarting adapter {adapter_name}: {e}\033[0m")
        return False

@app.route('/bypass/revert-mac', methods=['POST'])
def revert_mac():
    try:
        start_time = time.time()
        data = request.json
        transport_name = data['transport']
        old_mac = data['mac']

        print(f"\033[94m[DEBUG] Starting MAC revert process for transport: {transport_name}\033[0m")
        print(f"\033[94m[DEBUG] Reverting to MAC: {old_mac}\033[0m")

        instances = neftcfg_search(transport_name)
        if not instances:
            return jsonify({"error": "No network configurations found for the specified transport"}), 404

        instance = instances[0]
        key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{instance[1]}"

        # Check if current MAC is already set (to detect hardware MAC)
        original_mac = None
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                try:
                    original_mac = winreg.QueryValueEx(key, 'NetworkAddress')[0]
                    print(f"\033[94m[DEBUG] Current MAC in registry: {original_mac}\033[0m")
                except FileNotFoundError:
                    pass
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to read current MAC: {e}\033[0m")
        
        # Make sure MAC is properly formatted (no colons, uppercase)
        formatted_mac = old_mac.replace(":", "").upper()
        
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_ALL_ACCESS) as key:
            # To revert to hardware MAC, delete the key instead of setting it
            if formatted_mac.lower() == "hardware" or formatted_mac.lower() == "default":
                try:
                    winreg.DeleteValue(key, 'NetworkAddress')
                    print(f"\033[94m[DEBUG] Removed NetworkAddress registry key to revert to hardware MAC\033[0m")
                except FileNotFoundError:
                    pass  # Key doesn't exist, which is fine for hardware MAC
            else:
                winreg.SetValueEx(key, 'NetworkAddress', 0, winreg.REG_SZ, formatted_mac)
                print(f"\033[94m[DEBUG] Updated registry with MAC: {formatted_mac}\033[0m")

        # Restart the network adapters
        print(f"\033[94m[DEBUG] Restarting network adapter...\033[0m")
        if settings.get("accelerated_bypassing", True):
            if restart_all_adapters():
                end_time = time.time()
                elapsed_time = end_time - start_time
                print(f"\033[94m[DEBUG] Successfully requested MAC address change for: {transport_name}\033[0m")
                print(f"\033[94m[DEBUG] Revert process completed in {elapsed_time:.2f} seconds\033[0m")
                return jsonify({"message": f"MAC address change requested successfully."})
            else:
                return jsonify({"error": "Failed to restart network adapters"}), 500
        else:
            end_time = time.time()
            elapsed_time = end_time - start_time
            print(f"\033[94m[DEBUG] MAC revert requested. Adapter restart skipped by user setting.\033[0m")
            return jsonify({"message": f"MAC address change requested. Please restart adapter manually."})

    except PermissionError:
        return jsonify({"error": "Permission denied. Please run the application as an administrator."}), 403
    except Exception as e:
        return jsonify({"error": f"Failed to revert MAC address: {str(e)}"}), 500

@app.route('/scan/ports')
def scan_ports_route():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({"error": "IP address is required"}), 400
    
    try:
        monitor = ConnectionMonitor()
        open_ports = monitor._scan_common_ports(ip)
        return jsonify({"ports": open_ports})
    except Exception as e:
        print(f"\033[91m[ERROR] Port scan for {ip} failed: {e}\033[0m")
        return jsonify({"error": str(e)}), 500

@app.route('/bypass/adapters')
def get_adapters():
    try:
        show_ignored = request.args.get('show_ignored', 'false').lower() == 'true'
        transport_names_list, driver_desc_list, mp_transport = transport_names()
        adapters = []
        
        for idx, name in enumerate(transport_names_list[:5]):
            is_ignored = driver_desc_list[idx] in IGNORE_LIST
            
            if is_ignored and not show_ignored:
                continue
                
            adapters.append({
                "transport": name,
                "description": driver_desc_list[idx],
                "default": name == mp_transport,
                "ignored": is_ignored
            })
            
        return jsonify(adapters)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/misc/open-history-folder', methods=['POST'])
def open_history_folder():
    try:
        history_folder_path = APPDATA_LOCATION
        if os.name == 'nt': 
            subprocess.Popen(f'explorer "{history_folder_path}"')
        return jsonify({"message": "Storage folder opened successfully."})
    except Exception as e:
        return jsonify({"error": f"Failed to open Storage Folder: {str(e)}"}), 500

@app.route('/bypass/change-mac', methods=['POST'])
def bypass_change_mac():
    data = request.json
    transport = data.get('transport')
    mode = data.get('mode', 'standard')
    manual_mac = data.get('manual_mac') 
    use_hardware_rng = data.get('hardware_rng', True)
    accelerated_bypassing = settings.get("accelerated_bypassing", True)
    
    if not transport:
        return jsonify({"error": "Transport name is required"}), 400
        
    # Find device with this transport name
    instances = neftcfg_search(transport)
    if not instances:
        return jsonify({"error": "No network adapter found with this transport name"}), 404
    
    # Use the first instance found
    _, sub_name = instances[0]
    
    # Get current MAC before changing
    key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{sub_name}"
    current_mac = None
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            try:
                current_mac = winreg.QueryValueEx(key, 'NetworkAddress')[0]
            except FileNotFoundError:
                pass
    except Exception as e:
        app.logger.error(f"Error getting current MAC: {str(e)}")
    
    # Change the MAC address
    new_mac = init_bypass(sub_name, mac_mode=mode, use_hardware_rng=use_hardware_rng, restart_adapters=accelerated_bypassing, manual_mac=manual_mac)
    if new_mac:
        note = "MAC address changed successfully"
        # Log the change to history with mac_mode
        log_bypass_history(
            normalize_mac_address(current_mac or "Unknown"),
            normalize_mac_address(new_mac),
            "registry",
            transport,
            mac_mode=mode
        )
        return jsonify({
            "success": True,
            "message": "MAC Address Changed",
            "adapter": get_adapter_name(sub_name),
            "previous_mac": normalize_mac_address(current_mac or "Unknown"),
            "new_mac": normalize_mac_address(new_mac),
            "note": note
        })
    else:
        return jsonify({
            "error": "Failed to change MAC address"
        }, 500)

@app.before_request
def restrict_access():
    if settings.get("hide_website", True):  
        client_ip = request.remote_addr
        if client_ip not in [get_local_ip(), "127.0.0.1"]:
            return redirect("https://www.google.com")

@app.route('/updater/download', methods=['POST'])
def download_update():
    import requests
    import shutil
    try:
        data = request.json
        download_url = data.get('url')
        version = data.get('version')
        
        if not download_url or not version:
            return jsonify({"success": False, "error": "Missing download URL or version"}), 400
        
        temp_dir = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "updates")
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
        
        response = requests.get(download_url, stream=True, timeout=30)
        if not response.ok:
            return jsonify({"success": False, "error": f"Failed to download: {response.status_code}"}), 500
        
        file_path = os.path.join(temp_dir, "server.exe")
        with open(file_path, 'wb') as f:
            shutil.copyfileobj(response.raw, f)
        
        with open(os.path.join(temp_dir, "version.txt"), 'w') as f:
            f.write(version)

        try:
            new_version_value = version.replace('v', '')
            write_version_file(new_version_value)
            print(f"\033[92m[UPDATE] Wrote VERSION_FILE -> {new_version_value}\033[0m")
        except Exception as e:
            print(f"\033[93m[WARN] Could not write VERSION_FILE: {e}\033[0m")

        return jsonify({"success": True, "message": "Update downloaded successfully"})
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/updater/restart', methods=['POST'])
def restart_application():
    try:
        def delayed_restart():
            time.sleep(1.0) 
            
            update_dir = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "updates")
            update_file = os.path.join(update_dir, "server.exe")
            version_file = os.path.join(update_dir, "version.txt")
            
            if os.path.exists(update_file) and os.path.exists(version_file):
                with open(version_file, 'r') as f:
                    version = f.read().strip()

                desktop_path = os.path.join(os.path.join(os.environ['USERPROFILE']), 'Desktop')
                new_exe_filename = f"server_{version}.exe"
                desktop_exe = os.path.join(desktop_path, new_exe_filename)
                
                batch_path = os.path.join(update_dir, "update.bat")
                with open(batch_path, 'w') as f:
                    f.write(f"""@echo off
echo Starting update process...
timeout /t 2 /nobreak > nul
echo Copying update file to Desktop...
copy /Y "{update_file}" "{desktop_exe}"
echo Starting application from Desktop...
start "" "{desktop_exe}"
echo Cleaning up temp files...
cd ..
rmdir /s /q "{update_dir}"
echo Update completed successfully.
del "%~f0"
""")
                subprocess.Popen([batch_path], shell=True, creationflags=subprocess.CREATE_NEW_CONSOLE)
                
                time.sleep(0.5)
                os._exit(0)
            else:
                subprocess.Popen([sys.executable] + sys.argv)
                time.sleep(0.5)
                os._exit(0)
        
        threading.Thread(target=delayed_restart, daemon=True).start()
        
        return jsonify({"success": True, "message": "Application will restart and updated version will be placed on Desktop"})
    
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to restart application: {e}\033[0m")
        return jsonify({"success": False, "error": str(e)}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    print(f"\033[91m[ERROR] Unhandled exception in {request.path}: {str(e)}\033[0m")
    import traceback
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500

@app.route('/updater/changelog', methods=['GET'])
def get_changelog():
    import requests
    import base64
    try:
        owner = "countervolts"
        repo = "network-related-thing"
        path = "changelog.md"
        
        api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
        response = requests.get(
            api_url,
            headers={
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "ChangelogRequestApp"
            }
        )
        response.raise_for_status()
        
        content_data = response.json()
        content = base64.b64decode(content_data["content"]).decode("utf-8")
        
        changelog_data = []
        current_version = None
        current_section = None
        
        for line in content.split('\n'):
            if line.startswith('# Changelog'):
                continue
            
            # Version headers
            elif line.startswith('## [v'):
                # Extract version and date
                version_match = re.match(r'## \[(v\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})', line)
                if version_match:
                    version, date = version_match.groups()
                    current_version = {
                        "version": version,
                        "date": date,
                        "sections": [],
                        "isLatest": len(changelog_data) == 0  # First version found is latest
                    }
                    changelog_data.append(current_version)
                    current_section = None
            
            # Section headers (Added, Changed, Fixed, etc.)
            elif line.startswith('### ') and current_version is not None:
                section_title = line[4:].strip()
                current_section = {
                    "title": section_title,
                    "items": []
                }
                current_version["sections"].append(current_section)
            
            # Bullet points and items
            elif line.strip().startswith('- ') and current_section is not None:
                item_text = line.strip()[2:].strip()
                # Process Markdown formatting - handle ** for bold text
                current_section["items"].append(item_text)
        
        # Filter to just show the latest version if requested
        show_latest_only = request.args.get('latest', 'false').lower() == 'true'
        if show_latest_only and changelog_data:
            latest_version = next((v for v in changelog_data if v.get('isLatest')), None)
            if latest_version:
                changelog_data = [latest_version]
        
        return jsonify(changelog_data)
    
    except requests.exceptions.RequestException as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to fetch changelog from GitHub: {e}\033[0m")
        return jsonify({"error": f"Failed to fetch changelog from GitHub: {str(e)}"}), 500
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to process changelog: {e}\033[0m")
        return jsonify({"error": f"Failed to process changelog: {str(e)}"}), 500

@app.route('/updater/releases', methods=['GET'])
def get_all_releases():
    import requests
    try:
        owner = "countervolts"
        repo = "network-related-thing"
        api_url = f"https://api.github.com/repos/{owner}/{repo}/releases"
        
        response = requests.get(
            api_url,
            headers={
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "ReleaseFetchApp"
            },
            timeout=10
        )
        response.raise_for_status()
        
        releases_data = response.json()
        versions = []
        
        for release in releases_data:
            tag_name = release.get("tag_name")
            if not tag_name:
                continue
            
            published_at = release.get("published_at")
            
            server_exe_asset = next((asset for asset in release.get('assets', []) if asset['name'] == 'server.exe'), None)
            if server_exe_asset:
                versions.append({
                    "version": tag_name,
                    "download_url": server_exe_asset.get("browser_download_url"),
                    "published_at": published_at
                })
        
        return jsonify(versions)
        
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch releases from GitHub: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Failed to process releases: {str(e)}"}), 500

@app.route('/system/info')
def get_system_info():
    import psutil
    import urllib.request
    try:
        # Get network info
        internal_ip = get_local_ip()
        mac_address = get_mac_address()
        
        # Get external IP and ISP with shorter timeout
        external_ip = "Offline"
        isp = "Offline"
        try:
            external_ip_data = urllib.request.urlopen('https://api.ipify.org?format=json', timeout=2).read()
            external_ip = json.loads(external_ip_data)['ip']
            
            # Try to get ISP info with shorter timeout
            isp_data = urllib.request.urlopen(f'https://ipinfo.io/{external_ip}/json', timeout=2).read()
            isp_info = json.loads(isp_data)
            isp = isp_info.get('org', 'Offline')
        except Exception:
            # Use default "Offline" values
            pass
        
        # Get CPU info with improved formatting and vendor info
        cpu_info = platform.processor()
        cpu_threads = os.cpu_count() or 'N/A'
            
        try:
            # --- CPU Name Gathering ---
            reg_cpu_name = None
            wmic_name = None

            # 1. Try reading from the registry
            try:
                key_path = r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                    reg_cpu_name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                    reg_cpu_name = reg_cpu_name.strip()
            except Exception:
                pass

            # 2. Try WMIC for CPU name
            try:
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                cpu_output = subprocess.check_output("wmic cpu get name", shell=True, startupinfo=startupinfo).decode('utf-8').strip()
                cpu_lines = cpu_output.split('\n')
                if len(cpu_lines) > 1:
                    wmic_name = cpu_lines[1].strip()
            except Exception:
                pass

            # --- Selection Logic ---
            cpu_name = reg_cpu_name  # Start with registry result

            # Fallback to WMIC if registry failed or is empty
            if not cpu_name:
                if wmic_name and not ("Family" in wmic_name and "Model" in wmic_name and "Stepping" in wmic_name):
                    cpu_name = wmic_name
            
            # Get CPU vendor
            cpu_vendor = "Unknown"
            try:
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                vendor_output = subprocess.check_output("wmic cpu get Manufacturer", shell=True, startupinfo=startupinfo).decode('utf-8').strip()
                vendor_lines = vendor_output.split('\n')
                if len(vendor_lines) > 1:
                    cpu_vendor = vendor_lines[1].strip()
            except Exception:
                pass
            
            # Update cpu_info if a better name was found
            if cpu_name:
                cpu_info = f"{cpu_name} ({cpu_vendor})"
                
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            gpu_output = subprocess.check_output("wmic path win32_VideoController get name", shell=True, startupinfo=startupinfo).decode('utf-8').strip()
            gpu_lines = gpu_output.split('\n')
            gpu_info = "Unknown"
            for line in gpu_lines[1:]:

                name = line.strip()
                if name and "Microsoft" not in name and not name.startswith("Standard"):
                    gpu_info = name
                    break
        except Exception as hw_err:
            print(f"Hardware detection error: {hw_err}")
            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu_info = gpus[0].name
            except:
                gpu_info = "Unknown"
        
        # Get memory info
        memory_info = f"{round(psutil.virtual_memory().total / (1024**3), 2)} GB"
        
        # Get total storage across all drives
        total_storage = 0
        for partition in psutil.disk_partitions():
            try:
                if platform.system() == 'Windows' and 'cdrom' in partition.opts:
                    continue
                usage = psutil.disk_usage(partition.mountpoint)
                total_storage += usage.total
            except:
                pass
        
        storage_info = f"{round(total_storage / (1024**3), 2)} GB"
        
        return jsonify({
            "internal_ip": internal_ip,
            "external_ip": external_ip,
            "mac_address": mac_address,
            "isp": isp,
            "cpu": cpu_info,
            "gpu": gpu_info,
            "memory": memory_info,
            "storage": storage_info,
            "cpu_threads": cpu_threads
        })
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to get system info: {e}\033[0m")
        return jsonify({
            "error": "Failed to get system info"
        }, 500)

@app.route('/statistics', methods=['GET'])
def get_statistics():
    try:
        bypass_count = 0
        if os.path.exists(BYPASS_HISTORY_FILE):
            with open(BYPASS_HISTORY_FILE, 'r') as f:
                bypass_history = json.load(f)
                bypass_count = len(bypass_history)
        
        basic_scan_count = 0
        full_scan_count = 0
        if os.path.exists(SCAN_HISTORY_FILE):
            with open(SCAN_HISTORY_FILE, 'r') as f:
                scan_history = json.load(f)
                basic_scan_count = sum(1 for entry in scan_history if entry.get('type') == 'Basic')
                full_scan_count = sum(1 for entry in scan_history if entry.get('type') == 'Full')
        
        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] Statistics: bypasses={bypass_count}, basic_scans={basic_scan_count}, full_scans={full_scan_count}\033[0m")
        
        return jsonify({
            'bypass_count': bypass_count,
            'basic_scan_count': basic_scan_count,
            'full_scan_count': full_scan_count
        })
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to get statistics: {e}\033[0m")
        return jsonify({'error': str(e)}), 500

def count_history_entries(history_type):
    try:
        history_file = os.path.join("src", "history", f"{history_type}_history.json")
        if os.path.exists(history_file):
            with open(history_file, 'r') as f:
                history = json.load(f)
                return len(history)
        return 0
    except:
        return 0

def load_scan_history():
    try:
        history_file = os.path.join("src", "history", "scan_history.json")
        if os.path.exists(history_file):
            with open(history_file, 'r') as f:
                return json.load(f)
        return []
    except:
        return []

@app.route('/history/scans', methods=['GET'])
def get_scan_history():
    return jsonify(load_history(SCAN_HISTORY_FILE))

@app.route('/history/scans/<scan_id>', methods=['DELETE'])
def delete_scan_history(scan_id):
    history = load_history(SCAN_HISTORY_FILE)
    updated_history = [item for item in history if item["id"] != scan_id]
    
    # Also delete the raw JSON file
    scan_to_delete = next((item for item in history if item["id"] == scan_id), None)
    if scan_to_delete:
        filename = f"{scan_id}.json"
        raw_json_path = os.path.join(HISTORY_FOLDER, filename)
        if os.path.exists(raw_json_path):
            os.remove(raw_json_path)

    save_history(SCAN_HISTORY_FILE, updated_history)
    return jsonify({"message": "Scan history deleted successfully."})

@app.route('/history/scans/delete-batch', methods=['POST'])
def delete_scan_history_batch():
    data = request.get_json()
    ids_to_delete = data.get('ids', [])
    if not ids_to_delete:
        return jsonify({"error": "No IDs provided"}), 400

    history = load_history(SCAN_HISTORY_FILE)
    
    scans_to_delete = [item for item in history if item["id"] in ids_to_delete]
    updated_history = [item for item in history if item["id"] not in ids_to_delete]

    for scan in scans_to_delete:
        filename = f"{scan['id']}.json"
        raw_json_path = os.path.join(HISTORY_FOLDER, filename)
        if os.path.exists(raw_json_path):
            try:
                os.remove(raw_json_path)
            except OSError as e:
                print(f"Error deleting file {raw_json_path}: {e}")


    save_history(SCAN_HISTORY_FILE, updated_history)
    return jsonify({"message": f"{len(scans_to_delete)} scan histories deleted successfully."})

@app.route('/history/bypasses', methods=['GET'])
def get_bypass_history():
    return jsonify(load_history(BYPASS_HISTORY_FILE))

@app.route('/scan/hostname', methods=['GET'])
def get_hostname_route():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({"error": "IP address is required"}), 400
    
    from src.ping import get_hostname
    hostname = get_hostname(ip)
    
    return jsonify({"ip": ip, "hostname": hostname})

@app.route('/scan/basic')
def basic_scan():
    try:
        start_time = time.time()  
        subnet = get_subnet()
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[94m[DEBUG] Performing basic scan on subnet: {subnet}\033[0m")
        
        scanning_method = settings.get("scanning_method", "divide_and_conquer")
        parallel_scans = settings.get("parallel_scans", True)
        multiplier = int(settings.get("override_multiplier", 2))
        results = scan_network(
            subnet=subnet, 
            scan_hostname=False, 
            scan_vendor=False,
            scanning_method=scanning_method,
            parallel_scans=parallel_scans,
            parallel_multiplier=multiplier
        ) or []
        local_ip = get_local_ip()
        local_mac = get_mac_address()
        for result in results:
            if result["ip"] == local_ip:
                result["mac"] = local_mac
                break
        
        for result in results:
            result["hostname"] = "Skipped"
            result["vendor"] = "Skipped"

        end_time = time.time()
        duration = end_time - start_time
        log_scan_history("Basic", len(results), results, scanning_method, duration)
        print(f"\033[92m[INFO] Basic Scan completed. {len(results)} devices found.\033[0m")
        
        print(f"\033[94m[DEBUG] Basic scan duration: {duration:.2f} seconds\033[0m")
        
        return jsonify(results)
    except Exception as e:
        print(f"\033[91m[ERROR] Basic scan failed: {e}\033[0m")
        return jsonify({"error": "Basic scan failed"}), 500

@app.route('/clear-console', methods=['POST'])
def clear_console():
    try:
        os.system('cls')
        print("\033[92m[INFO] Console cleared.\033[0m")
        return jsonify({"message": "Console cleared successfully."})
    except Exception as e:
        return jsonify({"error": f"Failed to clear console: {str(e)}"}), 500

@app.route('/scan/full')
def full_scan():
    try:
        start_time = time.time()
        subnet = get_subnet()
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[94m[DEBUG] Performing full scan on subnet: {subnet}\033[0m")

        oui_file_missing = not os.path.exists(OUI_FILE)
        
        scanning_method = settings.get("scanning_method", "divide_and_conquer")
        parallel_scans = settings.get("parallel_scans", True)
        multiplier = int(settings.get("override_multiplier", 2))
        results = scan_network(
            subnet=subnet,
            scan_hostname=True,
            scan_vendor=not oui_file_missing,
            scanning_method=scanning_method,
            parallel_scans=parallel_scans,
            parallel_multiplier=multiplier
        )
        local_ip = get_local_ip()
        local_mac = get_mac_address()  
        for result in results:
            if result["ip"] == local_ip:
                result["mac"] = local_mac
                break
        
        end_time = time.time()
        duration = end_time - start_time
        log_scan_history("Full", len(results), results, scanning_method, duration)
        print(f"\033[92m[INFO] Full Scan completed. {len(results)} devices found.\033[0m")
        
        print(f"\033[94m[DEBUG] Full scan duration: {duration:.2f} seconds\033[0m")
        
        return jsonify({
            "results": results,
            "message": "Full scan completed successfully.",
            "warning": "OUI file is missing. No vendor information. You can download it in the misc tab." if oui_file_missing else None
        })
    except Exception as e:
        print(f"\033[91m[ERROR] Full scan failed: {e}\033[0m")
        return jsonify({"error": "Full scan failed"}), 500

@app.route('/misc/history-sizes', methods=['GET'])
def get_history_sizes():
    try:
        scan_size = os.path.getsize(SCAN_HISTORY_FILE) if os.path.exists(SCAN_HISTORY_FILE) else 0
        bypass_size = os.path.getsize(BYPASS_HISTORY_FILE) if os.path.exists(BYPASS_HISTORY_FILE) else 0
        total_size = scan_size + bypass_size

        return jsonify({
            "scan": scan_size,
            "bypass": bypass_size,
            "all": total_size
        })
    except Exception as e:
        return jsonify({"error": f"Failed to calculate history sizes: {str(e)}"}), 500

class EndpointFilter(logging.Filter):
    def __init__(self, excluded_paths):
        self.excluded_paths = excluded_paths
        super(EndpointFilter, self).__init__()

    def filter(self, record):
        message = record.getMessage()
        for path in self.excluded_paths:
            if f"GET {path}" in message or f"POST {path}" in message:
                return False
        return True

def update_logging_level(debug_mode):
    root_logger = logging.getLogger()
    werkzeug_logger = logging.getLogger('werkzeug')
    
    # Keep existing handlers but update their levels
    if is_running_in_electron():
        console_level = logging.DEBUG
        root_logger.setLevel(logging.DEBUG)
        werkzeug_logger.setLevel(logging.DEBUG)
        app.logger.setLevel(logging.DEBUG)
    else:
        # Use specified debug level if not in Electron
        if debug_mode == "off":
            console_level = logging.ERROR
            root_logger.setLevel(logging.ERROR)
            werkzeug_logger.setLevel(logging.ERROR)
            app.logger.setLevel(logging.ERROR)
        elif debug_mode == "basic":
            console_level = logging.INFO
            root_logger.setLevel(logging.INFO)
            werkzeug_logger.setLevel(logging.INFO)
            app.logger.setLevel(logging.INFO)
        elif debug_mode == "full":
            console_level = logging.DEBUG
            root_logger.setLevel(logging.DEBUG)
            werkzeug_logger.setLevel(logging.DEBUG)
            app.logger.setLevel(logging.DEBUG)
    
    # Silence noisy queue / access loggers regardless of mode
    for noisy in ['waitress.queue', 'waitress', 'hypercorn.error', 'hypercorn.access']:
        try:
            logging.getLogger(noisy).setLevel(logging.ERROR)
            # Optional: to nuke them entirely use: logging.getLogger(noisy).disabled = True
        except Exception:
            pass

    # Update levels of existing handlers
    for handler in werkzeug_logger.handlers:
        handler.setLevel(console_level)
    
    for handler in app.logger.handlers:
        handler.setLevel(console_level)
    
    if settings.get("debug_mode", "off") in ["basic", "full"]:
        print(f"\033[94m[DEBUG] Logging level updated to: {debug_mode}\033[0m")

@app.before_request
def log_request():
    # keep existing logging, but also log remote addr and static root for debugging missing files
    try:
        client = request.remote_addr
    except Exception:
        client = 'unknown'
    if is_running_in_electron() or settings.get("debug_mode", "off") != "off":
        app.logger.debug(f"Request: {request.method} {request.path} from {client} (STATIC_ROOT={STATIC_ROOT})")
        if request.is_json and request.get_data():
            try:
                app.logger.debug(f"Request data: {request.get_json(silent=True)}")
            except Exception as e:
                app.logger.debug(f"Request data: <Invalid JSON> ({e})")

@app.after_request
def log_response(response):
    if is_running_in_electron() or settings.get("debug_mode", "off") != "off":
        app.logger.debug(f"Response: {response.status}")
    return response

@app.route('/settings')
def settings_route():
    settings_data = settings.copy()
    settings_data['cpu_thread_count'] = os.cpu_count()
    return jsonify(settings_data)

@app.route('/settings', methods=['POST'])
def update_settings():
    global settings
    updated_settings = request.json
    with open(SETTINGS_FILE, "w") as f:
        json.dump(updated_settings, f, indent=4)
    
    # Log changes by comparing with the old settings
    for key, value in updated_settings.items():
        if settings.get(key) != value:
            print(f"\033[94m[INFO] Setting changed: {key}={value}\033[0m")

    # Update the global settings variable in memory to match the file
    settings = updated_settings.copy()

    # Update logging level dynamically if debug mode changes
    update_logging_level(updated_settings.get("debug_mode", "off"))

    return jsonify({"message": "Settings updated successfully"})

@app.route('/exit', methods=['POST'])
def exit_server():
    print("\033[93m[INFO] Exit button clicked. Shutting down the server...\033[0m")
    graceful_shutdown(signal.SIGINT, None)
    return jsonify({"message": "Server shutting down gracefully."})

@app.route('/')
def index():
    # Serve the index.html from the runtime static root
    return send_from_directory(STATIC_ROOT, 'index.html')

@app.route('/favicon.ico')
def serve_favicon():
    try:
        return send_from_directory(STATIC_ROOT, 'favicon.ico')
    except NotFound:
        return jsonify({"error": "File not found"}), 404



@app.route('/src/<path:filename>')
def serve_src_files(filename):
    try:
        src_root = os.path.join(STATIC_ROOT, 'src')
        # debug log
        app.logger.debug(f"Serving /src/{filename} from {src_root}")
        return send_from_directory(src_root, filename)
    except NotFound:
        return jsonify({"error": "File not found"}), 404

# fallback catch-all (keep last)
@app.route('/<path:path>')
def static_files(path):
    try:
        # Normalize to prevent pt
        safe_path = os.path.normpath(path).lstrip(os.sep)
        app.logger.debug(f"Fallback static request for {safe_path} (STATIC_ROOT={STATIC_ROOT})")
        return send_from_directory(STATIC_ROOT, safe_path)
    except NotFound:
        return jsonify({"error": "File not found"}), 404

def has_perms():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except AttributeError:
        return False

def permission_giver():
    try:
        script_path = os.path.abspath(sys.argv[0])
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, f'"{script_path}"', None, None, 1)
        sys.exit(0)
    except Exception as e:
        input(f"Problem with giving permissions: {e}")

@app.route('/server/start', methods=['GET'])
def server_start():
    print("\033[92m[INFO] Server has started. Clearing client-side disabled devices.\033[0m")
    return jsonify({"message": "Server started. Clear disabled devices."})

@app.route('/api/client-loaded', methods=['POST'])
def client_loaded():
    global _CLIENT_LOADED
    first = not _CLIENT_LOADED
    _CLIENT_LOADED = True
    return jsonify({
        "ack": True,
        "already_loaded": not first,
        "server_start_time": START_TIME
    })

def graceful_shutdown(signal_received, frame):
    shutdown_msgs = []
    shutdown_msgs.append(f"\033[93m[INFO] Graceful shutdown initiated (signal={signal_received})...\033[0m")
    global DISABLED_DEVICES
    # Re-enable all disabled devices
    for device in DISABLED_DEVICES:
        try:
            mac = device['mac']
            network_controller.restore_device(mac)
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to re-enable device {mac}: {e}\033[0m")
    save_disabled_devices()
    shutdown_msgs.append("\033[92m[INFO] Disabled devices list saved on shutdown.\033[0m")
    DISABLED_DEVICES = []
    shutdown_msgs.append("\033[92m[INFO] All disabled devices have been re-enabled.\033[0m")
    shutdown_msgs.append("\033[92m[INFO] Server shutting down gracefully.\033[0m")
    print('\n'.join(shutdown_msgs))
    sys.exit(0)

signal.signal(signal.SIGINT, graceful_shutdown)
signal.signal(signal.SIGTERM, graceful_shutdown)

# Global dict to track active SSE connections by client ID
active_ping_connections = {}
active_ping_lock = threading.Lock()

@app.route('/api/ping/stream', methods=['GET'])
def stream_ping():
    ip = request.args.get('ip')
    client_id = request.args.get('client', str(uuid.uuid4()))
    
    if not ip:
        return jsonify({'error': 'No IP address provided'}), 400
    
    def event_stream():
        try:
            with active_ping_lock:
                active_ping_connections[client_id] = {'ip': ip, 'last_active': time.time()}
            
            yield 'data: {"connected": true, "ip": "' + ip + '"}\n\n'
            
            ping_interval = 0.5  
            while True:
                ping_data = ping_manager.get_ping_data(ip)
                
                if not ping_data:
                    ping_manager.request_ping(ip)

                    time.sleep(ping_interval)
                    continue  
                else:
                    yield 'data: ' + json.dumps(ping_data) + '\n\n'
                
                with active_ping_lock:
                    if client_id in active_ping_connections:
                        active_ping_connections[client_id]['last_active'] = time.time()
                    else:
                        break
                
                time.sleep(ping_interval)
        
        except GeneratorExit:
            pass
        finally:
            with active_ping_lock:
                if client_id in active_ping_connections:
                    del active_ping_connections[client_id]
    
    response = Response(stream_with_context(event_stream()), mimetype="text/event-stream")
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

@app.route('/api/ping/stop', methods=['POST'])
def stop_ping_stream():
    client_id = request.json.get('client')
    
    if not client_id:
        return jsonify({'error': 'No client ID provided'}), 400
    
    with active_ping_lock:
        if client_id in active_ping_connections:
            del active_ping_connections[client_id]
            return jsonify({'success': True, 'message': 'Ping stream stopped'})
        else:
            return jsonify({'success': False, 'message': 'Client not found'})

def cleanup_abandoned_ping_connections():
    with active_ping_lock:
        current_time = time.time()

        expired_clients = [
            client_id for client_id, data in active_ping_connections.items()
            if current_time - data['last_active'] > 30   # 30 seconds timeout
        ]
        
        for client_id in expired_clients:
            del active_ping_connections[client_id]

@app.route('/debug/diagnose', methods=['GET'])
def diagnose():
    result = {}
    
    # Check APPDATA location
    result["appdata_exists"] = os.path.exists(APPDATA_LOCATION)
    
    # Check history files
    result["scan_history_exists"] = os.path.exists(SCAN_HISTORY_FILE)
    result["bypass_history_exists"] = os.path.exists(BYPASS_HISTORY_FILE)
    
    # Try to read the files
    if result["scan_history_exists"]:
        try:
            with open(SCAN_HISTORY_FILE, 'r') as f:
                content = f.read()
                result["scan_file_size"] = len(content)
                result["scan_content_sample"] = content[:100] if content else "Empty file"
                try:
                    json.loads(content)
                    result["scan_json_valid"] = True
                except json.JSONDecodeError as e:
                    result["scan_json_valid"] = False
                    result["scan_json_error"] = str(e)
        except Exception as e:
            result["scan_file_readable"] = False
            result["scan_file_error"] = str(e)
    
    if result["bypass_history_exists"]:
        try:
            with open(BYPASS_HISTORY_FILE, 'r') as f:
                content = f.read()
                result["bypass_file_size"] = len(content)
                result["bypass_content_sample"] = content[:100] if content else "Empty file"
                try:
                    json.loads(content)
                    result["bypass_json_valid"] = True
                except json.JSONDecodeError as e:
                    result["bypass_json_valid"] = False
                    result["bypass_json_error"] = str(e)
        except Exception as e:
            result["bypass_file_readable"] = False
            result["bypass_file_error"] = str(e)
    
    # Network info

    try:
        result["local_ip"] = get_local_ip()
        result["subnet"] = get_subnet()
    except Exception as e:
        result["network_error"] = str(e)
    
    return jsonify(result)

@app.route('/debug/network-stats', methods=['GET'])
def get_network_stats():
    if not settings.get("network_debug_mode"):
        return jsonify({"error": "Network debug mode is not enabled."}), 403
    
    try:
        ping_cache_size = len(PING_CACHE)
        whois_cache_size = len(connection_monitor.whois_cache)
        active_sse_streams = len(active_ping_connections)

        return jsonify({
            "ping_cache_size": ping_cache_size,
            "whois_cache_size": whois_cache_size,
            "active_sse_streams": active_sse_streams
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def find_available_port(ports_to_try):
    for port in ports_to_try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                print(f"\033[93m[INFO] Port {port} is in use, trying next...\033[0m")
                continue
    return None

def auto_update_check(settings):
    if not settings.get("auto_update", True):
        return

    print("\033[94m[UPDATE] Checking for updates...\033[0m")
    import requests

    try:
        # Read current version from the dedicated version file (canonical source), prefix with 'v'
        file_ver = read_version_file()
        current_version = f"v{file_ver or APP_VERSION}"
        
        print(f"\033[94m[UPDATE] Current version: {current_version}\033[0m")

        api_url = "https://api.github.com/repos/countervolts/network-related-thing/releases/latest"
        response = requests.get(api_url, timeout=5)
        response.raise_for_status()
        release_data = response.json()
        latest_version = release_data.get("tag_name")

        if not latest_version:
            print("\033[91m[UPDATE] Could not determine latest version.\033[0m")
            return

        print(f"\033[94m[UPDATE] Latest version: {latest_version}\033[0m")

        latest_parts = list(map(int, latest_version.replace('v', '').split('.')))
        current_parts = list(map(int, current_version.replace('v', '').split('.')))
        
        is_newer = False
        for i in range(max(len(latest_parts), len(current_parts))):
            latest_part = latest_parts[i] if i < len(latest_parts) else 0
            current_part = current_parts[i] if i < len(current_parts) else 0
            if latest_part > current_part:
                is_newer = True
                break
            if latest_part < current_part:
                break
        
        if not is_newer:
            print("\033[92m[UPDATE] You are on the latest version.\033[0m")
            return

        print(f"\033[93m[UPDATE] New version available: {latest_version}. Downloading...\033[0m")

        server_exe_asset = next((asset for asset in release_data.get('assets', []) if asset['name'] == 'server.exe'), None)
        if not server_exe_asset:
            print("\033[91m[UPDATE] server.exe not found in the latest release.\033[0m")
            return
    
        download_url = server_exe_asset['browser_download_url']
        desktop_path = os.path.join(os.path.join(os.environ['USERPROFILE']), 'Desktop')
        new_exe_filename = f"server_{latest_version}.exe"
        new_exe_path = os.path.join(desktop_path, new_exe_filename)
    
        if os.path.exists(new_exe_path):
            print(f"\033[92m[UPDATE] Update file for version {latest_version} already exists on the Desktop. Skipping download.\033[0m")
            return
    
        download_response = requests.get(download_url, stream=True)
        download_response.raise_for_status()
        with open(new_exe_path, 'wb') as f:
            for chunk in download_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"\033[92m[UPDATE] Downloaded new version to {new_exe_path}\033[0m")

        # 5. Run the new exe and exit
        print("\033[93m[UPDATE] Restarting with the new version...\033[0m")
        ctypes.windll.shell32.ShellExecuteW(None, "runas", new_exe_path, None, None, 1)
        sys.exit(0)


    except requests.exceptions.RequestException as e:
        print(f"\033[91m[UPDATE] Failed to check for updates: {e}\033[0m")
    except Exception as e:
        print(f"\033[91m[UPDATE] An error occurred during the update process: {e}\033[0m")

def print_full_debug_startup_info():
    try:
        import psutil, urllib.request
        internal_ip = get_local_ip()
        external_ip = "Offline"
        isp = "Offline"
        try:
            external_ip_data = urllib.request.urlopen('https://api.ipify.org?format=json', timeout=2).read()
            external_ip = json.loads(external_ip_data)['ip']
            isp_data = urllib.request.urlopen(f'https://ipinfo.io/{external_ip}/json', timeout=2).read()
            isp_info = json.loads(isp_data)
            isp = isp_info.get('org', 'Offline')
        except Exception:
            pass

        wifi_if_keywords = ('wi-fi', 'wifi', 'wlan')
        eth_if_keywords = ('ethernet', 'eth', 'lan')
        net_stats = psutil.net_if_stats()
        wifi_active = any(stat.isup and any(k in name.lower() for k in wifi_if_keywords)
                          for name, stat in net_stats.items())
        ethernet_active = any(stat.isup and any(k in name.lower() for k in eth_if_keywords)
                              for name, stat in net_stats.items())

        cpu_info = platform.processor()
        cpu_threads = os.cpu_count() or 'N/A'
        try:
            reg_cpu_name = None
            wmic_name = None
            try:
                key_path = r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                    reg_cpu_name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                    reg_cpu_name = reg_cpu_name.strip()
            except Exception:
                pass
            try:
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                cpu_output = subprocess.check_output("wmic cpu get name", shell=True, startupinfo=startupinfo).decode('utf-8').strip()
                lines = [l.strip() for l in cpu_output.splitlines() if l.strip()]
                if len(lines) >= 2:
                    wmic_name = lines[1]
            except Exception:
                pass
            cpu_name = reg_cpu_name or wmic_name
            cpu_vendor = "Unknown"
            try:
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                vendor_output = subprocess.check_output("wmic cpu get Manufacturer", shell=True, startupinfo=startupinfo).decode('utf-8').strip()
                vlines = [l.strip() for l in vendor_output.splitlines() if l.strip()]
                if len(vlines) >= 2:
                    cpu_vendor = vlines[1]
            except Exception:
                pass
            if cpu_name:
                cpu_info = f"{cpu_name} ({cpu_vendor})"
            gpu_info = "Unknown"
            try:
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                gpu_output = subprocess.check_output("wmic path win32_VideoController get name", shell=True, startupinfo=startupinfo).decode('utf-8').strip()
                gpu_lines = [l.strip() for l in gpu_output.splitlines() if l.strip()]
                for line in gpu_lines[1:]:
                    if line and "Microsoft" not in line and not line.startswith("Standard"):
                        gpu_info = line
                        break
            except Exception:
                try:
                    import GPUtil
                    gpus = GPUtil.getGPUs()
                    if gpus:
                        gpu_info = gpus[0].name
                except Exception:
                    pass
        except Exception:
            gpu_info = "Unknown"

        memory_total_gb = round(psutil.virtual_memory().total / (1024**3), 2)

        storage_devices = []
        total_storage_bytes = 0
        for part in psutil.disk_partitions():
            try:
                if platform.system() == 'Windows' and ('cdrom' in part.opts or not os.path.exists(part.mountpoint)):
                    continue
                usage = psutil.disk_usage(part.mountpoint)
                total_storage_bytes += usage.total
                storage_devices.append({
                    "device": part.device,
                    "mount": part.mountpoint,
                    "total_gb": round(usage.total / (1024**3), 2)
                })
            except Exception:
                continue
        total_storage_gb = round(total_storage_bytes / (1024**3), 2)

        bypass_count = 0
        if os.path.exists(BYPASS_HISTORY_FILE):
            try:
                with open(BYPASS_HISTORY_FILE, 'r') as f:
                    bypass_count = len(json.load(f))
            except Exception:
                pass
        basic_scan_count = 0
        full_scan_count = 0
        if os.path.exists(SCAN_HISTORY_FILE):
            try:
                with open(SCAN_HISTORY_FILE, 'r') as f:
                    scan_history = json.load(f)
                    basic_scan_count = sum(1 for e in scan_history if e.get('type') == 'Basic')
                    full_scan_count = sum(1 for e in scan_history if e.get('type') == 'Full')
            except Exception:
                pass

        print("\n\033[95m[STARTUP][DEBUG] ====== FULL DEBUG SYSTEM SNAPSHOT ======\033[0m")
        print("\033[94m[DEBUG] Version: v%s\033[0m" % (read_version_file() or APP_VERSION))
        print("\033[94m[DEBUG] CPU: %s\033[0m" % cpu_info)
        print(f"\033[94m[DEBUG] CPU Threads: {cpu_threads}\033[0m")
        print("\033[94m[DEBUG] GPU: %s\033[0m" % gpu_info)
        print("\033[94m[DEBUG] Memory: %.2f GB\033[0m" % memory_total_gb)
        print("\033[94m[DEBUG] Storage Devices:\033[0m")
        if storage_devices:
            for dev in storage_devices:
                print(f"  \033[94m[DEBUG] {dev['device']} ({dev['mount']}): {dev['total_gb']} GB\033[0m")
        else:
            print("  \033[94m[DEBUG] (No storage devices enumerated)\033[0m")
        print(f"\033[94m[DEBUG] Total Storage: {total_storage_gb} GB\033[0m")

        print("\033[94m[DEBUG] Internal IP: %s\033[0m" % internal_ip)
        print("\033[94m[DEBUG] External IP: %s\033[0m" % external_ip)
        print("\033[94m[DEBUG] ISP: %s\033[0m" % isp)
        print(f"\033[94m[DEBUG] wifi - {str(wifi_active).lower()}\033[0m")
        print(f"\033[94m[DEBUG] ethernet - {str(ethernet_active).lower()}\033[0m")

        print("\033[94m[DEBUG] Activity: bypasses=%d basic_scans=%d full_scans=%d\033[0m" %
              (bypass_count, basic_scan_count, full_scan_count))
        print("\033[95m[STARTUP][DEBUG] ===========================================\033[0m\n")
    except Exception as e:
        print(f"\033[93m[WARN] Failed to produce full debug snapshot: {e}\033[0m")

if __name__ == '__main__':
    os.system('cls')
    update_logging_level(settings.get("debug_mode", "off"))
    for noisy in ('waitress.queue', 'waitress', 'hypercorn.error', 'hypercorn.access'):
        lg = logging.getLogger(noisy)
        lg.setLevel(logging.ERROR)
        lg.propagate = False
        for h in lg.handlers:
            h.setLevel(logging.ERROR)
        if not lg.handlers:
            lg.addHandler(logging.NullHandler())
    if not os.path.exists(APPDATA_LOCATION):
        os.makedirs(APPDATA_LOCATION, exist_ok=True)

    file_version = read_version_file()
    try:
        if file_version != APP_VERSION:
            write_version_file(APP_VERSION)
            if file_version:
                print(f"\033[94m[INFO] Updated VERSION_FILE from {file_version} -> {APP_VERSION}\033[0m")
            else:
                print(f"\033[94m[INFO] Wrote initial VERSION_FILE -> {APP_VERSION}\033[0m")
        else:
            print(f"\033[94m[INFO] Loaded version from VERSION_FILE -> {file_version}\033[0m")
    except Exception as e:
        print(f"\033[93m[WARN] Failed to ensure VERSION_FILE: {e}\033[0m")

    if settings.get("debug_mode", "off") == "full":
        print_full_debug_startup_info()

    auto_update_check(settings)

    if settings.get("run_as_admin") and not is_admin():
        print("\033[93m[INFO] Setting requires admin privileges. Restarting...\033[0m")
        permission_giver()
    
    if settings.get("debug_mode", "off") == "basic":
        logging.getLogger('werkzeug').setLevel(logging.INFO)  
    elif settings.get("debug_mode", "off") == "full":
        logging.getLogger('werkzeug').setLevel(logging.DEBUG) 
    else:
        logging.getLogger('werkzeug').setLevel(logging.ERROR) 

    if settings.get("debug_mode", "off") in ["basic", "off"]:
        cli = sys.modules['flask.cli']
        cli.show_server_banner = lambda *_: None

    # List of ports to try in order
    PORTS_TO_TRY = [8080, 8090, 5000, 5001, 8001]
    PORT = find_available_port(PORTS_TO_TRY)

    if PORT is None:
        print("\033[91m[ERROR] All preferred ports are in use. Please free up a port and restart.\033[0m")
        sys.exit(1)

    print(f"\033[92m[INFO] Server running at http://{get_local_ip()}:{PORT}\033[0m")

    if settings_changed:
        for key in DEFAULT_SETTINGS:
            if key not in settings:
                print(f"\033[93m[INFO] New setting detected: '{key}' (added to settings dir)\033[0m")

    if settings["auto_open_page"] and not is_running_in_electron():
        def open_browser():
            time.sleep(0.2)
            try:
                subprocess.Popen(['start', f'http://localhost:{PORT}'], shell=True)
            except Exception as e:
                print(f"\033[91m[ERROR] Failed to open browser: {e}\033[0m")
        threading.Thread(target=open_browser, daemon=True).start()

    try:
        backend = settings.get("server_backend", "waitress")
        
        if backend == "hypercorn":
            print(f"\033[93m[INFO] Starting with Hypercorn server on localhost:{PORT}...\033[0m")
            config = Config()
            config.bind = [f"127.0.0.1:{PORT}"]
            asyncio.run(hypercorn_serve(app, config))
        elif backend == "none":
            print(f"\033[93m[INFO] Starting with Flask's default development server on localhost:{PORT}...\033[0m")
            app.run(host='127.0.0.1', port=PORT)
        else: 
            print(f"\033[93m[INFO] Starting with Waitress server on localhost:{PORT}...\033[0m")
            serve(app, host='127.0.0.1', port=PORT)

    except Exception as e:
        print(f"\033[91m[ERROR] Failed to start server: {e}\033[0m")
        print(f"\033[93m[INFO] Try running as administrator or check if port {PORT} is already in use.\033[0m")
