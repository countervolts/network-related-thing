from src.bypass.bypass import transport_names, neftcfg_search, init_bypass, IGNORE_LIST, restart_all_adapters
from flask import Flask, jsonify, send_from_directory, redirect, request, render_template
from src.ping import scan_network, get_default_gateway
from src.netman import GarpSpoofer
from getmac import get_mac_address
from flask_cors import CORS
import webbrowser
import subprocess
import requests
import logging
import socket
import ctypes
import winreg
import json
import time
import uuid
import sys
import re
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

SETTINGS_FILE = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "settings.json")
HISTORY_FOLDER = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "historystorage")
if not os.path.exists(HISTORY_FOLDER):
    os.makedirs(HISTORY_FOLDER)
    
SCAN_HISTORY_FILE = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "scans.json")
BYPASS_HISTORY_FILE = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "bypasses.json")
APPDATA_LOCATION = os.path.join(os.getenv('APPDATA'), "ayosbypasser")
OUI_URL = "https://standards-oui.ieee.org/"


DEFAULT_SETTINGS = {
    "hide_website": True,
    "auto_open_page": True,
    "debug_mode": "basic",
    "bypass_mode": "registry",
    "run_as_admin": False
}

network_controller = GarpSpoofer()
    
@app.route('/misc/download-oui', methods=['GET'])
def download_oui():
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(OUI_URL, headers=headers, timeout=10)
        response.raise_for_status()
        oui_file_path = os.path.join(APPDATA_LOCATION, "oui.txt")
        with open(oui_file_path, "w", encoding="utf-8") as f:
            f.write(response.text)
        
        return jsonify({"message": f"OUI file downloaded successfully to {oui_file_path}."})
    except Exception as e:
        return jsonify({"error": f"Failed to download OUI file: {str(e)}"}), 500

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

        network_controller.block_device(ip, mac)
        return jsonify({"message": f"Device {mac} ({ip}) disabled successfully."})
    except Exception as e:
        return jsonify({"error": f"Failed to disable device: {str(e)}"}), 500

@app.route('/network/enable', methods=['POST'])
def enable_device():
    try:
        data = request.json
        mac = data['mac']  # Use MAC address instead of IP
        network_controller.restore_device(mac)
        return jsonify({"message": f"Device with MAC {mac} re-enabled successfully."})
    except Exception as e:
        return jsonify({"error": f"Failed to enable device: {str(e)}"}), 500

def get_subnet():
    default_gateway = get_default_gateway()
    if default_gateway:
        subnet = '.'.join(default_gateway.split('.')[:3])
        return f"{subnet}.0/24"
    else:
        raise ValueError("Unable to determine default gateway")
    
def load_settings():
    if not os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "w") as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        return DEFAULT_SETTINGS
    with open(SETTINGS_FILE, "r") as f:
        return json.load(f)

settings = load_settings()

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
    finally:
        s.close()
    return local_ip

CREATOR_IP = get_local_ip()

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

def load_history(file_path):
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            return json.load(f)
    return []

def save_history(file_path, data):
    with open(file_path, "w") as f:
        json.dump(data, f, indent=4)

def log_scan_history(scan_type, device_count, results):
    history = load_history(SCAN_HISTORY_FILE)
    scan_id = str(uuid.uuid4())
    raw_json_path = os.path.join(HISTORY_FOLDER, f"{scan_id}.json")
    with open(raw_json_path, "w") as f:
        json.dump(results, f, indent=4)
    history.append({
        "id": scan_id,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "type": scan_type,
        "deviceCount": device_count,
        "rawJsonUrl": f"/{raw_json_path.replace(os.sep, '/')}"
    })
    save_history(SCAN_HISTORY_FILE, history)

def log_bypass_history(previous_mac, new_mac, method, transport):
    history = load_history(BYPASS_HISTORY_FILE)
    history.append({
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "previousMac": previous_mac,
        "newMac": new_mac,
        "method": method,
        "transport": transport
    })
    save_history(BYPASS_HISTORY_FILE, history)

@app.route('/bypass/revert-mac', methods=['POST'])
def revert_mac():
    try:
        data = request.json
        transport_name = data['transport']
        old_mac = data['mac']

        # Update the registry with the old MAC address
        instances = neftcfg_search(transport_name)
        if not instances:
            return jsonify({"error": "No network configurations found for the specified transport"}), 404

        instance = instances[0]
        key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{instance[1]}"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_ALL_ACCESS) as key:
            winreg.SetValueEx(key, 'NetworkAddress', 0, winreg.REG_SZ, old_mac)

        # Restart the network adapters
        if restart_all_adapters():
            return jsonify({"message": f"MAC address reverted to {old_mac} and adapters restarted successfully."})
        else:
            return jsonify({"error": "Failed to restart network adapters"}), 500
    except PermissionError:
        return jsonify({"error": "Permission denied. Please run the application as an administrator."}), 403
    except Exception as e:
        return jsonify({"error": f"Failed to revert MAC address: {str(e)}"}), 500

@app.route('/bypass/adapters')
def get_adapters():
    try:
        transport_names_list, driver_desc_list, mp_transport = transport_names()
        adapters = [
            {
                "transport": name,
                "description": driver_desc_list[idx],
                "default": name == mp_transport
            }
            for idx, name in enumerate(transport_names_list[:5])
            if driver_desc_list[idx] not in IGNORE_LIST
        ]
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
def change_mac():
    try:
        data = request.json
        transport_name = data['transport']
        bypass_mode = settings.get("bypass_mode", "registry")
        previous_mac = get_mac_address()

        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] Received request to change MAC address.\033[0m")
            print(f"\033[94m[DEBUG] Transport Name: {transport_name}\033[0m")
            print(f"\033[94m[DEBUG] Bypass Mode: {bypass_mode}\033[0m")
            print(f"\033[94m[DEBUG] Previous MAC Address: {previous_mac}\033[0m")

        if bypass_mode == "cmd":
            import random
            new_mac = "DE{:02X}{:02X}{:02X}{:02X}{:02X}".format(
                random.randint(0, 255),
                random.randint(0, 255),
                random.randint(0, 255),
                random.randint(0, 255),
                random.randint(0, 255)
            )
            command = f'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{transport_name}" /v NetworkAddress /d {new_mac} /f'
            if settings.get("debug_mode", "off") == "full":
                print(f"\033[94m[DEBUG] Generated new MAC address: {new_mac}\033[0m")
                print(f"\033[94m[DEBUG] Executing command: {command}\033[0m")
            os.system(command)

            log_bypass_history(previous_mac, new_mac, "CMD", transport_name)
            if settings.get("debug_mode", "off") == "full":
                print(f"\033[94m[DEBUG] Logged bypass history for CMD method.\033[0m")
            return jsonify({
                "message": "MAC address changed successfully using CMD",
                "new_mac": new_mac,
                "note": "System restart may be required"
            })

        elif bypass_mode == "registry":
            if not ctypes.windll.shell32.IsUserAnAdmin():
                return jsonify({"error": "This operation requires administrative privileges. Please run the application as an administrator."}), 403

            if settings.get("debug_mode", "off") == "full":
                print(f"\033[94m[DEBUG] Searching for network configurations in the registry.\033[0m")

            instances = neftcfg_search(transport_name)
            if not instances:
                if settings.get("debug_mode", "off") == "full":
                    print(f"\033[94m[DEBUG] No network configurations found for transport: {transport_name}\033[0m")
                return jsonify({"error": "No network configurations found"}), 404

            instance = instances[0]
            if settings.get("debug_mode", "off") == "full":
                print(f"\033[94m[DEBUG] Found network configuration: {instance}\033[0m")

            new_mac = init_bypass(instance[1])
            if new_mac:
                log_bypass_history(previous_mac, new_mac, "Registry", transport_name)
                if settings.get("debug_mode", "off") == "full":
                    print(f"\033[94m[DEBUG] Logged bypass history for Registry method.\033[0m")
                return jsonify({
                    "message": "MAC address changed successfully using Registry",
                    "new_mac": new_mac,
                    "note": "No restart required"
                })

            if settings.get("debug_mode", "off") == "full":
                print(f"\033[94m[DEBUG] Failed to change MAC address using Registry method.\033[0m")
            return jsonify({"error": "Failed to change MAC address"}), 500

        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] Invalid bypass mode: {bypass_mode}\033[0m")
        return jsonify({"error": "Invalid bypass mode"}), 400
    except Exception as e:
        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] Exception occurred: {e}\033[0m")
        return jsonify({"error": str(e)}), 500

@app.before_request
def restrict_access():
    if settings.get("hide_website", True):  
        client_ip = request.remote_addr
        if client_ip not in [CREATOR_IP, "127.0.0.1"]:
            return redirect("https://www.google.com")

@app.route('/history/scans', methods=['GET'])
def get_scan_history():
    return jsonify(load_history(SCAN_HISTORY_FILE))

@app.route('/history/scans/<scan_id>', methods=['DELETE'])
def delete_scan_history(scan_id):
    history = load_history(SCAN_HISTORY_FILE)
    updated_history = [item for item in history if item["id"] != scan_id]
    save_history(SCAN_HISTORY_FILE, updated_history)
    return jsonify({"message": "Scan history deleted successfully."})

@app.route('/history/bypasses', methods=['GET'])
def get_bypass_history():
    return jsonify(load_history(BYPASS_HISTORY_FILE))

@app.route('/scan/basic')
def basic_scan():
    try:
        subnet = get_subnet()
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[94m[DEBUG] Performing basic scan on subnet: {subnet}\033[0m")
        
        results = scan_network(subnet=subnet, scan_hostname=False, scan_vendor=False) or []

        if settings.get("debug_mode") == "full":
            print("\033[94m-[DEBUG] Start of request headers-\033[0m")
            for header, value in request.headers.items():
                print(f"  {header}: {value}")
            print("\033[94m-[DEBUG] End of request headers-\033[0m")
        
        for result in results:
            result["hostname"] = "Skipped"
            result["vendor"] = "Skipped"

        log_scan_history("Basic", len(results), results)
        print(f"\033[92m[INFO] Basic Scan completed. {len(results)} devices found.\033[0m")
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
        subnet = get_subnet()
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[94m[DEBUG] Performing full scan on subnet: {subnet}\033[0m")
        
        oui_file_path = os.path.join(APPDATA_LOCATION, "oui.txt")
        oui_file_missing = not os.path.exists(oui_file_path)
        
        if oui_file_missing:
            print("\033[91m[WARNING] OUI file not found in AppData/ayosbypasser\033[0m")
            results = scan_network(subnet=subnet, scan_hostname=True, scan_vendor=False)
            for device in results:
                device["vendor"] = "No oui.txt"
        else:
            results = scan_network(subnet=subnet, scan_hostname=True, scan_vendor=True)

        if settings.get("debug_mode") == "full":
            print("\033[94m-[DEBUG] Start of request headers-\033[0m")
            for header, value in request.headers.items():
                print(f"  {header}: {value}")
            print("\033[94m-[DEBUG] End of request headers-\033[0m")
        
        log_scan_history("Full", len(results), results)
        print(f"\033[92m[INFO] Full Scan completed. {len(results)} devices found.\033[0m")
        
        return jsonify({
            "results": results,
            "message": "Full scan completed successfully.",
            "warning": "OUI file is missing. No vendor information. You can download it in the misc tab." if oui_file_missing else None
        })
    except Exception as e:
        print(f"\033[91m[ERROR] Full scan failed: {e}\033[0m")
        return jsonify({"error": "Full scan failed"}), 500

@app.route('/settings', methods=['GET', 'POST'])
def manage_settings():
    global settings
    if request.method == 'GET':
        return jsonify(settings)
    elif request.method == 'POST':
        updated_settings = request.json
        with open(SETTINGS_FILE, "w") as f:
            json.dump(updated_settings, f, indent=4)
        for key, value in updated_settings.items():
            if settings.get(key) != value:
                print(f"\033[94m[INFO] Setting changed: {key}={value}\033[0m")
        settings = updated_settings
        return jsonify({"message": "Settings updated successfully"})

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

def has_perms():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except AttributeError:
        return False

def permission_giver():
    try:
        script_path = os.path.abspath(sys.argv[0])
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, f'"{script_path}"', None, 1)
        sys.exit(0)
    except Exception as e:
        input(f"Problem with giving permissions: {e}")

if __name__ == '__main__':
    if settings.get("run_as_admin", False) and not has_perms():
        print("\033[93m[INFO] Restarting with administrative privileges...\033[0m")
        permission_giver()

    os.system('cls')

    # Configure Flask logging based on debug_mode
    if settings.get("debug_mode", "off") == "basic":
        logging.getLogger('werkzeug').setLevel(logging.INFO)  
    elif settings.get("debug_mode", "off") == "full":
        logging.getLogger('werkzeug').setLevel(logging.DEBUG) 
    else:
        logging.getLogger('werkzeug').setLevel(logging.ERROR) 

    if settings.get("debug_mode", "off") in ["basic", "off"]:
        cli = sys.modules['flask.cli']
        cli.show_server_banner = lambda *x: None

    print(f"\033[92m[INFO] Server running at http://{CREATOR_IP}:5000\033[0m")

    # Use subprocess to open the browser
    if settings["auto_open_page"]:
        try:
            subprocess.Popen(['start', 'http://localhost:5000'], shell=True)
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to open browser: {e}\033[0m")

    app.run(host='0.0.0.0', port=5000, threaded=True)
