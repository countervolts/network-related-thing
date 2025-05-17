from src.bypass.bypass import transport_names, neftcfg_search, init_bypass, IGNORE_LIST, restart_all_adapters, get_adapter_name
from flask import Flask, jsonify, send_from_directory, redirect, request, Response, stream_with_context
from src.ping import scan_network, get_default_gateway
from src.netman import GarpSpoofer, ping_manager
from src.monitor import connection_monitor
from werkzeug.exceptions import NotFound 
from getmac import get_mac_address
from functools import lru_cache
from flask_cors import CORS
from threading import Lock
import urllib.request
import subprocess
import threading
import requests
import platform
import logging
import socket
import GPUtil
import ctypes
import winreg
import signal
import psutil
import shutil
import base64
import json
import time
import uuid
import sys
import re
import os

def is_running_in_electron():
    # Check for specific environment variable that Electron can set
    return os.environ.get('RUNNING_IN_ELECTRON') == '1' or \
           os.environ.get('ELECTRON_RUN_AS_NODE') is not None or \
           os.path.basename(sys.executable).lower() in ['electron.exe', 'electron'] or \
           os.environ.get('ELECTRON') is not None or \
           '--electron-wrapper' in sys.argv  # Check for command line argument

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

LOG_FILE = os.path.join(APPDATA_LOCATION, "latest.log")

# Only set up file logging if running in Electron
if is_running_in_electron():
    if not os.path.exists(APPDATA_LOCATION):
        os.makedirs(APPDATA_LOCATION)
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8', mode='w')
    file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    logging.getLogger().addHandler(file_handler)
    # Optionally set the root logger level here if you want
    logging.getLogger().setLevel(logging.DEBUG)

DEFAULT_SETTINGS = {
    "hide_website": True,
    "auto_open_page": True,
    "debug_mode": "basic",
    "bypass_mode": "registry",
    "run_as_admin": False,
    "preserve_hotspot": False,
    "hardware_rng": True
}

network_controller = GarpSpoofer()

DISABLED_DEVICES = []
DISABLED_DEVICES_FILE = os.path.join(APPDATA_LOCATION, "disabled_devices.json")
disabled_devices_cleared = False

PING_CACHE = {}
PING_CACHE_TIMEOUT = 2
ping_lock = Lock()

HOTSPOT_DEVICE_STATE = {}
HOTSPOT_SETTINGS_FILE = os.path.join(APPDATA_LOCATION, "hotspot_settings.json")

def enable_internet_sharing(internet_adapter):
    try:
        # Get adapter GUIDs from their friendly names
        wmi_query = f'SELECT * FROM Win32_NetworkAdapter WHERE NetConnectionID="{internet_adapter}"'
        internet_guid = subprocess.check_output(['wmic', 'path', wmi_query, 'get', 'GUID'], 
                                                text=True).strip().split('\n')[1].strip()
        
        # Enable ICS through registry
        ics_key = r"HKLM\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\SharingConfig"
        subprocess.run(['reg', 'add', ics_key, '/v', 'SharingMode', '/t', 'REG_DWORD', '/d', '1', '/f'], check=True)
        subprocess.run(['reg', 'add', f"{ics_key}\\{internet_guid}", '/v', 'SharingMode', '/t', 'REG_DWORD', '/d', '1', '/f'], check=True)
        
        # Restart the Internet Connection Sharing service
        subprocess.run(['net', 'stop', 'SharedAccess'], check=True)
        subprocess.run(['net', 'start', 'SharedAccess'], check=True)
        
        return True
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to enable internet sharing via registry: {e}\033[0m")
        return False

@app.route('/hotspot/status', methods=['GET'])
def get_hotspot_status():
    try:
        # Use PowerShell to query the Mobile Hotspot status
        ps_command = '''
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
        
        Function Await($WinRtTask, $ResultType) {
            $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
            $netTask = $asTask.Invoke($null, @($WinRtTask))
            $netTask.Wait(-1) | Out-Null
            $netTask.Result
        }
        
        # Get WiFi Hotspot API
        $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
        $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
        
        if ($tetheringManager.TetheringOperationalState -eq 1) {
            # Hotspot is active
            Write-Output "HOTSPOT_ACTIVE"
        } else {
            # Hotspot is not active
            Write-Output "HOTSPOT_INACTIVE"
        }
        '''
        
        result = subprocess.run(["powershell", "-Command", ps_command], capture_output=True, text=True)
        
        if "HOTSPOT_ACTIVE" in result.stdout:
            return jsonify({"enabled": True})
        else:
            return jsonify({"enabled": False})
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to get hotspot status: {e}\033[0m")
        return jsonify({"error": f"Failed to get hotspot status: {str(e)}"}), 500

def has_compatible_wifi_adapter():
    try:
        result = subprocess.run(
            ["netsh", "wlan", "show", "drivers"],
            capture_output=True,
            text=True
        )
        output = result.stdout.lower()

        for line in output.splitlines():
            if "hosted network supported" in line:
                return "yes" in line

        result = subprocess.run(
            ["netsh", "interface", "show", "interface"],
            capture_output=True,
            text=True
        )
        for line in result.stdout.lower().splitlines():
            if "wireless" in line and "enabled" in line:
                return True

        return False
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to check WiFi adapter: {e}\033[0m")
        return False

@app.route('/settings/get', methods=['GET'])
def get_setting():
    key = request.args.get('key')
    if not key:
        return jsonify({"error": "No key provided"}), 400
        
    value = settings.get(key, DEFAULT_SETTINGS.get(key, None))
    return jsonify({"key": key, "value": value})

@app.route('/hotspot/enable', methods=['POST'])
def enable_hotspot():
    try:
        if not has_compatible_wifi_adapter():
            return jsonify({"error": "No compatible WiFi adapter found. Hotspot cannot be enabled."}), 400

        ssid = ""
        key = ""
        ghz = "2.4"
        security = "WPA2"
        max_devices = 8

        if os.path.exists(HOTSPOT_SETTINGS_FILE):
            with open(HOTSPOT_SETTINGS_FILE, "r") as f:
                settings_data = json.load(f)
                ssid = settings_data.get("name", ssid)
                key = settings_data.get("password", key)
                ghz = settings_data.get("ghz", ghz)
                security = settings_data.get("security", security)
                max_devices = int(settings_data.get("max_devices", max_devices))

        # Use PowerShell to enable the Mobile Hotspot with our settings
        ps_command = f'''
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]

        Function Await($WinRtTask, $ResultType) {{
            $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
            $netTask = $asTask.Invoke($null, @($WinRtTask))
            $netTask.Wait(-1) | Out-Null
            $netTask.Result
        }}

        # Get WiFi Hotspot API
        $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
        $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)

        # Set configuration
        $tetheringManager.MaxClientCount = {max_devices}
        $config = $tetheringManager.GetCurrentAccessPointConfiguration()
        $config.Ssid = "{ssid}"
        $config.Passphrase = "{key}"
        # Try to set GHz and Security if supported (these may not work on all Windows builds)
        try {{
            $config.Band = "{ghz}"
        }} catch {{}}
        try {{
            $config.SecurityType = "{security}"
        }} catch {{}}

        $configTask = $tetheringManager.ConfigureAccessPointAsync($config)
        Await $configTask ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])

        # Start hotspot
        $task = $tetheringManager.StartTetheringAsync()
        $result = Await $task ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])

        if ($result.Status -eq 0) {{
            Write-Output "HOTSPOT_ENABLED_SUCCESS"
        }} else {{
            Write-Output "HOTSPOT_ENABLED_FAILURE: $($result.Status)"
        }}
        '''

        result = subprocess.run(["powershell", "-Command", ps_command], capture_output=True, text=True)

        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] PowerShell output: {result.stdout}\033[0m")
            if result.stderr:
                print(f"\033[91m[ERROR] PowerShell error: {result.stderr}\033[0m")

        if "HOTSPOT_ENABLED_SUCCESS" in result.stdout:
            return jsonify({"message": "Hotspot enabled successfully"})
        else:
            error_message = result.stdout if "HOTSPOT_ENABLED_FAILURE" in result.stdout else "Failed to enable hotspot"
            return jsonify({"error": error_message}), 500
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to enable hotspot: {e}\033[0m")
        return jsonify({"error": f"Failed to enable hotspot: {str(e)}"}), 500

@app.route('/hotspot/disable', methods=['POST'])
def disable_hotspot():
    try:
        ps_command = '''
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
        
        Function Await($WinRtTask, $ResultType) {
            $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
            $netTask = $asTask.Invoke($null, @($WinRtTask))
            $netTask.Wait(-1) | Out-Null
            $netTask.Result
        }
        
        # Get WiFi Hotspot API
        $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
        $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
        
        # Stop hotspot
        $task = $tetheringManager.StopTetheringAsync()
        $result = Await $task ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
        
        if ($result.Status -eq 0) {
            Write-Output "HOTSPOT_DISABLED_SUCCESS"
        } else {
            Write-Output "HOTSPOT_DISABLED_FAILURE: $($result.Status)"
        }
        '''
        
        result = subprocess.run(["powershell", "-Command", ps_command], capture_output=True, text=True)
        
        if settings.get("debug_mode", "off") == "full":
            print(f"\033[94m[DEBUG] PowerShell output: {result.stdout}\033[0m")
            if result.stderr:
                print(f"\033[91m[ERROR] PowerShell error: {result.stderr}\033[0m")
        
        if "HOTSPOT_DISABLED_SUCCESS" in result.stdout:
            return jsonify({"message": "Hotspot disabled successfully"})
        else:
            error_message = result.stdout if "HOTSPOT_DISABLED_FAILURE" in result.stdout else "Failed to disable hotspot"
            return jsonify({"error": error_message}), 500
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to disable hotspot: {e}\033[0m")
        return jsonify({"error": f"Failed to disable hotspot: {str(e)}"}), 500

@app.route('/hotspot/settings', methods=['GET', 'POST'])
def hotspot_settings():
    if request.method == 'GET':
        try:
            if os.path.exists(HOTSPOT_SETTINGS_FILE):
                with open(HOTSPOT_SETTINGS_FILE, "r") as f:
                    settings = json.load(f)
                # Provide defaults for new fields
                return jsonify({
                    "name": settings.get("name", ""),
                    "ghz": settings.get("ghz", "2.4"),
                    "security": settings.get("security", "WPA2"),
                    "max_devices": settings.get("max_devices", 8)
                })
            return jsonify({"name": "", "ghz": "2.4", "security": "WPA2", "max_devices": 8})
        except Exception as e:
            return jsonify({"error": f"Failed to get hotspot settings: {str(e)}"}), 500

    elif request.method == 'POST':
        try:
            data = request.json
            name = data.get('name', '').strip()
            password = data.get('password', '').strip()
            ghz = data.get('ghz', '2.4')
            security = data.get('security', 'WPA2')
            max_devices = int(data.get('max_devices', 8))

            # Only require name/password if present in request (for compatibility)
            if 'name' in data and not name:
                return jsonify({"error": "Network name is required"}), 400
            if 'password' in data and len(password) < 8:
                return jsonify({"error": "Password must be at least 8 characters"}), 400

            # Load existing settings and update
            settings = {}
            if os.path.exists(HOTSPOT_SETTINGS_FILE):
                with open(HOTSPOT_SETTINGS_FILE, "r") as f:
                    settings = json.load(f)
            if name:
                settings['name'] = name
            if password:
                settings['password'] = password
            settings['ghz'] = ghz
            settings['security'] = security
            settings['max_devices'] = max_devices

            with open(HOTSPOT_SETTINGS_FILE, "w") as f:
                json.dump(settings, f, indent=4)

            return jsonify({"message": "Hotspot settings saved successfully"})
        except Exception as e:
            return jsonify({"error": f"Failed to save hotspot settings: {str(e)}"}), 500

@app.route('/hotspot/connected-devices', methods=['GET'])
def get_connected_devices():
    global HOTSPOT_DEVICE_STATE
    try:
        devices = []
        found_clients = set()

        # Use PowerShell to get connected clients from the Windows Hotspot API
        ps_command = '''
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
        Function Await($WinRtTask, $ResultType) {
            $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
            $netTask = $asTask.Invoke($null, @($WinRtTask))
            $netTask.Wait(-1) | Out-Null
            $netTask.Result
        }
        $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
        $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
        if ($tetheringManager.TetheringOperationalState -ne 1) {
            Write-Output "HOTSPOT_INACTIVE"
            exit
        }
        $clients = $tetheringManager.GetTetheringClients()
        foreach ($client in $clients) {
            $mac = $client.MacAddress
            Write-Output "$mac"
        }
        '''

        result = subprocess.run(["powershell", "-Command", ps_command], capture_output=True, text=True)
        lines = result.stdout.strip().splitlines()

        if "HOTSPOT_INACTIVE" in lines:
            HOTSPOT_DEVICE_STATE.clear()
            if settings.get("debug_mode", "off") in ["basic", "full"]:
                print(f"\033[94m[DEBUG] Hotspot is not active\033[0m")
            return jsonify({"devices": []})

        # Get ARP table for MAC-to-IP mapping
        arp_result = subprocess.run(["arp", "-a"], capture_output=True, text=True)
        arp_table = {}
        for line in arp_result.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 2 and re.match(r"(\d{1,3}\.){3}\d{1,3}", parts[0]):
                ip = parts[0]
                mac = parts[1].replace("-", ":").lower()
                arp_table[mac] = ip

        device_num = 1
        current_macs = set()
        for line in lines:
            mac = normalize_mac_address(line.strip())
            if not mac or mac == "00:00:00:00:00:00" or mac in found_clients:
                continue
            found_clients.add(mac)
            current_macs.add(mac)
            ip = arp_table.get(mac, "Unknown")

            # Use existing id and connectedSince if present, else create new
            if mac in HOTSPOT_DEVICE_STATE:
                device_id = HOTSPOT_DEVICE_STATE[mac]['id']
                connected_since = HOTSPOT_DEVICE_STATE[mac]['connectedSince']
            else:
                device_id = str(uuid.uuid4())
                connected_since = time.strftime("%Y-%m-%d %H:%M:%S")
                HOTSPOT_DEVICE_STATE[mac] = {
                    'id': device_id,
                    'connectedSince': connected_since
                }

            devices.append({
                "id": device_id,
                "ip": ip,
                "mac": mac,
                "name": f"Device {device_num}",
                "connectedSince": connected_since
            })
            device_num += 1
            if settings.get("debug_mode", "off") in ["basic", "full"]:
                print(f"\033[94m[DEBUG] Found device MAC={mac}, IP={ip}\033[0m")

        # Remove devices that are no longer connected
        for mac in list(HOTSPOT_DEVICE_STATE.keys()):
            if mac not in current_macs:
                del HOTSPOT_DEVICE_STATE[mac]

        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[94m[DEBUG] Found {len(devices)} hotspot connected devices\033[0m")

        return jsonify({"devices": devices})
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to get connected devices: {e}\033[0m")
            import traceback
            traceback.print_exc()
        return jsonify({"error": f"Failed to get connected devices: {str(e)}"}), 500
    
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
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" # doesnt work without this
        }
        response = requests.get(OUI_URL, headers=headers, timeout=10)
        response.raise_for_status()
        oui_file_path = os.path.join(APPDATA_LOCATION, "oui.txt")
        with open(oui_file_path, "w", encoding="utf-8") as f:
            f.write(response.text)
        
        return jsonify({"message": f"OUI file downloaded successfully to {oui_file_path}."})
    except Exception as e:
        return jsonify({"error": f"Failed to download OUI file: {str(e)}"}), 500

def load_history(file_path):
    start_time = time.time()
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            try:
                data = json.load(f)
                end_time = time.time()
                # print(f"\033[94m[DEBUG] Load history duration: {end_time - start_time:.2f} seconds\033[0m")
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

    updated_settings = {key: user_settings.get(key, DEFAULT_SETTINGS[key]) for key in DEFAULT_SETTINGS}

    for key in DEFAULT_SETTINGS:
        if key not in user_settings:
            settings_changed = True

    if updated_settings != user_settings:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(updated_settings, f, indent=4)

    return updated_settings, settings_changed

settings, settings_changed = load_settings()

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

def save_history(file_path, data):
    with open(file_path, "w") as f:
        json.dump(data, f, indent=4)

def log_scan_history(scan_type, device_count, results):
    history = load_history(SCAN_HISTORY_FILE) or [] 
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
        if restart_all_adapters():
            return jsonify({"message": "Network adapters restarted successfully."})
        else:
            return jsonify({"error": "Failed to restart network adapters."}), 500
    except Exception as e:
        return jsonify({"error": f"Failed to restart network adapters: {str(e)}"}), 500

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
        if restart_all_adapters():
            end_time = time.time()
            elapsed_time = end_time - start_time
            print(f"\033[94m[DEBUG] Successfully requested MAC address change for: {transport_name}\033[0m")
            print(f"\033[94m[DEBUG] Revert process completed in {elapsed_time:.2f} seconds\033[0m")
            return jsonify({"message": f"MAC address change requested successfully."})
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
def bypass_change_mac():
    data = request.json
    transport = data.get('transport')
    mode = data.get('mode', 'standard')
    use_hardware_rng = data.get('hardware_rng', True)
    
    if not transport:
        return jsonify({"error": "Transport name is required"}), 400
        
    # Find device with this transport name
    instances = neftcfg_search(transport)
    if not instances:
        return jsonify({"error": "No network adapter found with this transport name"}), 404
    
    # Use the first instance found - note _ prefix for unused variable
    _, sub_name = instances[0]
    
    # Get current MAC before changing
    key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{sub_name}"
    current_mac = None
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            try:
                current_mac = winreg.QueryValueEx(key, 'NetworkAddress')[0]
            except FileNotFoundError:
                pass  # MAC address not previously set
    except Exception as e:
        app.logger.error(f"Error getting current MAC: {str(e)}")
    
    # Change the MAC address
    new_mac = init_bypass(sub_name, mac_mode=mode, use_hardware_rng=use_hardware_rng)

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
        }), 500

@app.before_request
def restrict_access():
    if settings.get("hide_website", True):  
        client_ip = request.remote_addr
        if client_ip not in [CREATOR_IP, "127.0.0.1"]:
            return redirect("https://www.google.com")

@app.route('/updater/download', methods=['POST'])
def download_update():
    try:
        data = request.json
        download_url = data.get('url')
        version = data.get('version')
        
        if not download_url or not version:
            return jsonify({"success": False, "error": "Missing download URL or version"}), 400
        
        temp_dir = os.path.join(os.getenv('APPDATA'), "ayosbypasser", "updates")
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
        
        response = requests.get(download_url, stream=True)
        if not response.ok:
            return jsonify({"success": False, "error": f"Failed to download: {response.status_code}"}), 500
        
        file_path = os.path.join(temp_dir, "server.exe")
        with open(file_path, 'wb') as f:
            shutil.copyfileobj(response.raw, f)
        
        with open(os.path.join(temp_dir, "version.txt"), 'w') as f:
            f.write(version)
        
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
            
            if os.path.exists(update_file):
                desktop_path = os.path.join(os.path.join(os.environ['USERPROFILE']), 'Desktop')
                desktop_exe = os.path.join(desktop_path, "server.exe")
                
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

@app.route('/system/info')
def get_system_info():
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
        cpu_vendor = ""
        if "genuineintel" in cpu_info.lower():
            cpu_vendor = " (GenuineIntel)"
        if "authenticamd" in cpu_info.lower():
            cpu_vendor = " (AuthenticAMD)"
        elif "" in cpu_info.lower():
            cpu_vendor = " (er wtf?)"
            
        try:
            cpu_output = subprocess.check_output("wmic cpu get name", shell=True).decode('utf-8').strip()
            cpu_lines = cpu_output.split('\n')
            if len(cpu_lines) > 1:
                cpu_info = cpu_lines[1].strip() + cpu_vendor
                
            gpu_output = subprocess.check_output("wmic path win32_VideoController get name", shell=True).decode('utf-8').strip()
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
                    # Skip CD/DVD drives
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
            "storage": storage_info
        })
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to get system info: {e}\033[0m")
        return jsonify({
            "error": "Failed to get system info"
        }), 500

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
    save_history(SCAN_HISTORY_FILE, updated_history)
    return jsonify({"message": "Scan history deleted successfully."})

@app.route('/history/bypasses', methods=['GET'])
def get_bypass_history():
    return jsonify(load_history(BYPASS_HISTORY_FILE))

@app.route('/scan/basic')
def basic_scan():
    try:
        start_time = time.time()  
        subnet = get_subnet()
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[94m[DEBUG] Performing basic scan on subnet: {subnet}\033[0m")
        
        results = scan_network(subnet=subnet, scan_hostname=False, scan_vendor=False) or []
        local_ip = get_local_ip()
        local_mac = get_mac_address()
        for result in results:
            if result["ip"] == local_ip:
                result["mac"] = local_mac
                break
        
        for result in results:
            result["hostname"] = "Skipped"
            result["vendor"] = "Skipped"

        log_scan_history("Basic", len(results), results)
        print(f"\033[92m[INFO] Basic Scan completed. {len(results)} devices found.\033[0m")
        
        end_time = time.time()  
        print(f"\033[94m[DEBUG] Basic scan duration: {end_time - start_time:.2f} seconds\033[0m")
        
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
        
        oui_file_path = os.path.join(APPDATA_LOCATION, "oui.txt")
        oui_file_missing = not os.path.exists(oui_file_path)
        
        if oui_file_missing:
            print("\033[91m[WARNING] OUI file not found in AppData/ayosbypasser\033[0m")
            results = scan_network(subnet=subnet, scan_hostname=True, scan_vendor=False)
            for device in results:
                device["vendor"] = "No oui.txt"
        else:
            results = scan_network(subnet=subnet, scan_hostname=True, scan_vendor=True)
        local_ip = get_local_ip()
        local_mac = get_mac_address()  
        for result in results:
            if result["ip"] == local_ip:
                result["mac"] = local_mac
                break
        
        log_scan_history("Full", len(results), results)
        print(f"\033[92m[INFO] Full Scan completed. {len(results)} devices found.\033[0m")
        
        end_time = time.time() 
        print(f"\033[94m[DEBUG] Full scan duration: {end_time - start_time:.2f} seconds\033[0m")
        
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
    
    # Update levels of existing handlers
    for handler in werkzeug_logger.handlers:
        handler.setLevel(console_level)
    
    for handler in app.logger.handlers:
        handler.setLevel(console_level)
    
    # No registration of new handlers or filters
    if settings.get("debug_mode", "off") in ["basic", "full"]:
        print(f"\033[94m[DEBUG] Logging level updated to: {debug_mode}\033[0m")

@app.before_request
def log_request():
    if is_running_in_electron() or settings.get("debug_mode", "off") != "off":
        app.logger.debug(f"Request: {request.method} {request.path}")
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

@app.route('/settings', methods=['GET', 'POST'])
def manage_settings():
    global settings
    if request.method == 'GET':
        return jsonify(settings)
    elif request.method == 'POST':
        updated_settings = request.json
        # Ensure preserve_hotspot is always present
        if "preserve_hotspot" not in updated_settings:
            updated_settings["preserve_hotspot"] = False
        with open(SETTINGS_FILE, "w") as f:
            json.dump(updated_settings, f, indent=4)
        for key, value in updated_settings.items():
            if settings.get(key) != value:
                print(f"\033[94m[INFO] Setting changed: {key}={value}\033[0m")
        settings = updated_settings

        # Update logging level dynamically if debug mode changes
        update_logging_level(updated_settings.get("debug_mode", "off"))

        return jsonify({"message": "Settings updated successfully"})

@app.route('/exit', methods=['POST'])
def exit_server():
    def shutdown():
        func = request.environ.get('werkzeug.server.shutdown')
        if func is None:
            raise RuntimeError('Not running with the Werkzeug Server')
        func()

    print("\033[93m[INFO] Exit button clicked. Shutting down the server...\033[0m")
    graceful_shutdown(signal.SIGINT, None) 
    shutdown()
    return jsonify({"message": "Server shutting down gracefully."})

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    try:
        return send_from_directory('.', path)
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
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, f'"{script_path}"', None, 1)
        sys.exit(0)
    except Exception as e:
        input(f"Problem with giving permissions: {e}")

@app.route('/server/start', methods=['GET'])
def server_start():
    print("\033[92m[INFO] Server has started. Clearing client-side disabled devices.\033[0m")
    return jsonify({"message": "Server started. Clear disabled devices."})

def graceful_shutdown(_signal_received, _frame):
    # Combine shutdown prints into a single statement
    shutdown_msgs = []
    shutdown_msgs.append("\033[93m[INFO] Graceful shutdown initiated...\033[0m")
    global DISABLED_DEVICES

    # Re-enable all disabled devices
    for device in DISABLED_DEVICES:
        try:
            mac = device['mac']
            network_controller.restore_device(mac)
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to re-enable device {mac}: {e}\033[0m")

    # Save the disabled devices list to the file
    save_disabled_devices()
    shutdown_msgs.append("\033[92m[INFO] Disabled devices list saved on shutdown.\033[0m")

    # Clear the disabled devices list
    DISABLED_DEVICES = []
    shutdown_msgs.append("\033[92m[INFO] All disabled devices have been re-enabled.\033[0m")

    # Stop hotspot if preserve_hotspot is False
    if not settings.get("preserve_hotspot", False):
        try:
            # Check if hotspot is running before stopping
            ps_status = '''
            Add-Type -AssemblyName System.Runtime.WindowsRuntime
            $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
            Function Await($WinRtTask, $ResultType) {
                $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
                $netTask = $asTask.Invoke($null, @($WinRtTask))
                $netTask.Wait(-1) | Out-Null
                $netTask.Result
            }
            $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
            $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
            if ($tetheringManager.TetheringOperationalState -eq 1) {
                Write-Output "HOTSPOT_ACTIVE"
            } else {
                Write-Output "HOTSPOT_INACTIVE"
            }
            '''
            result = subprocess.run(["powershell", "-Command", ps_status], capture_output=True, text=True)
            if "HOTSPOT_ACTIVE" in result.stdout:
                shutdown_msgs.append("\033[93m[INFO] Stopping hotspot due to shutdown (preserve_hotspot is off)...\033[0m")
                subprocess.run(["powershell", "-Command", '''
                    Add-Type -AssemblyName System.Runtime.WindowsRuntime
                    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
                    Function Await($WinRtTask, $ResultType) {
                        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
                        $netTask = $asTask.Invoke($null, @($WinRtTask))
                        $netTask.Wait(-1) | Out-Null
                        $netTask.Result
                    }
                    $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
                    $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
                    $task = $tetheringManager.StopTetheringAsync()
                    $result = Await $task ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
                '''], capture_output=True, text=True)
                shutdown_msgs.append("\033[92m[INFO] Hotspot stopped during shutdown.\033[0m")
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to stop hotspot during shutdown: {e}\033[0m")

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
    response.headers['X-Accel-Buffering'] = 'no'  # Disable buffering for nginx
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
            if current_time - data['last_active'] > 30  # 30 seconds timeout
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

@app.route('/monitor/adapters', methods=['GET'])
def get_network_adapters():
    try:
        adapters = connection_monitor.get_adapters()
        return jsonify(adapters)
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to get network adapters: {e}\033[0m")
        return jsonify({"error": str(e)}), 500

@app.route('/monitor/connections', methods=['GET'])
def get_outbound_connections():
    try:
        adapter_filter = request.args.get('adapter', 'all')
        connections = connection_monitor.get_connections(adapter_filter)
        return jsonify({"connections": connections})
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to get connections: {e}\033[0m")
        return jsonify({"error": str(e)}), 500

@app.route('/monitor/whois', methods=['GET'])
def whois_lookup():
    try:
        ip = request.args.get('ip')
        if not ip:
            return jsonify({"success": False, "error": "No IP address provided"}), 400
            
        result = connection_monitor.perform_whois_lookup(ip)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        if settings.get("debug_mode", "off") in ["basic", "full"]:
            print(f"\033[91m[ERROR] Failed to perform WHOIS lookup: {e}\033[0m")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    if settings.get("run_as_admin", False) and not has_perms():
        print("\033[93m[INFO] Restarting with administrative privileges...\033[0m")
        permission_giver()

    os.system('cls')    
    
    if settings.get("debug_mode", "off") == "basic":
        logging.getLogger('werkzeug').setLevel(logging.INFO)  
    elif settings.get("debug_mode", "off") == "full":
        logging.getLogger('werkzeug').setLevel(logging.DEBUG) 
    else:
        logging.getLogger('werkzeug').setLevel(logging.ERROR) 

    if settings.get("debug_mode", "off") in ["basic", "off"]:
        cli = sys.modules['flask.cli']
        cli.show_server_banner = lambda *_: None

    # Hardcoded to always use port 8080
    PORT = 8080
    print(f"\033[92m[INFO] Server running at http://{CREATOR_IP}:{PORT}\033[0m")

    if settings_changed:
        for key in DEFAULT_SETTINGS:
            if key not in settings:
                print(f"\033[93m[INFO] New setting detected: '{key}' (added to settings dir)\033[0m")

    if settings["auto_open_page"] and not is_running_in_electron():
        try:
            # Updated to use port 8080
            subprocess.Popen(['start', f'http://localhost:{PORT}'], shell=True)
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to open browser: {e}\033[0m")

    try:
        # Directly run on 127.0.0.1 (localhost) with port 8080
        print(f"\033[93m[INFO] Starting server on localhost:{PORT}...\033[0m")
        app.run(host='127.0.0.1', port=PORT, threaded=True)
    except Exception as e:
        print(f"\033[91m[ERROR] Failed to start server: {e}\033[0m")
        print("\033[93m[INFO] Try running as administrator or check if port 8080 is already in use.\033[0m")
