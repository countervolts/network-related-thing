import os
import time
import json
import socket
import logging
import subprocess
from bypass import get_active_network_adapter, init_bypass, neftcfg_search

# --- Configuration ---
SERVICE_NAME = "NetworkRelatedThingAutoBypass"
APPDATA_PATH = os.path.join(os.getenv('APPDATA'), "ayosbypasser")
CONFIG_FILE = os.path.join(APPDATA_PATH, "auto_bypass_config.json")
LOG_FILE = os.path.join(APPDATA_PATH, "auto_bypass.log")

# --- Setup Logging ---
if not os.path.exists(APPDATA_PATH):
    os.makedirs(APPDATA_PATH)

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filemode='w'
)

def log_info(message):
    logging.info(message)
    print(message)

def log_error(message):
    logging.error(message)
    print(f"ERROR: {message}")

def get_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        log_error(f"Error reading config file: {e}")
    # Default config
    return {'interval': 60, 'enabled': False}

def check_internet(host="1.1.1.1", port=53, timeout=3):
    try:
        socket.setdefaulttimeout(timeout)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
        return True
    except socket.error:
        return False

def run_bypass(transport_id):
    log_info("Internet connection lost. Attempting bypass...")
    if not transport_id:
        log_error("No target adapter configured for bypass. Please set one in the Auto tab.")
        return

    try:
        # We need to find the registry subkey (e.g., '0001') from the transport ID
        instances = neftcfg_search(transport_id)
        if not instances:
            log_error(f"Could not find registry instance for transport ID: {transport_id}")
            return
        
        # Use the first instance found
        _, sub_name = instances[0]

        log_info(f"Targeting adapter: {transport_id}. Starting bypass on instance {sub_name}...")
        
        # Use default settings for the automatic bypass. Randomized is best for this.
        new_mac = init_bypass(sub_name, mac_mode='randomized', use_hardware_rng=True)
        
        if new_mac:
            log_info(f"Bypass successful. New MAC address: {new_mac}")
        else:
            log_error("Bypass attempt failed.")
            
    except Exception as e:
        log_error(f"An unexpected error occurred during bypass: {e}")

def main_loop():
    log_info("Auto Bypass service started.")
    
    while True:
        config = get_config()
        interval = max(30, config.get('interval', 60))
        transport_id = config.get('transport_id')

        if not config.get('enabled', False):
            log_info("Service is disabled in config. Exiting.")
            break

        if not check_internet():
            run_bypass(transport_id)
            # Wait longer after a bypass to allow network to stabilize
            log_info("Waiting for 2 minutes after bypass attempt...")
            time.sleep(120)
        else:
            log_info(f"Internet connection is active. Checking again in {interval} seconds.")
            time.sleep(interval)

if __name__ == "__main__":
    main_loop()