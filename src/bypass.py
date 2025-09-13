import subprocess
import re
import random
import time
import logging
import os

logger = logging.getLogger(__name__)

IGNORE_LIST = [
    "Bluetooth PAN",
    "Thunderbolt Bridge",
    "Parallels",
    "VMware",
    "VirtualBox",
    "VPN",
    "Loopback",
    "lo0"
]

def transport_names():
    try:
        output = subprocess.check_output(["networksetup", "-listallhardwareports"], universal_newlines=True, timeout=10)
        
        transport_names = []
        driver_descriptions = []
        mp_transport = None
        
        current_desc = None
        for line in output.splitlines():
            if line.startswith("Hardware Port:"):
                current_desc = line.split(":", 1)[1].strip()
            elif line.startswith("Device:") and current_desc:
                interface_name = line.split(":", 1)[1].strip()
                
                # Use interface name as the transport_name for consistency
                transport_names.append(interface_name)
                driver_descriptions.append(current_desc)
                
                if not mp_transport and not any(ignored in current_desc for ignored in IGNORE_LIST):
                    mp_transport = interface_name
                
                current_desc = None

        return transport_names, driver_descriptions, mp_transport
    except Exception as e:
        logger.error(f"Error getting transport names on macOS: {str(e)}")
        return [], [], None

def neftcfg_search(transport_name):
    try:
        # Check if the interface exists using ifconfig
        result = subprocess.run(['ifconfig', transport_name], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            # Return in the format (transport_name, interface_name)
            return [(transport_name, transport_name)]
    except Exception as e:
        logger.error(f"Interface search for '{transport_name}' failed on macOS: {e}")
    return []

def get_active_network_adapter():
    try:
        # 'netstat -rn' shows the routing table, 'grep default' finds the default route
        result = subprocess.check_output("netstat -rn | grep default", shell=True, text=True)
        interface = result.split()[-1]
        
        # Map interface to a user-friendly name
        if interface.startswith('en'):
            return "Wi-Fi" if "Wi-Fi" in get_adapter_name(interface) else "Ethernet", interface
    except Exception as e:
        logger.error(f"Failed to determine active network adapter on macOS: {e}")
    return None, None

def restart_all_adapters(adapter_name=None):
    try:
        interfaces_to_restart = []
        if adapter_name:
            interfaces_to_restart.append(adapter_name)
        else:
            # Get all interfaces and filter them
            all_ports, _, _ = transport_names()
            interfaces_to_restart = [
                iface for iface in all_ports 
                if not any(ignored in get_adapter_name(iface, "Unknown") for ignored in IGNORE_LIST)
            ]

        for interface in interfaces_to_restart:
            adapter_desc = get_adapter_name(interface, "Unknown")
            is_wifi = "Wi-Fi" in adapter_desc
            
            if is_wifi:
                logger.info(f"Performing hard restart for Wi-Fi adapter: {interface}")
                print(f"\033[94m[DEBUG] Performing hard restart for Wi-Fi adapter: {interface}\033[0m")
                
                # 1. Disassociate from any Wi-Fi networks
                airport_path = "/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport"
                subprocess.run([airport_path, "-z"], capture_output=True)
                
                # 2. Turn off Wi-Fi using networksetup
                subprocess.run(["networksetup", "-setairportpower", interface, "off"], capture_output=True)
                
                # 3. Wait a moment longer for complete shutdown
                time.sleep(1.0)
                
                # 4. Turn Wi-Fi back on
                subprocess.run(["networksetup", "-setairportpower", interface, "on"], capture_output=True)
                
                # 5. Wait for interface to initialize properly
                time.sleep(1.5)
            else:
                logger.info(f"Performing standard restart for adapter: {interface}")
                print(f"\033[94m[DEBUG] Performing standard restart for adapter: {interface}\033[0m")
                
                # Bring interface down
                down = subprocess.run(["ifconfig", interface, "down"], capture_output=True, text=True)
                if down.returncode != 0:
                    logger.error(f"ifconfig down failed for {interface}: {down.stderr.strip()}")
                    print(f"\033[91m[ERROR] ifconfig down failed for {interface}: {down.stderr.strip()}\033[0m")
                
                time.sleep(0.5)  # Longer wait time
                
                # Bring interface up
                up = subprocess.run(["ifconfig", interface, "up"], capture_output=True, text=True)
                if up.returncode != 0:
                    logger.error(f"ifconfig up failed for {interface}: {up.stderr.strip()}")
                    print(f"\033[91m[ERROR] ifconfig up failed for {interface}: {up.stderr.strip()}\033[0m")
                    continue  # Continue with other interfaces instead of returning False
                
                time.sleep(0.5)  # Longer wait time
        
        logger.info(f"Successfully requested restart for specified adapters.")
        print(f"\033[92m[INFO] Successfully requested restart for specified adapters.\033[0m")
        return True
    except Exception as e:
        logger.error(f"Unexpected error while restarting network adapters on macOS: {e}")
        print(f"\033[91m[ERROR] Unexpected error while restarting network adapters: {e}\033[0m")
        return False

# This function is now an alias for restart_all_adapters with a specific name
disable_enable_adapter = restart_all_adapters

def rand0m_hex():
    instruction = "Software os.urandom"
    random_bytes = os.urandom(6)
    hex_values = [format(b, '02x') for b in random_bytes]
    
    # Ensure the first byte follows the LAA unicast pattern
    # Bit 0 (LSB) must be 0 (unicast)
    # Bit 1 must be 1 (locally administered)
    first_byte = int(hex_values[0], 16)
    first_byte = (first_byte & 0xFE) | 0x02
    
    hex_values[0] = format(first_byte, '02x')
    
    mac = ''.join(hex_values)
    logger.debug(f"Generated LAA MAC: {mac}, First byte: {hex_values[0]}, Binary: {bin(first_byte)[2:].zfill(8)}")
    return mac, instruction

def ensure_device_exists(interface):
    try:
        res = subprocess.run(['ifconfig', interface], capture_output=True, text=True, timeout=3)
        if res.returncode != 0:
            raise FileNotFoundError(f"Interface {interface} not found or down")
        return True
    except Exception as e:
        raise FileNotFoundError(f"Interface {interface} not found or down: {e}")

def get_type(interface):
    # Try to read type via ifconfig -v, fallback to adapter description
    try:
        res = subprocess.run(['ifconfig', '-v', interface], capture_output=True, text=True, timeout=3)
        out = res.stdout or res.stderr or ""
        m = re.search(r'type:\s*(\S+)', out)
        if m:
            return m.group(1)
    except Exception:
        pass
    # fallback: use the user-friendly adapter name
    return get_adapter_name(interface, interface)

def warn_multicast(mac):
    # mac expected as plain hex or colon separated; check first octet LSB
    clean = re.sub(r'[^0-9a-fA-F]', '', mac)[:2]
    if not clean:
        return
    try:
        dec = int(clean, 16)
        if (dec & 1) != 0:
            print("\033[93m[WARN] MAC address is multicast! Setting it might not work.\033[0m")
    except Exception:
        pass

def generate_mac_openssl_style():
    # Use rand0m_hex to produce a valid Unicast LAA and format as colon-separated
    mac_raw, instr = rand0m_hex()
    mac_formatted = ':'.join(mac_raw[i:i+2] for i in range(0, 12, 2))
    return mac_formatted

def current_mac(interface):
    try:
        res = subprocess.run(['ifconfig', interface], capture_output=True, text=True, timeout=3)
        out = res.stdout or res.stderr or ""
        for line in out.splitlines():
            if line.strip().startswith('ether '):
                return line.strip().split()[1].strip()
    except Exception:
        pass
    return None

def get_permanent(adapter_desc):
    try:
        res = subprocess.run(["networksetup", "-getmacaddress", adapter_desc], capture_output=True, text=True, timeout=3)
        out = res.stdout or res.stderr or ""
        m = re.search(r'([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5})', out)
        if m:
            return m.group(1).lower()
    except Exception:
        pass
    return None

def set_mac(interface, mac, adapter_desc=None):
    iface_type = get_type(interface)
    is_wifi = "Wi-Fi" in str(iface_type) or (adapter_desc and "Wi-Fi" in adapter_desc)

    if is_wifi:
        # Disassociate first
        airport_path = "/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport"
        try:
            subprocess.run([airport_path, "-z"], check=False, capture_output=True, text=True)
        except Exception:
            pass

    # Execute the ifconfig set
    proc = subprocess.run(['ifconfig', interface, 'ether', mac], capture_output=True, text=True)
    status = proc.returncode

    if is_wifi and adapter_desc:
        # match script: networksetup -detectnewhardware
        try:
            subprocess.run(["networksetup", "-detectnewhardware"], check=False, capture_output=True, text=True)
        except Exception:
            pass

    if status != 0:
        stderr = (proc.stderr or proc.stdout or "").strip()
        raise subprocess.CalledProcessError(returncode=status, cmd=proc.args, stderr=stderr)
    return True

def get_adapter_name(sub_name, default=""):
    try:
        output = subprocess.check_output(["networksetup", "-listallhardwareports"], universal_newlines=True, timeout=5)
        for i, line in enumerate(output.splitlines()):
            if f"Device: {sub_name}" in line:
                # The description is in the line above "Device:"
                if i > 0 and output.splitlines()[i-1].startswith("Hardware Port:"):
                    return output.splitlines()[i-1].split(":", 1)[1].strip()
    except Exception:
        pass
    return default

def get_adapter_ip(adapter_name):
    try:
        result = subprocess.check_output(['ifconfig', adapter_name], text=True, timeout=2)
        match = re.search(r'inet (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', result)
        if match:
            ip = match.group(1)
            if ip and not ip.startswith("169.254.") and ip != "0.0.0.0":
                return ip
    except Exception as e:
        logger.error(f"Error getting IP for adapter {adapter_name} on macOS: {e}")
    return None

# new helper: verify via getmac utility
def verify_with_getmac():
    try:
        proc = subprocess.run(['getmac'], capture_output=True, text=True, timeout=3)
        out = (proc.stdout or proc.stderr or "").strip()
        m = re.search(r'([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5})', out)
        if m:
            return m.group(1).lower()
    except Exception as e:
        logger.debug(f"verify_with_getmac failed: {e}")
    return None

def check_internet(timeout=10):
    try:
        # Use -c 1 for one packet, -W for timeout in milliseconds
        result = subprocess.run(
            ["ping", "-c", "1", "-W", "1000", "8.8.8.8"],
            capture_output=True, text=True, timeout=timeout
        )
        return result.returncode == 0
    except Exception:
        return False

def init_bypass(sub_name, restart_adapters=True):
    op_adapter_name = sub_name  # On macOS, sub_name is the interface name
    adapter_desc = get_adapter_name(op_adapter_name, op_adapter_name)

    print(f"\033[94m[DEBUG] Starting bypass process for adapter: {op_adapter_name} (Description: {adapter_desc})\033[0m")
    
    start_time = time.time()

    for attempt in range(3):
        try:
            # Step 1: Ensure device exists (like ensureDeviceExists in script)
            ensure_device_exists(op_adapter_name)
            
            # Step 2: Get current MAC before change (like currentMac in script)
            old_mac = current_mac(op_adapter_name)
            if not old_mac:
                print(f"\033[91m[ERROR] Could not determine current MAC address for {op_adapter_name}\033[0m")
                continue
                
            print(f"\033[94m[DEBUG] Current MAC before change: {old_mac}\033[0m")
            
            # Step 3: Generate new MAC (like generateMac in script)
            new_mac_raw, instruction = rand0m_hex()
            new_mac_formatted = ':'.join(new_mac_raw[i:i+2] for i in range(0, 12, 2))
            print(f"\033[94m[DEBUG] Generated random MAC: {new_mac_raw} using {instruction}\033[0m")
            
            # Step 4: Warn about multicast (like warnMulticast in script)
            warn_multicast(new_mac_formatted)
            
            # Step 5: Set MAC using exact script logic (like setMac in script)
            iface_type = get_type(op_adapter_name)
            print(f"\033[94m[DEBUG] Interface type: {iface_type}\033[0m")
            
            if iface_type == "Wi-Fi":
                print(f"\033[94m[DEBUG] Type of interface is Wi-Fi. Will disassociate from any network.\033[0m")
                airport_path = "/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport"
                subprocess.run([airport_path, "-z"], check=False, capture_output=True, text=True)
            
            # Execute ifconfig set (core of setMac function)
            print(f"\033[94m[DEBUG] Setting MAC to {new_mac_formatted} via ifconfig...\033[0m")
            proc = subprocess.run(['ifconfig', op_adapter_name, 'ether', new_mac_formatted], 
                                capture_output=True, text=True)
            
            if proc.returncode != 0:
                stderr = (proc.stderr or proc.stdout or "").strip()
                print(f"\033[91m[ERROR] ifconfig command failed: {stderr}\033[0m")
                raise subprocess.CalledProcessError(returncode=proc.returncode, cmd=proc.args, stderr=stderr)
            
            # For Wi-Fi, run networksetup -detectnewhardware (as in script)
            if iface_type == "Wi-Fi":
                print(f"\033[94m[DEBUG] Running networksetup -detectnewhardware for Wi-Fi\033[0m")
                subprocess.run(["networksetup", "-detectnewhardware"], check=False, capture_output=True, text=True)
            
            # Step 6: Verify by checking current MAC (like script verification)
            current_mac_after = current_mac(op_adapter_name)
            if not current_mac_after:
                print(f"\033[91m[ERROR] Could not verify MAC address after change\033[0m")
                continue
                
            # Script logic: if old == current, then change failed
            if old_mac.lower() == current_mac_after.lower():
                print(f"\033[91m[ERROR] MAC address did not change. Old: {old_mac}, Current: {current_mac_after}\033[0m")
                print(f"\033[91m[ERROR] Can't set MAC address on this device. Ensure the driver supports changing the MAC address.\033[0m")
                continue
            
            # Success - print results like the script
            end_time = time.time()
            total_duration = end_time - start_time
            
            # Get permanent MAC for display
            permanent_mac = get_permanent(adapter_desc)
            
            print(f"\033[92m[SUCCESS] MAC address successfully changed in {total_duration:.2f} seconds.\033[0m")
            print(f"\033[92m[SUCCESS] Permanent MAC address: {permanent_mac or 'Unknown'}\033[0m")
            print(f"\033[92m[SUCCESS] Old MAC address: {old_mac}\033[0m")
            print(f"\033[92m[SUCCESS] New MAC address: {current_mac_after}\033[0m")
            
            return new_mac_raw

        except FileNotFoundError as e:
            print(f"\033[91m[ERROR] Attempt {attempt+1}: {str(e)}\033[0m")
            time.sleep(1)
        except PermissionError:
            print("\033[91m[ERROR] Permission denied. Please run the application with sudo.\033[0m")
            return None  # Exit on permission error
        except subprocess.CalledProcessError as e:
            stderr = getattr(e, 'stderr', None)
            if isinstance(stderr, (bytes, bytearray)):
                stderr = stderr.decode(errors='ignore')
            print(f"\033[91m[ERROR] Attempt {attempt+1}: Command failed: {stderr or str(e)}\033[0m")
            time.sleep(1)
        except Exception as e:
            print(f"\033[91m[ERROR] Attempt {attempt+1}: An unexpected error occurred: {str(e)}\033[0m")
            time.sleep(1)
    
    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"\033[91m[ERROR] All MAC change attempts failed. Total time: {elapsed_time:.2f} seconds\033[0m")
    return None
