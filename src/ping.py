import socket
import subprocess
import platform
import time
import os
from getmac import get_mac_address
import logging
import concurrent.futures
from datetime import datetime
from functools import lru_cache

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import netifaces
except ImportError:
    netifaces = None

def get_local_ips():
    ips = []
    try:
        if netifaces:
            for interface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(interface)
                if netifaces.AF_INET in addrs:
                    for addr_info in addrs[netifaces.AF_INET]:
                        ips.append(addr_info['addr'])
        else:
            ips.append(socket.gethostbyname(socket.gethostname()))
    except Exception:
        pass
    return ips

def get_default_gateway():
    if netifaces:
        gateways = netifaces.gateways()
        return gateways.get('default', {}).get(netifaces.AF_INET, [None])[0]
    return None

def ping(ip):
    param = ['-n', '1', '-w', '500'] if platform.system().lower() == 'windows' else ['-c', '1', '-W', '1']
    try:
        result = subprocess.run(['ping'] + param + [ip], 
                              stdout=subprocess.DEVNULL, 
                              stderr=subprocess.DEVNULL,
                              timeout=2)
        return ip, result.returncode == 0
    except subprocess.TimeoutExpired:
        return ip, False

def get_mac_address(ip):
    try:
        if platform.system() == 'Windows':
            cmd = f"arp -a {ip}"
        else:
            cmd = f"arp -n {ip}"
            
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        output = result.stdout
        
        for line in output.splitlines():
            if ip in line:
                parts = line.split()
                if platform.system() == 'Windows':
                    if len(parts) >= 3 and '-' in parts[1]:
                        return parts[1].replace('-', ':')
                else:
                    if len(parts) >= 3 and ':' in parts[2]:
                        return parts[2]
        return 'Not Found'
    except Exception:
        return 'Unknown'

hostname_counters = {
    "gethostbyaddr": 0,
    "unknown": 0
}

@lru_cache(maxsize=128)
def get_hostname(ip, timeout=1):
    global hostname_counters
    # 1. Standard DNS Lookup (Reverse PTR)
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        hostname_counters["gethostbyaddr"] += 1
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        pass # Failed, try next method

    # 2. NetBIOS Name Query (more effective on local networks)
    try:
        # Construct NetBIOS Name Service request
        # Transaction ID (2 bytes), Flags (2 bytes), Questions (2 bytes), etc.
        trans_id = os.urandom(2)
        query = trans_id + b'\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00'
        # Name to query: '*' (encoded) + null terminator
        query += b'\x20\x43\x4b\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x00'
        # Query Type: NBSTAT (33), Query Class: IN (1)
        query += b'\x00\x21\x00\x01'

        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(timeout)
            s.sendto(query, (ip, 137))
            data, _ = s.recvfrom(1024)
            
            # The name is in the response after a certain offset
            # This is a simplified parser for the most common response format
            if len(data) > 56:
                # Find the first name in the list of names
                name_bytes = data[57:72].strip()
                hostname = name_bytes.decode('latin-1', errors='ignore').strip()
                if hostname:
                    hostname_counters["netbios"] += 1
                    return hostname
    except (socket.timeout, ConnectionResetError, OSError):
        pass # Failed, move on

    # If all methods failed
    hostname_counters["unknown"] += 1
    return 'Unknown'

# Log the counters after the scan
def log_hostname_counters():
    print("\033[94m[DEBUG] Hostname resolution stats:\033[0m")
    for method, count in hostname_counters.items():
        print(f"  {method}: {count}")

def load_oui_data():
    appdata_location = os.path.join(os.getenv('APPDATA'), "ayosbypasser")
    oui_file = os.path.join(appdata_location, "oui.txt")
    
    oui_dict = {}
    if os.path.exists(oui_file):
        with open(oui_file, 'r', encoding='utf-8') as f:
            for line in f:
                if '(base 16)' in line:
                    parts = line.split('(base 16)')
                    oui = parts[0].strip().replace('-', '').upper()
                    vendor = parts[1].strip()
                    oui_dict[oui] = vendor
    return oui_dict

def get_vendor(mac, oui_dict):
    if mac in ['Not Found', 'Unknown'] or not mac:
        return 'Unknown'
    oui = mac.replace(':', '')[:6].upper()
    return oui_dict.get(oui, 'Unknown')

def resolve_vendors(ips, oui_dict):
    vendors = {}

    def resolve(ip):
        mac = get_mac_address(ip)
        vendors[ip] = get_vendor(mac, oui_dict)

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        executor.map(resolve, ips)

    return vendors

def resolve_hostnames(ips):
    hostnames = {}
    failed_count = 0

    def resolve(ip):
        nonlocal failed_count
        hostname = get_hostname(ip)
        if hostname == 'Unknown':
            failed_count += 1
        hostnames[ip] = hostname

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        executor.map(resolve, ips)

    if failed_count > 0:
        print(f"Failed to resolve hostnames for {failed_count} IP addresses.")

    # Log the hostname resolution stats
    log_hostname_counters()

    return hostnames

def scan_network(subnet, scan_hostname=False, scan_vendor=False, scanning_method="divide_and_conquer", parallel_scans=True, parallel_multiplier=2):
    start_time = time.time()
    print(f"\033[94m[DEBUG] Scanning with method: {scanning_method}, Parallel scans: {'Enabled' if parallel_scans else 'Disabled'}\033[0m")
    online_devices = []
    local_ips = get_local_ips()
    gateway = get_default_gateway()

    # Get the base IP from the subnet
    base_ip = '.'.join(subnet.split('.')[:3])
    
    # Generate all IP addresses to scan
    ips = [f"{base_ip}.{i}" for i in range(1, 255)]
    
    # Optimize: Prioritize common IP addresses first (gateways, etc.)
    if scanning_method == "divide_and_conquer":
        priority_ips = [f"{base_ip}.1", f"{base_ip}.254"]
        common_ranges = [i for i in range(1, 20)]
        
        # Reorder IPs to check likely candidates first
        for ip_suffix in priority_ips + common_ranges:
            target_ip = f"{base_ip}.{ip_suffix}"
            if target_ip in ips:
                ips.remove(target_ip)
                ips.insert(0, target_ip)
    
    if parallel_scans:
        max_workers = (os.cpu_count() or 4) * parallel_multiplier
        print(f"\033[94m[DEBUG] Starting ping scan with {max_workers} threads.\033[0m")
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_ip = {executor.submit(ping, ip): ip for ip in ips}
            for future in concurrent.futures.as_completed(future_to_ip):
                ip, status = future.result()
                if status:
                    online_devices.append(ip)
    else:
        # Scan sequentially
        for ip in ips:
            _, status = ping(ip)
            if status:
                online_devices.append(ip)
    
    # Resolve hostnames and vendors in parallel
    hostnames = {}
    vendors = {}
    oui_dict = load_oui_data() if scan_vendor else {}

    def resolve_hostname(ip):
        return ip, get_hostname(ip)

    def resolve_vendor(ip):
        mac = get_mac_address(ip)
        return ip, get_vendor(mac, oui_dict)

    if online_devices and (scan_hostname or scan_vendor):
        print(f"\033[94m[DEBUG] Resolving hostnames/vendors with up to 50 threads for {len(online_devices)} devices.\033[0m")
        with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
            if scan_hostname:
                hostname_futures = {executor.submit(resolve_hostname, ip): ip for ip in online_devices}
            if scan_vendor:
                vendor_futures = {executor.submit(resolve_vendor, ip): ip for ip in online_devices}

            if scan_hostname:
                for future in concurrent.futures.as_completed(hostname_futures):
                    ip, hostname = future.result()
                    hostnames[ip] = hostname

            if scan_vendor:
                for future in concurrent.futures.as_completed(vendor_futures):
                    ip, vendor = future.result()
                    vendors[ip] = vendor

    # Build the results
    results = []
    for ip in online_devices:
        mac = get_mac_address(ip)
        hostname = hostnames.get(ip, 'Unknown') if scan_hostname else 'Skipped'
        vendor = vendors.get(ip, 'Unknown') if scan_vendor else 'Skipped'

        device_info = {
            'ip': ip,
            'mac': mac,
            'hostname': hostname,
            'vendor': vendor,
            'is_local': ip in local_ips,
            'is_gateway': ip == gateway,
            'timestamp': datetime.now().isoformat()
        }
        results.append(device_info)

    # Sort results by IP address, ignoring the router's IP
    results = sorted(
        results,
        key=lambda device: tuple(map(int, device['ip'].split('.'))) if device['ip'] != gateway else (255, 255, 255, 255)
    )

    end_time = time.time()
    if logger.level <= logging.DEBUG:
        print(f"\033[94m[DEBUG] Full network scan completed in {end_time - start_time:.2f} seconds\033[0m")

    return results