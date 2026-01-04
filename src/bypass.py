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
    "Parallels Virtual Ethernet Adapter",
    "Famatech Radmin VPN Ethernet Adapter"
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

def restart_all_adapters(adapter_name=None):
    try:
        if adapter_name:
            # Attempt to set Speed & Duplex to 1.0 Gbps Full Duplex to reduce negotiation time
            try:
                print(f"\033[94m[DEBUG] Setting '{adapter_name}' to 1.0 Gbps Full Duplex for faster negotiation.\033[0m")
                set_speed_command = f"Set-NetAdapterAdvancedProperty -Name '{adapter_name}' -DisplayName 'Speed & Duplex' -DisplayValue '1.0 Gbps Full Duplex' -NoRestart"
                subprocess.run(
                    ["powershell", "-Command", set_speed_command],
                    check=True, capture_output=True, text=True, timeout=5
                )
            except subprocess.CalledProcessError as e:
                # This is not a critical error, as not all adapters have this property.
                print(f"\033[93m[WARN] Could not set 'Speed & Duplex' for {adapter_name}. This may be normal. Error: {e.stderr.strip()}\033[0m")
            except Exception as e:
                print(f"\033[93m[WARN] An unexpected error occurred while setting 'Speed & Duplex': {e}\033[0m")

            # Perform the soft restart
            command = f"Restart-NetAdapter -Name '{adapter_name}' -Confirm:$false"
            logger.info(f"Performing soft restart for adapter: {adapter_name}")
        else:
            command = "Get-NetAdapter -Physical | Restart-NetAdapter -Confirm:$false"
            logger.info("Performing soft restart for all physical network adapters.")

        subprocess.run(
            ["powershell", "-Command", command],
            check=True,
            capture_output=True,
            text=True
        )
        
        time.sleep(0.2 if adapter_name else 0.5)
        
        logger.info(f"Successfully requested restart for {'adapter ' + adapter_name if adapter_name else 'all physical adapters'}.")
        return True
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to restart network adapters using PowerShell: {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error while restarting network adapters: {e}")
        return False

def disable_enable_adapter(adapter_name):
    try:
        print(f"\033[94m[DEBUG] Disabling adapter: {adapter_name}\033[0m")
        result_disable = subprocess.run(
            ["netsh", "interface", "set", "interface", "name=" + adapter_name, "admin=disable"],
            capture_output=True, text=True, timeout=15
        )
        print(f"Disable stdout: {result_disable.stdout}")
        print(f"Disable stderr: {result_disable.stderr}")
        if result_disable.returncode != 0:
            print(f"\033[91m[ERROR] Failed to disable adapter, return code: {result_disable.returncode}\033[0m")
            return False

        time.sleep(1)

        print(f"\033[94m[DEBUG] Enabling adapter: {adapter_name}\033[0m")
        result_enable = subprocess.run(
            ["netsh", "interface", "set", "interface", "name=" + adapter_name, "admin=enable"],
            capture_output=True, text=True, timeout=15
        )
        print(f"Enable stdout: {result_enable.stdout}")
        print(f"Enable stderr: {result_enable.stderr}")
        if result_enable.returncode != 0:
            print(f"\033[91m[ERROR] Failed to enable adapter, return code: {result_enable.returncode}\033[0m")
            return False

        time.sleep(2)
        print(f"\033[92m[INFO] Successfully cycled adapter state for: {adapter_name}\033[0m")
        return True

    except subprocess.CalledProcessError as e:
        print(f"\033[91m[ERROR] CalledProcessError while cycling adapter {adapter_name}: {e}\033[0m")
        return False
    except Exception as e:
        print(f"\033[91m[ERROR] Unexpected error while cycling adapter {adapter_name}: {e}\033[0m")
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

def get_adapter_ip(adapter_name):
    try:
        # Use netsh to get IP configuration for the specific adapter
        result = subprocess.run(
            ["netsh", "interface", "ip", "show", "addresses", f'name="{adapter_name}"'],
            capture_output=True, text=True, check=False, timeout=2
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if "IP Address:" in line:
                    ip_address = line.split(":")[1].strip()
                    # Check for a valid, non-APIPA address
                    if ip_address and not ip_address.startswith("169.254.") and ip_address != "0.0.0.0":
                        return ip_address
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
        return None # Expected if adapter is down or command fails
    except Exception as e:
        logger.error(f"Error getting IP for adapter {adapter_name}: {e}")
    return None

def get_transport_guid(sub_name):
    key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{sub_name}"
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            return winreg.QueryValueEx(key, 'NetCfgInstanceId')[0]
    except Exception as e:
        logger.error(f"Failed to get transport GUID for sub_name {sub_name}: {e}")
        return None

def get_ps_name_from_guid(guid):
    if not guid:
        return None
    try:
        # Use WMI which is often more reliable for getting the connection name (e.g., "Ethernet 4")
        command = f"(Get-WmiObject Win32_NetworkAdapter | Where-Object {{ $_.GUID -eq '{guid}' }}).NetConnectionID"
        result = subprocess.run(
            ["powershell", "-Command", command],
            check=True, capture_output=True, text=True, timeout=5
        )
        ps_name = result.stdout.strip()
        if ps_name:
            print(f"\033[94m[DEBUG] Mapped GUID '{guid}' to PowerShell name '{ps_name}' via WMI.\033[0m")
            return ps_name
        return None
    except Exception as e:
        # This can fail if the adapter is in a weird state.
        print(f"\033[93m[WARN] Could not map GUID to PowerShell name via WMI: {e}\033[0m")
        return None

def get_ps_name_from_guid_registry(guid):
    if not guid:
        return None
    try:
        # This registry key directly maps the adapter's GUID to its connection name (e.g., "Ethernet 4")
        key_path = f"SYSTEM\\CurrentControlSet\\Control\\Network\\{{4D36E972-E325-11CE-BFC1-08002BE10318}}\\{guid}\\Connection"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            ps_name = winreg.QueryValueEx(key, "Name")[0]
            if ps_name:
                print(f"\033[94m[DEBUG] Mapped GUID '{guid}' to PowerShell name '{ps_name}' via registry.\033[0m")
                return ps_name
    except FileNotFoundError:
        # This is an expected failure if the key doesn't exist for some reason.
        return None
    except Exception as e:
        print(f"\033[93m[WARN] Could not map GUID to PowerShell name via registry: {e}\033[0m")
    return None

def get_ps_name_from_description(description):
    try:
        ps_cmd = (
            f"Get-NetAdapter | Where-Object {{$_.InterfaceDescription -eq '{description}'}} | "
            "Select-Object -ExpandProperty Name"
        )
        result = subprocess.run(
            ["powershell", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            check=True,
            timeout=5
        )
        ps_name = result.stdout.strip()
        if ps_name:
            print(f"\033[94m[DEBUG] Mapped Description '{description}' to PowerShell name '{ps_name}'.\033[0m")
            return ps_name
        return None
    except Exception as e:
        print(f"\033[93m[WARN] Could not map Description to PowerShell name: {e}\033[0m")
        return None

def check_internet(timeout=10):
    try:
        result = subprocess.run(
            ["ping", "-n", "1", "-w", "1000", "8.8.8.8"],  # 1 ping, 1s timeout
            capture_output=True, text=True
        )
        return result.returncode == 0
    except Exception:
        return False

def init_bypass(sub_name, mac_mode='standard', use_hardware_rng=True, restart_adapters=True, manual_mac=None):
    key_path = f"SYSTEM\\ControlSet001\\Control\\Class\\{{4d36e972-e325-11ce-bfc1-08002be10318}}\\{sub_name}"
    
    # Get adapter description for logging/display purposes
    adapter_desc = get_adapter_name(sub_name)
    if not adapter_desc:
        print("\033[91m[ERROR] Could not retrieve adapter description from registry.\033[0m")
        return None

    # Always try to find the correct interface name (e.g., "Ethernet 4") for both PowerShell and netsh.
    interface_name = None
    transport_guid = get_transport_guid(sub_name)

    # Method 1: Direct registry lookup (fastest and most reliable)
    if transport_guid:
        interface_name = get_ps_name_from_guid_registry(transport_guid)

    # Method 2: PowerShell/WMI GUID lookup (first fallback)
    if not interface_name and transport_guid:
        print(f"\033[93m[WARN] Direct registry lookup failed. Trying PowerShell/WMI GUID lookup...\033[0m")
        interface_name = get_ps_name_from_guid(transport_guid)

    # Method 3: PowerShell description lookup (second fallback)
    if not interface_name:
        print(f"\033[93m[WARN] GUID/Registry to Interface Name mapping failed. Trying description-based lookup...\033[0m")
        interface_name = get_ps_name_from_description(adapter_desc)

    # If all methods fail, we cannot proceed reliably with either method.
    if not interface_name:
        print(f"\033[91m[FATAL] Bypass failed: Could not determine the correct interface name (e.g. 'Ethernet 4') for the adapter '{adapter_desc}'.\033[0m")
        print(f"\033[91m[FATAL] Both accelerated (PowerShell) and normal (netsh) bypass methods require this name to function reliably.\033[0m")
        return None
    
    # Use the discovered interface name for all operations.
    op_adapter_name = interface_name

    print(f"\033[94m[DEBUG] Starting bypass process for adapter: {op_adapter_name} (Description: {adapter_desc})\033[0m")
    print(f"\033[94m[DEBUG] Using {'hardware' if use_hardware_rng else 'software'} randomization\033[0m")
    start_time = time.time()  # Start timing

    for attempt in range(3):
        if mac_mode == 'manual':
            if not manual_mac:
                print(f"\033[91m[FATAL] Manual mode selected but no MAC address was provided.\033[0m")
                return None
            new_mac = manual_mac.replace("-", "").replace(":", "")
            print(f"\033[94m[DEBUG] Using user-provided manual MAC: {new_mac}\033[0m")
        elif mac_mode == 'Tmac':
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
                
                registry_update_time = time.time()

                if restart_adapters:
                    if restart_all_adapters(adapter_name=op_adapter_name):
                        print(f"\033[94m[DEBUG] Adapter '{op_adapter_name}' restarted. Forcing IP renewal and polling for new IP...\033[0m")
                        
                        # Force an immediate IP renewal
                        try:
                            subprocess.run(
                                ["ipconfig", "/renew", op_adapter_name],
                                check=False, capture_output=True, text=True, timeout=15
                            )
                        except (subprocess.TimeoutExpired, Exception):
                            print(f"\033[93m[WARN] 'ipconfig /renew' command timed out or failed. This is often normal.\033[0m")

                        poll_start_time = time.time()
                        ip_acquired = False
                        internet_ready = False
                        
                        # First wait for a valid IP
                        while time.time() - poll_start_time < 10:
                            current_ip = get_adapter_ip(adapter_name=op_adapter_name)
                            if current_ip:
                                print(f"\033[92m[INFO] New IP address {current_ip} acquired for '{op_adapter_name}'.\033[0m")
                                ip_acquired = True
                                break
                            time.sleep(0.5)
                        
                        # Now confirm internet connectivity (up to another 10 seconds)
                        if ip_acquired:
                            internet_start_time = time.time()
                            while time.time() - internet_start_time < 10:
                                if check_internet():
                                    internet_ready = True
                                    break
                                time.sleep(1)
                        
                        # Timing breakdown
                        end_time = time.time()
                        reg_duration = registry_update_time - start_time
                        restart_duration = end_time - registry_update_time
                        total_duration = end_time - start_time
                        
                        print(f"\n\033[94m[TIMER] Registry Update: {reg_duration:.4f}s\033[0m")
                        print(f"\033[94m[TIMER] Adapter Restart + IP + Internet: {restart_duration:.4f}s\033[0m")
                        
                        if internet_ready:
                            print(f"\033[92m[SUCCESS] Internet is up. Full bypass completed in {total_duration:.2f} seconds.\033[0m")
                        else:
                            print(f"\033[93m[WARN] No internet confirmed within timeout. Total time: {total_duration:.2f} seconds.\033[0m")
                        
                        print(f"\033[94m[DEBUG] MAC address changed successfully to {new_mac}\033[0m")
                        return new_mac
                else:
                    # Normal bypass: cycle the adapter using netsh to apply the change
                    if disable_enable_adapter(op_adapter_name):
                        poll_start_time = time.time()
                        ip_acquired = False
                        internet_ready = False
                        
                        # First wait for a valid IP
                        while time.time() - poll_start_time < 10:
                            current_ip = get_adapter_ip(adapter_name=op_adapter_name)
                            if current_ip:
                                print(f"\033[92m[INFO] New IP address {current_ip} acquired for '{op_adapter_name}'.\033[0m")
                                ip_acquired = True
                                break
                            time.sleep(0.5)
                        
                        # Now confirm internet connectivity (up to another 10 seconds)
                        if ip_acquired:
                            internet_start_time = time.time()
                            while time.time() - internet_start_time < 10:
                                if check_internet():
                                    internet_ready = True
                                    break
                                time.sleep(1)

                        end_time = time.time()
                        reg_duration = registry_update_time - start_time
                        restart_duration = end_time - registry_update_time
                        total_duration = end_time - start_time

                        print(f"\n\033[94m[TIMER] Registry Update: {reg_duration:.4f}s\033[0m")
                        print(f"\033[94m[TIMER] Adapter Cycle + IP + Internet: {restart_duration:.4f}s\033[0m")
                        
                        if internet_ready:
                            print(f"\033[92m[SUCCESS] Internet is up. Normal bypass completed in {total_duration:.2f} seconds.\033[0m")
                        else:
                            print(f"\033[93m[WARN] No internet confirmed. Normal bypass completed in {total_duration:.2f} seconds.\033[0m")

                        print(f"\033[94m[DEBUG] MAC address changed successfully to {new_mac}\033[0m")
                        return new_mac
                    else:
                        print(f"\033[91m[ERROR] Attempt {attempt+1}: Adapter cycle failed for {op_adapter_name}.\033[0m")
                
                print(f"\033[91m[ERROR] Attempt {attempt+1}: MAC change failed for adapter: {op_adapter_name}\033[0m")
                time.sleep(1)
                
        except PermissionError:
            print("\033[91m[ERROR] Permission denied - run as administrator\033[0m")
            break
        except Exception as e:
            print(f"\033[91m[ERROR] Attempt {attempt+1}: Registry update failed: {str(e)}\033[0m")
            time.sleep(1)
    
    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"\033[91m[ERROR] All MAC change attempts failed. Total time: {elapsed_time:.2f} seconds\033[0m")
    return None
