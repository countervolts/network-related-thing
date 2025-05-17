import winreg
import subprocess
import re
import random
import time
import logging
import ctypes
from ctypes import windll, c_void_p, c_ulong

logger = logging.getLogger(__name__)

# Add SystemFunction036 (RtlGenRandom) for hardware-level randomization
try:
    # SystemFunction036 is the internal name for RtlGenRandom
    rtlgenrandom = windll.advapi32.SystemFunction036
    rtlgenrandom.argtypes = [c_void_p, c_ulong]
    rtlgenrandom.restype = ctypes.c_bool
except Exception:
    logger.warning("Could not load SystemFunction036, falling back to software randomization")
    rtlgenrandom = None

IGNORE_LIST = [
    "Hyper-V Virtual Ethernet Adapter",
    "VirtualBox Host-Only Ethernet Adapter",
    "VMware Virtual Ethernet Adapter",
    "Microsoft Wi-Fi Direct Virtual Adapter",
    "Microsoft Hosted Network Virtual Adapter",
    "Cisco AnyConnect Virtual Adapter",
    "NordVPN Network Adapter",
    "ExpressVPN Tunnel Adapter",
    "WSL Virtual Ethernet Adapter",
    "Remote NDIS based Internet Sharing Device",
    "Bluetooth Device (Personal Area Network)",
    "Microsoft Wi-Fi Direct Virtual Adapter #2",
    "Parallels Virtual Ethernet Adapter"
]

def transport_names():
    try:
        output = subprocess.check_output(["getmac", "/fo", "table", "/nh"], 
                                       universal_newlines=True,
                                       timeout=15)
        transport_names = re.findall(r'(\{[\w-]+\})', output)
        driver_descriptions = []
        mp_transport = None

        key_path = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            subkey_index = 0
            while True:
                try:
                    sub_name = winreg.EnumKey(key, subkey_index)
                    with winreg.OpenKey(key, sub_name) as subkey:
                        try:
                            net_cfg_id = winreg.QueryValueEx(subkey, 'NetCfgInstanceId')[0]
                            if net_cfg_id in transport_names:
                                driver_desc = winreg.QueryValueEx(subkey, "DriverDesc")[0]
                                driver_descriptions.append(driver_desc)
                                if not mp_transport and driver_desc not in IGNORE_LIST:
                                    mp_transport = net_cfg_id
                        except FileNotFoundError:
                            pass
                    subkey_index += 1
                except OSError:
                    break
        return transport_names, driver_descriptions, mp_transport
    except Exception as e:
        logger.error(f"Error getting transport names: {str(e)}")
        return [], [], None

def neftcfg_search(transport_name):
    found_instances = []
    key_path = r"SYSTEM\ControlSet001\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            subkey_index = 0
            while True:
                try:
                    sub_name = winreg.EnumKey(key, subkey_index)
                    with winreg.OpenKey(key, sub_name) as subkey:
                        try:
                            value = winreg.QueryValueEx(subkey, 'NetCfgInstanceId')[0]
                            if value == transport_name:
                                found_instances.append((value, sub_name))
                        except FileNotFoundError:
                            pass
                    subkey_index += 1
                except OSError:
                    break
    except Exception as e:
        logger.error(f"Registry search failed: {str(e)}")
    return found_instances

def get_active_network_adapter():
    try:
        result = subprocess.run(
            ["netsh", "interface", "show", "interface"],
            capture_output=True,
            text=True,
            check=True
        )
        output = result.stdout

        for line in output.splitlines():
            if "Connected" in line:
                parts = line.split()
                adapter_type = parts[2]
                adapter_name = " ".join(parts[3:])
                if adapter_type.lower() in ["dedicated", "wired"]:
                    return "Ethernet", adapter_name
                elif adapter_type.lower() == "wireless":
                    return "Wi-Fi", adapter_name
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to determine active network adapter: {e}")
    return None, None

def restart_all_adapters(target_ip=None):
    try:
        result = subprocess.run(
            ["netsh", "interface", "show", "interface"],
            capture_output=True,
            text=True,
            check=True
        )
        output = result.stdout
        adapter_names = []
        for line in output.splitlines():
            if "Enabled" in line or "Connected" in line or "Disconnected" in line:
                parts = line.split()
                adapter_name = " ".join(parts[3:])
                if not any(virtual in adapter_name.lower() for virtual in ["vethernet", "vwifi", "virtual"]):
                    adapter_names.append(adapter_name)

        if not adapter_names:
            logger.error("No physical network adapters found.")
            return False

        target_subnet = ".".join(target_ip.split(".")[:3]) if target_ip else None

        for adapter_name in adapter_names:
            ip_result = subprocess.run(
                ["netsh", "interface", "ip", "show", "addresses", adapter_name],
                capture_output=True,
                text=True,
                check=True
            )
            ip_output = ip_result.stdout
            adapter_ip = None
            for line in ip_output.splitlines():
                if "IP Address" in line:
                    adapter_ip = line.split(":")[1].strip()
                    break

            if target_ip and adapter_ip and ".".join(adapter_ip.split(".")[:3]) != target_subnet:
                logger.info(f"Skipping adapter: {adapter_name} (IP: {adapter_ip})")
                continue

            logger.info(f"Disabling adapter: {adapter_name} (IP: {adapter_ip})")
            subprocess.run(
                ["netsh", "interface", "set", "interface", adapter_name, "admin=disable"],
                check=True
            )
            time.sleep(0.5)

            logger.info(f"Enabling adapter: {adapter_name} (IP: {adapter_ip})")
            subprocess.run(
                ["netsh", "interface", "set", "interface", adapter_name, "admin=enable"],
                check=True
            )
            time.sleep(0.5)

        logger.info("Successfully restarted all physical network adapters.")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to restart network adapters: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error while restarting network adapters: {e}")
        return False

def get_hardware_random_bytes(length):
    try:
        if rtlgenrandom:
            buffer = ctypes.create_string_buffer(length)
                
            if rtlgenrandom(buffer, length):
                return buffer.raw, "Hardware RNG (SystemFunction036)"
    except Exception as e:
        logger.warning(f"Hardware randomization failed: {e}")
    
    # Fall back to software RNG
    return random.randbytes(length), "Software random.randbytes (fallback)"

def rand0m_hex(mode='standard', use_hardware_rng=True):
    if mode == 'Tmac':
        if use_hardware_rng:
            # Use hardware RNG for Tmac mode
            random_bytes, instruction = get_hardware_random_bytes(5)  # 5 bytes for the last part
            return '02' + ''.join(format(b, '02x') for b in random_bytes), instruction
        else:
            return '02' + ''.join(random.choices('0123456789ABCDEF', k=10)), "Software random.choices"
    elif mode == 'randomized':
        # Get random bytes with hardware RNG if requested
        if use_hardware_rng:
            random_bytes, instruction = get_hardware_random_bytes(6)  # 6 bytes for MAC
        else:
            random_bytes = random.randbytes(6)
            instruction = "Software random.randbytes"
        
        # Convert bytes to hex list
        hex_values = [format(b, '02x') for b in random_bytes]
        
        # ENHANCED: Ensure the first byte follows the LAA unicast pattern
        # Bit 0 (LSB) must be 0 (unicast)
        # Bit 1 must be 1 (locally administered)
        first_byte = int(hex_values[0], 16)
        # Clear bit 0 (unicast) and set bit 1 (locally administered)
        first_byte = (first_byte & 0xFE) | 0x02  
        
        # Double-check our bit manipulation worked correctly
        if not (first_byte & 0x01 == 0 and first_byte & 0x02 == 0x02):
            # If somehow the bit manipulation failed, force the correct pattern
            first_byte = (first_byte & 0xFC) | 0x02 
        
        hex_values[0] = format(first_byte, '02x')
        
        mac = ''.join(hex_values)
        print(f"\033[94m[DEBUG] Generated MAC: {mac}, First byte: {hex_values[0]}, Binary: {bin(first_byte)[2:].zfill(8)}\033[0m")
        
        return mac, instruction
    else:  # standard
        if use_hardware_rng:
            # Use hardware RNG for standard mode
            random_bytes, instruction = get_hardware_random_bytes(5)  # 5 bytes for the last part
            return 'DE' + ''.join(format(b, '02x') for b in random_bytes), instruction
        else:
            return 'DE' + ''.join(random.choices('0123456789ABCDEF', k=10)), "Software random.choices"

def get_adapter_name(sub_name):
    key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{sub_name}"
    for attempt in range(3):
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                return winreg.QueryValueEx(key, "DriverDesc")[0]
        except Exception as e:
            logger.warning(f"Registry access failed (attempt {attempt+1}/3): {str(e)}")
            time.sleep(1)
    logger.error("Failed to retrieve adapter name after 3 attempts")
    return None

def init_bypass(sub_name, mac_mode='standard', use_hardware_rng=True):
    key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{sub_name}"
    adapter_name = get_adapter_name(sub_name)
    
    if not adapter_name:
        print("\033[94m[DEBUG] [ERROR] Could not retrieve adapter name\033[0m")
        return None

    print(f"\033[94m[DEBUG] Starting bypass process for adapter: {adapter_name}\033[0m")
    print(f"\033[94m[DEBUG] Using {'hardware' if use_hardware_rng else 'software'} randomization\033[0m")
    start_time = time.time()  # Start timing

    for attempt in range(3):
        if mac_mode == 'Tmac':
            new_mac, instruction = rand0m_hex(mode='Tmac', use_hardware_rng=use_hardware_rng)
            print(f"\033[94m[DEBUG] Generated Tmac MAC: {new_mac} using {instruction}\033[0m")
        elif mac_mode == 'randomized':
            new_mac, instruction = rand0m_hex(mode='randomized', use_hardware_rng=use_hardware_rng)
            print(f"\033[94m[DEBUG] Generated unicast LAA MAC: {new_mac} using {instruction}\033[0m")
        else:
            new_mac, instruction = rand0m_hex(mode='standard', use_hardware_rng=use_hardware_rng)
            print(f"\033[94m[DEBUG] Generated standard MAC: {new_mac} using {instruction}\033[0m")
        
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_ALL_ACCESS) as key:
                winreg.SetValueEx(key, 'NetworkAddress', 0, winreg.REG_SZ, new_mac)
                print(f"\033[94m[DEBUG] Attempt {attempt+1}: Updated registry with new MAC: {new_mac}\033[0m")
                
                if restart_all_adapters():
                    end_time = time.time()  # End timing
                    elapsed_time = end_time - start_time
                    print(f"\033[94m[DEBUG] Attempt {attempt+1}: Successfully bypassed MAC address for adapter: {adapter_name}\033[0m")
                    print(f"\033[94m[DEBUG] MAC address changed successfully to {new_mac}\033[0m")
                    print(f"\033[94m[DEBUG] Bypass process completed in {elapsed_time:.2f} seconds\033[0m")
                    time.sleep(5)
                    return new_mac
                
                print(f"\033[94m[DEBUG] Attempt {attempt+1}: MAC change failed for adapter: {adapter_name}\033[0m")
                time.sleep(2)
                
        except PermissionError:
            print("\033[94m[DEBUG] [ERROR] Permission denied - run as administrator\033[0m")
            break
        except Exception as e:
            print(f"\033[94m[DEBUG] Attempt {attempt+1}: Registry update failed: {str(e)}\033[0m")
            time.sleep(1)
    
    end_time = time.time()  # End timing
    elapsed_time = end_time - start_time
    print(f"\033[94m[DEBUG] [ERROR] All MAC change attempts failed. Total time: {elapsed_time:.2f} seconds\033[0m")
    return None