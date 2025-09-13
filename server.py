import time
START_TIME = time.time()
_CLIENT_LOADED = False

from src.bypass import transport_names, neftcfg_search, init_bypass, IGNORE_LIST, restart_all_adapters, get_adapter_name, rand0m_hex
from flask import Flask, jsonify, send_from_directory, request, Response, stream_with_context
from hypercorn.asyncio import serve as hypercorn_serve
from src.ping import get_default_gateway, scan_network
from src.netman import ping_manager
from src.monitor import connection_monitor
from werkzeug.exceptions import NotFound 
from hypercorn.config import Config
from functools import lru_cache
from flask_cors import CORS
from threading import Lock
from waitress import serve
import subprocess
import threading
import platform
import logging
import asyncio
import random
import socket
import signal
import json
import time
import uuid
import sys
import re
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- Platform adjustments: macOS defaults ---
STATIC_ROOT = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, 'frozen', False):
    STATIC_ROOT = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable)) or STATIC_ROOT

# Use macOS-appropriate paths
APP_SUPPORT_DIR = os.path.expanduser('~/Library/Application Support/macosbypass')
SETTINGS_FILE = os.path.join(APP_SUPPORT_DIR, "settings.json")
HISTORY_FOLDER = os.path.join(APP_SUPPORT_DIR, "historystorage")
if not os.path.exists(HISTORY_FOLDER):
    os.makedirs(HISTORY_FOLDER, exist_ok=True)

SCAN_HISTORY_FILE = os.path.join(APP_SUPPORT_DIR, "scans.json")
BYPASS_HISTORY_FILE = os.path.join(APP_SUPPORT_DIR, "bypasses.json")
APPDATA_LOCATION = APP_SUPPORT_DIR # For compatibility with existing code
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

DEFAULT_SETTINGS = {
    "hide_website": True,
    "auto_open_page": True,
    "debug_mode": "off",
    "server_backend": "waitress",
    "scanning_method": "divide_and_conquer",
    "parallel_scans": True,
    "override_multiplier": 4,
    "auto_update": True,
    "ui_debug_mode": False,
    "network_debug_mode": False
}

def exit_app():
    graceful_shutdown(signal.SIGTERM, None)

network_controller = None

PING_CACHE = {}
PING_CACHE_TIMEOUT = 2
ping_lock = Lock()

def is_admin():
    try:
        return os.geteuid() == 0
    except AttributeError: # os.geteuid() is not available on all platforms (like non-unix Windows)
        return False

# Enforce running as root for network/Scapy operations.
# This will stop the server early with a clear message if not run with admin privileges.
if not is_admin():
    print("\033[91m[ERROR] This application requires administrative privileges (run with sudo/root).\033[0m")
    sys.exit(1)
 
# Instantiate network controller after admin check to avoid Scapy permission errors
from src.netman import GarpSpoofer as _GarpSpooferClass
network_controller = _GarpSpooferClass()

def run_launchctl(args):
    try:
        if not args:
            return "", "Invalid arguments"

        cmd = args[0].lower()
        # find label after '/tn' if present
        label = None
        if '/tn' in args:
            try:
                label = args[args.index('/tn') + 1]
            except Exception:
                label = None

        # Query
        if cmd == '/query' and label:
            proc = subprocess.run(['launchctl', 'list', label], capture_output=True, text=True)
            if proc.returncode != 0:
                return "", "Task not found"
            return proc.stdout, proc.stderr or ""

        # Create (best-effort): write a LaunchAgent plist and load it
        if cmd == '/create' and label:
            # extract executable path after '/tr'
            exec_path = ""
            if '/tr' in args:
                try:
                    exec_index = args.index('/tr') + 1
                    exec_path = args[exec_index].strip('"')
                except Exception:
                    exec_path = ""
            plist_dir = os.path.expanduser('~/Library/LaunchAgents')
            os.makedirs(plist_dir, exist_ok=True)
            plist_path = os.path.join(plist_dir, f"{label}.plist")
            plist = {
                'Label': label,
                'ProgramArguments': [exec_path] if exec_path else [],
                'RunAtLoad': True,
                'KeepAlive': False
            }
            try:
                import plistlib
                with open(plist_path, 'wb') as pf:
                    plistlib.dump(plist, pf)
                # attempt to load
                proc = subprocess.run(['launchctl', 'load', plist_path], capture_output=True, text=True)
                return proc.stdout or "Created", proc.stderr or ""
            except Exception as e:
                return "", str(e)

        # Change: map enable/disable to load/unload for the plist
        if cmd == '/change' and label:
            if '/disable' in args:
                plist_path = os.path.expanduser(f'~/Library/LaunchAgents/{label}.plist')
                if os.path.exists(plist_path):
                    proc = subprocess.run(['launchctl', 'unload', plist_path], capture_output=True, text=True)
                    return proc.stdout, proc.stderr
                return "", "Task not found"
            elif '/enable' in args:
                plist_path = os.path.expanduser(f'~/Library/LaunchAgents/{label}.plist')
                if os.path.exists(plist_path):
                    proc = subprocess.run(['launchctl', 'load', plist_path], capture_output=True, text=True)
                    return proc.stdout, proc.stderr
                return "", "Task not found"

        return "", "Unsupported operation"
    except Exception as e:
        return "", str(e)

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
    try:
        # Use the 'randomized' mode from bypass.py which creates a valid Unicast LAA MAC
        new_mac, instruction = rand0m_hex()
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

@app.route('/clear-console', methods=['POST'])
def clear_console():
    try:
        os.system('clear' if platform.system() != 'Windows' else 'cls')
        return jsonify({"message": "Console cleared successfully."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/misc/open-history-folder', methods=['POST'])
def open_history_folder():
    try:
        if platform.system() == "Windows":
            os.startfile(APPDATA_LOCATION)
        elif platform.system() == "Darwin": # macOS
            subprocess.Popen(["open", APPDATA_LOCATION])
        else: # Linux and other UNIX
            subprocess.Popen(["xdg-open", APPDATA_LOCATION])
        return jsonify({"message": f"Opened folder: {APPDATA_LOCATION}"})
    except Exception as e:
        return jsonify({"error": f"Failed to open folder: {str(e)}"}), 500

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

@app.before_request
def on_startup():
    pass

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
        print(f"\033[94m[DEBUG] Performing soft restart for adapter: {adapter_name} (macOS)\033[0m")
        # Bring interface down
        down = subprocess.run(["ifconfig", adapter_name, "down"], capture_output=True, text=True)
        if down.returncode != 0:
            print(f"\033[91m[ERROR] ifconfig down failed: {down.stderr}\033[0m")
            # Continue to try to bring up anyway
        time.sleep(0.2)
        up = subprocess.run(["ifconfig", adapter_name, "up"], capture_output=True, text=True)
        if up.returncode != 0:
            print(f"\033[91m[ERROR] ifconfig up failed: {up.stderr}\033[0m")
            return False
        time.sleep(0.2)
        print(f"\033[92m[INFO] Successfully restarted adapter: {adapter_name}\033[0m")
        return True
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to restart adapter {adapter_name}: {e}\033[0m")
        return False

@app.route('/bypass/revert-mac', methods=['POST'])
def revert_mac():
    try:
        data = request.json
        transport_name = data['transport']
        old_mac = data['mac']

        print(f"\033[94m[DEBUG] Starting MAC revert process for transport: {transport_name}\033[0m")
        print(f"\033[94m[DEBUG] Reverting to MAC: {old_mac}\033[0m")

        instances = neftcfg_search(transport_name)
        if not instances:
            return jsonify({"error": "No network configurations found for the specified transport"}), 404

        instance = instances[0]
        # On macOS treat the returned identifier as the interface name (e.g., 'en0')
        _, interface_name = instance

        # Get current MAC via ifconfig
        original_mac = None
        try:
            proc = subprocess.run(['ifconfig', interface_name], capture_output=True, text=True, timeout=5)
            for line in proc.stdout.splitlines():
                line = line.strip()
                if line.startswith('ether '):
                    original_mac = line.split()[1].strip()
                    print(f"\033[94m[DEBUG] Current MAC from ifconfig: {original_mac}\033[0m")
                    break
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to read current MAC via ifconfig: {e}\033[0m")

        # Normalize provided mac
        formatted_mac = old_mac.replace(":", "").lower()
        if formatted_mac in ("hardware", "default"):
            # Attempt to revert by flushing any manual spoof (best-effort)
            # Many macOS systems return hardware MAC on reboot; advise user otherwise.
            try:
                # If original_mac available try to set that, else instruct user
                if original_mac:
                    subprocess.run(['ifconfig', interface_name, 'ether', original_mac], check=False)
                    print(f"\033[94m[DEBUG] Attempted to restore hardware MAC: {original_mac}\033[0m")
                    return jsonify({"message": "Attempted to revert to hardware MAC. A reboot may be required."})
                else:
                    return jsonify({"message": "Revert requested. Please reboot the system to clear MAC spoofing."})
            except Exception as e:
                return jsonify({"error": f"Failed to revert MAC: {e}"}), 500
        else:
            # Format into colon-separated MAC for ifconfig
            mac_clean = re.sub(r'[^0-9a-fA-F]', '', old_mac).lower()
            if len(mac_clean) != 12:
                return jsonify({"error": "Invalid MAC format"}), 400
            pretty_mac = ':'.join(mac_clean[i:i+2] for i in range(0, 12, 2))
            try:
                # Use ifconfig to set MAC
                subprocess.run(['ifconfig', interface_name, 'ether', pretty_mac], check=True, capture_output=True)
                # Optionally restart interface to apply
                if settings.get("accelerated_bypassing", True):
                    if restart_specific_adapter(interface_name):
                        return jsonify({"message": "MAC change requested successfully."})
                    else:
                        return jsonify({"error": "Failed to restart network adapter after MAC change."}), 500
                else:
                    return jsonify({"message": "MAC change requested. Please restart interface or reboot to apply."})
            except PermissionError:
                return jsonify({"error": "Permission denied. Please run the application as root (sudo)."}), 403
            except subprocess.CalledProcessError as e:
                return jsonify({"error": f"Failed to set MAC via ifconfig: {e.stderr.strip()}"}), 500
            except Exception as e:
                return jsonify({"error": f"Failed to revert MAC address: {str(e)}"}), 500

    except PermissionError:
        return jsonify({"error": "Permission denied. Please run the application as root (sudo)."}), 403
    except Exception as e:
        return jsonify({"error": f"Failed to revert MAC address: {str(e)}"}), 500

@app.route('/scan/basic', methods=['GET'])
def basic_scan():
    try:
        subnet = get_subnet()
        start_time = time.time()
        results = scan_network(
            subnet, 
            scan_hostname=True, 
            scan_vendor=False,
            scanning_method=settings.get("scanning_method", "divide_and_conquer"),
            parallel_scans=settings.get("parallel_scans", True),
            parallel_multiplier=settings.get("override_multiplier", 4)
        )
        duration = time.time() - start_time
        log_scan_history("Basic", len(results), results, settings.get("scanning_method"), duration)
        return jsonify(results)
    except Exception as e:
        app.logger.error(f"Basic scan failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/scan/full', methods=['GET'])
def full_scan():
    try:
        if not os.path.exists(OUI_FILE):
            return jsonify({
                "results": [],
                "warning": "OUI file not found. Vendor information will be missing. Please download it from Settings."
            })
        
        _load_vendor_cache()
        
        subnet = get_subnet()
        start_time = time.time()
        results = scan_network(
            subnet, 
            scan_hostname=True, 
            scan_vendor=True,
            scanning_method=settings.get("scanning_method", "divide_and_conquer"),
            parallel_scans=settings.get("parallel_scans", True),
            parallel_multiplier=settings.get("override_multiplier", 4)
        )
        duration = time.time() - start_time
        log_scan_history("Full", len(results), results, settings.get("scanning_method"), duration)
        return jsonify(results)
    except Exception as e:
        app.logger.error(f"Full scan failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/system/info', methods=['GET'])
def get_system_info():
    import platform
    import psutil
    
    try:
        result = {}
        
        # Network info
        result["internal_ip"] = get_local_ip()
        
        # Try to get external IP (with fallback if offline)
        try:
            import urllib.request
            external_ip = urllib.request.urlopen('https://api.ipify.org').read().decode('utf8')
            result["external_ip"] = external_ip
            
            # Get ISP info if possible
            try:
                isp_data = urllib.request.urlopen(f'https://ipinfo.io/{external_ip}/json', timeout=2).read()
                import json
                isp_info = json.loads(isp_data)
                result["isp"] = isp_info.get('org', 'Unknown ISP')
            except:
                result["isp"] = "Unknown ISP"
        except:
            result["external_ip"] = "Offline"
            result["isp"] = "Offline"
        
        # Get MAC address of the primary adapter
        adapters = transport_names()
        if adapters and adapters[0]:
            try:
                transport_list, descriptions, _ = adapters  # Fixed: Use _ instead of mp_transport
                if transport_list:
                    _, interface = neftcfg_search(transport_list[0])[0]
                    import subprocess
                    proc = subprocess.run(['ifconfig', interface], capture_output=True, text=True)
                    for line in proc.stdout.splitlines():
                        if 'ether ' in line:
                            result["mac_address"] = line.split('ether ')[1].strip().split()[0]
                            break
            except:
                result["mac_address"] = "Unknown"
        
        # Hardware info
        try:
            result["cpu"] = subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string']).decode().strip()
        except:
            result["cpu"] = platform.processor() or "Unknown"
        
        try:
            memory = psutil.virtual_memory()
            result["memory"] = f"{round(memory.total / (1024**3), 1)} GB"
        except:
            result["memory"] = "Unknown"
        
        # Storage info
        try:
            total_storage = 0
            for part in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    total_storage += usage.total
                except:
                    pass
            result["storage"] = f"{round(total_storage / (1024**3), 1)} GB"
        except:
            result["storage"] = "Unknown"
        
        # GPU info
        try:
            profiler_output = subprocess.check_output(['system_profiler', 'SPDisplaysDataType']).decode()
            for line in profiler_output.splitlines():
                if "Chipset Model:" in line:
                    result["gpu"] = line.split(":", 1)[1].strip()
                    break
        except:
            result["gpu"] = "Unknown"
        
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error getting system info: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/scan/ports', methods=['GET'])
def scan_ports():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({"error": "IP address is required"}), 400
    
    try:
        # Use the existing connection monitor to scan for common ports
        open_ports = connection_monitor._scan_common_ports(ip)
        return jsonify({"ip": ip, "ports": open_ports})
    except Exception as e:
        app.logger.error(f"Port scan for {ip} failed: {e}")
        return jsonify({"error": f"Failed to scan ports for {ip}"}), 500

@app.route('/statistics', methods=['GET'])
def get_statistics():
    try:
        result = {
            "bypass_count": 0,
            "basic_scan_count": 0,
            "full_scan_count": 0
        }
        
        # Count bypasses
        if os.path.exists(BYPASS_HISTORY_FILE):
            try:
                with open(BYPASS_HISTORY_FILE, 'r') as f:
                    bypass_history = json.load(f)
                    result["bypass_count"] = len(bypass_history)
            except:
                pass
        
        # Count scans
        if os.path.exists(SCAN_HISTORY_FILE):
            try:
                with open(SCAN_HISTORY_FILE, 'r') as f:
                    scan_history = json.load(f)
                    result["basic_scan_count"] = sum(1 for item in scan_history if item.get('type') == 'Basic')
                    result["full_scan_count"] = sum(1 for item in scan_history if item.get('type') == 'Full')
            except:
                pass
        
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error getting statistics: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/history/scans', methods=['GET'])
def get_scan_history():
    try:
        if os.path.exists(SCAN_HISTORY_FILE):
            with open(SCAN_HISTORY_FILE, 'r') as f:
                history = json.load(f)
                return jsonify(history)
        return jsonify([])
    except Exception as e:
        app.logger.error(f"Error loading scan history: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/history/bypasses', methods=['GET'])
def get_bypass_history():
    try:
        if os.path.exists(BYPASS_HISTORY_FILE):
            with open(BYPASS_HISTORY_FILE, 'r') as f:
                history = json.load(f)
                return jsonify(history)
        return jsonify([])
    except Exception as e:
        app.logger.error(f"Error loading bypass history: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bypass/change-mac', methods=['POST'])
def bypass_change_mac():
    data = request.json
    transport = data.get('transport')

    if not transport:
        return jsonify({"error": "Transport name is required"}), 400

    instances = neftcfg_search(transport)
    if not instances:
        return jsonify({"error": "No network adapter found with this transport name"}), 404

    # Treat the sub_name as interface name on macOS
    _, interface_name = instances[0]

    # Get current MAC via ifconfig
    current_mac = None
    try:
        proc = subprocess.run(['ifconfig', interface_name], capture_output=True, text=True, timeout=5)
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith('ether '):
                current_mac = line.split()[1].strip()
                break
    except Exception:
        current_mac = None

    # Delegate MAC generation/setting to init_bypass implementation (must be macOS-aware)
    # Pass the interface name as the sub_name argument
    new_mac = init_bypass(interface_name, restart_adapters=True)
    if new_mac:
        note = "MAC address changed successfully"
        log_bypass_history(
            normalize_mac_address(current_mac or "Unknown"),
            normalize_mac_address(new_mac),
            "ifconfig",
            transport,
            mac_mode="randomized"
        )
        return jsonify({
            "success": True,
            "message": "MAC Address Changed",
            "adapter": interface_name,
            "previous_mac": normalize_mac_address(current_mac or "Unknown"),
            "new_mac": normalize_mac_address(new_mac),
            "note": note
        })
    else:
        return jsonify({"error": "Failed to change MAC address"}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    print(f"\033[91m[ERROR] Unhandled exception in {request.path}: {str(e)}\033[0m")
    import traceback
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500

@app.route('/settings')
def settings_route():
    settings_data = settings.copy()
    settings_data['cpu_thread_count'] = os.cpu_count()
    return jsonify(settings_data)

def update_logging_level(debug_mode):
    try:
        dm = (debug_mode or "off")
        if isinstance(dm, bool):
            dm = "full" if dm else "off"
        dm = str(dm).lower()
        if dm == "full":
            level = logging.DEBUG
        elif dm == "basic":
            level = logging.INFO
        else:
            level = logging.ERROR

        try:
            logging.getLogger().setLevel(level)
        except Exception:
            pass
        try:
            logging.getLogger('werkzeug').setLevel(level)
        except Exception:
            pass
        try:
            app.logger.setLevel(level)
        except Exception:
            pass

    except Exception as e:
        print(f"\033[93m[WARN] update_logging_level failed: {e}\033[0m")

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
        return os.geteuid() == 0
    except AttributeError:
        return False

def permission_giver():
    # permission_giver removed — admin is enforced at startup.
    raise RuntimeError("permission_giver should not be called; admin enforced at startup")

@app.route('/server/start', methods=['GET'])
def server_start():
    print("\033[92m[INFO] Server has started.\033[0m")
    return jsonify({"message": "Server started."})

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

@app.route('/bypass/adapters', methods=['GET'])
def list_bypass_adapters():
    try:
        show_ignored = request.args.get('show_ignored', 'false').lower() == 'true'

        transport_list, descriptions, mp_transport = transport_names()
        adapters = []
        for idx, transport in enumerate(transport_list):
            desc = descriptions[idx] if idx < len(descriptions) else get_adapter_name(transport, transport)
            ignored = any(ign.lower() in (desc or '').lower() for ign in IGNORE_LIST)
            if not show_ignored and ignored:
                continue
            adapters.append({
                "transport": transport,
                "description": desc or transport,
                "active": (transport == mp_transport), 
                "ignored": ignored
            })

        return jsonify(adapters)
    except Exception as e:
        app.logger.error(f"Failed to list bypass adapters: {e}")
        # Always return an array (so adapters.map won't throw)
        return jsonify([]), 500

def graceful_shutdown(signal_received, *_) :
    shutdown_msgs = []
    shutdown_msgs.append(f"\033[93m[INFO] Graceful shutdown initiated (signal={signal_received})...\033[0m")
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

        wifi_if_keywords = ('wi-fi', 'wifi', 'wlan', 'en0', 'en1')
        eth_if_keywords = ('ethernet', 'eth', 'lan', 'enp')
        net_stats = psutil.net_if_stats()
        wifi_active = any(stat.isup and any(k in name.lower() for k in wifi_if_keywords)
                          for name, stat in net_stats.items())
        ethernet_active = any(stat.isup and any(k in name.lower() for k in eth_if_keywords)
                              for name, stat in net_stats.items())

        cpu_info = "Unknown"
        try:
            cpu_info = subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string']).decode().strip()
        except Exception:
            cpu_info = platform.processor()
        
        cpu_threads = os.cpu_count() or 'N/A'
        
        gpu_info = "Unknown"
        try:
            profiler_output = subprocess.check_output(['system_profiler', 'SPDisplaysDataType']).decode()
            for line in profiler_output.splitlines():
                if "Chipset Model:" in line:
                    gpu_info = line.split(":", 1)[1].strip()
                    break
        except Exception:
            pass

        memory_total_gb = round(psutil.virtual_memory().total / (1024**3), 2)

        storage_devices = []
        total_storage_bytes = 0
        for part in psutil.disk_partitions():
            try:
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
    os.system('clear')  # macOS terminal clear
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

    # Auto-open browser using macOS open command
    if settings.get("auto_open_page"):
        def open_browser():
            time.sleep(0.2)
            try:
                subprocess.Popen(['open', f'http://localhost:{PORT}'])
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
        print(f"\033[93m[INFO] Check permissions or if port {PORT} is already in use.\033[0m")
