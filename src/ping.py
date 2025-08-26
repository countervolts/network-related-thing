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

try:
    # Scapy for fast ARP sweep (much faster than per-IP ping)
    from scapy.all import ARP, Ether, srp, conf  # type: ignore
    _SCAPY_AVAILABLE = True
except Exception:
    _SCAPY_AVAILABLE = False

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
    "unknown": 0,
    "netbios": 0
}

@lru_cache(maxsize=128)
def get_hostname_dns_only(ip):
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        hostname_counters["gethostbyaddr"] += 1
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        hostname_counters["unknown"] += 1
        return 'Unknown'

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

def arp_scan(subnet):
    base_ip = '.'.join(subnet.split('.')[:3])
    ips_to_scan = [f"{base_ip}.{i}" for i in range(1, 255)]
    online_hosts = []

    # Use a thread pool to send pings in parallel to populate the ARP cache
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        # We don't need the result, just to send the packets
        list(executor.map(ping, ips_to_scan))

    # Give a moment for the ARP cache to update
    time.sleep(2)

    # Now read the system's ARP table
    try:
        result = subprocess.run(['arp', '-a'], capture_output=True, text=True, check=True)
        lines = result.stdout.splitlines()
        for line in lines:
            line = line.strip()
            if not line or "Interface" in line or "Internet" in line:
                continue
            
            parts = line.split()
            if len(parts) >= 2 and parts[0].startswith(base_ip):
                online_hosts.append(parts[0])

    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"\033[91m[ERROR] Could not execute 'arp -a': {e}. ARP scan may be incomplete.\033[0m")

    return list(set(online_hosts)) # Return unique IPs

def _select_iface_for_subnet(subnet):
    try:
        if not netifaces:
            return None
        base_ip = '.'.join(subnet.split('.')[:3]) + '.'
        for iface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
            for a in addrs:
                ip = a.get('addr', '')
                if ip and ip.startswith(base_ip):
                    return iface
    except Exception:
        pass
    return None

def _read_arp_table_map(base_prefix):
    ip_mac = {}
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(['arp', '-a'], capture_output=True, text=True, check=True)
            for line in result.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 2 and parts[0].startswith(base_prefix):
                    ip = parts[0]
                    mac = parts[1].replace('-', ':').lower()
                    ip_mac[ip] = mac
        else:
            # Prefer `ip neigh` if available for more reliable parsing
            try:
                result = subprocess.run(['ip', 'neigh'], capture_output=True, text=True, check=True)
                for line in result.stdout.splitlines():
                    parts = line.split()
                    if len(parts) >= 5:
                        ip = parts[0]
                        if ip.startswith(base_prefix) and 'lladdr' in parts:
                            mac = parts[parts.index('lladdr') + 1].lower()
                            ip_mac[ip] = mac
            except Exception:
                result = subprocess.run(['arp', '-n'], capture_output=True, text=True, check=True)
                for line in result.stdout.splitlines():
                    parts = line.split()
                    # typical: IP HWtype HWaddress Flags Mask Iface
                    if len(parts) >= 3 and parts[0].startswith(base_prefix):
                        ip = parts[0]
                        mac = parts[2].lower()
                        ip_mac[ip] = mac
    except Exception:
        pass
    return ip_mac

# New: fast ARP sweep using Scapy (no per-IP subprocess)
def smart_arp_sweep(subnet, timeout=1.2):
    base_ip = '.'.join(subnet.split('.')[:3])
    pdst = f"{base_ip}.1-254"
    ip_mac = {}

    if not _SCAPY_AVAILABLE:
        # Fallback: use existing ARP scan method (slower)
        ips = arp_scan(subnet)
        return {ip: get_mac_address(ip) for ip in ips}

    try:
        iface = _select_iface_for_subnet(subnet)
        # Reduce Scapy verbosity globally
        try:
            conf.verb = 0
        except Exception:
            pass

        # Broadcast ARP who-has for the whole /24 in one go (bind to iface if resolved)
        kwargs = {"timeout": timeout, "verbose": 0, "retry": 1}
        if iface:
            kwargs["iface"] = iface
        answered, _ = srp(Ether(dst="ff:ff:ff:ff:ff:ff")/ARP(pdst=pdst), **kwargs)
        for _, rcv in answered:
            ip_mac[rcv.psrc] = rcv.hwsrc.lower()
    except Exception:
        ip_mac = {}

    # 1) If Scapy yielded nothing, try parsing existing ARP table (zero cost)
    if not ip_mac:
        table_map = _read_arp_table_map(base_ip + '.')
        if table_map:
            return table_map

    # 2) Last resort: legacy ARP-based discovery (pings + arp -a)
    if not ip_mac:
        ips = arp_scan(subnet)
        ip_mac = {ip: get_mac_address(ip).lower() for ip in ips}

    return ip_mac

# Log the counters after the scan
def log_hostname_counters():
    print("\033[94m[DEBUG] Hostname resolution stats:\033[0m")
    for method, count in hostname_counters.items():
        print(f"  {method}: {count}")

# Cache OUI in-process using file mtime to avoid re-reading on each scan
_OUI_CACHE = {}
_OUI_MTIME = 0

def load_oui_data():
    appdata_location = os.path.join(os.getenv('APPDATA'), "ayosbypasser")
    oui_file = os.path.join(appdata_location, "oui.txt")

    global _OUI_CACHE, _OUI_MTIME
    try:
        mtime = os.path.getmtime(oui_file)
    except Exception:
        _OUI_CACHE = {}
        _OUI_MTIME = 0
        return {}

    if _OUI_CACHE and _OUI_MTIME == mtime:
        return _OUI_CACHE

    def _parse_line(line: str):
        if "(hex)" in line:
            parts = line.split("(hex)")
        elif "(base 16)" in line:
            parts = line.split("(base 16)")
        else:
            return None, None
        oui_raw = parts[0].strip()
        vendor = parts[1].strip()
        oui = oui_raw.replace("-", "").replace(":", "").upper()
        if len(oui) != 6 or any(c not in "0123456789ABCDEF" for c in oui):
            return None, None
        return oui, vendor

    vendors = {}
    if os.path.exists(oui_file):
        # tolerate encoding oddities in the IEEE dump
        with open(oui_file, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                oui, vendor = _parse_line(line)
                if oui and vendor and oui not in vendors:
                    vendors[oui] = vendor

    _OUI_CACHE = vendors
    _OUI_MTIME = mtime
    return vendors

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

# Updated: allow tighter per-host timeout and worker cap
def resolve_hostnames(ips, timeout=1.0, max_workers=50, dns_only=False):
    hostnames = {}
    failed_count = 0

    def resolve(ip):
        nonlocal failed_count
        if dns_only:
            hostname = get_hostname_dns_only(ip)
        else:
            hostname = get_hostname(ip, timeout=timeout)
        if hostname == 'Unknown':
            failed_count += 1
        hostnames[ip] = hostname

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        executor.map(resolve, ips)

    if failed_count > 0:
        print(f"Failed to resolve hostnames for {failed_count} IP addresses.")

    # log_hostname_counters()
    return hostnames

def scan_network(subnet, scan_hostname=False, scan_vendor=False, scanning_method="divide_and_conquer", parallel_scans=True, parallel_multiplier=2):
    start_time = time.time()
    print(f"\033[94m[DEBUG] Scanning with method: {scanning_method}, Parallel scans: {'Enabled' if parallel_scans else 'Disabled'}\033[0m")
    online_devices = []
    local_ips = get_local_ips()
    gateway = get_default_gateway()

    if scanning_method == "hybrid_adaptive":
        print("\033[94m[DEBUG] Starting Hybrid/Adaptive scan.\033[0m")
        online_devices = arp_scan(subnet)
    elif scanning_method == "smart":
        print("\033[94m[DEBUG] Starting SMART scan.\033[0m")
        ip_mac_map = smart_arp_sweep(subnet, timeout=1.2)
        if not ip_mac_map:
            print("\033[93m[WARN] SMART sweep returned no hosts. Falling back to Divide and Conquer.\033[0m")
            return scan_network(
                subnet=subnet,
                scan_hostname=scan_hostname,
                scan_vendor=scan_vendor,
                scanning_method="divide_and_conquer",
                parallel_scans=parallel_scans,
                parallel_multiplier=parallel_multiplier
            )

        online_devices = sorted(ip_mac_map.keys(), key=lambda ip: tuple(map(int, ip.split('.'))))

        # Prepare hostname/vendor with minimal overhead
        hostnames = {}
        vendors = {}
        if scan_hostname and online_devices:
            hostnames = resolve_hostnames(online_devices, timeout=0.25, max_workers=50, dns_only=True)
        if scan_vendor and online_devices:
            oui_dict = load_oui_data()  # now cached by mtime
            for ip, mac in ip_mac_map.items():
                vendors[ip] = get_vendor(mac, oui_dict)

        # Build results using ARP-provided MACs (no per-IP mac lookup)
        results = []
        for ip in online_devices:
            mac = ip_mac_map.get(ip) or 'Unknown'
            device_info = {
                'ip': ip,
                'mac': mac,
                'hostname': hostnames.get(ip, 'Unknown') if scan_hostname else 'Skipped',
                'vendor': vendors.get(ip, 'Unknown') if scan_vendor else 'Skipped',
                'is_local': ip in local_ips,
                'is_gateway': ip == gateway,
                'timestamp': datetime.now().isoformat()
            }
            results.append(device_info)

        # Sort results by IP, push gateway last
        results = sorted(
            results,
            key=lambda d: tuple(map(int, d['ip'].split('.'))) if d['ip'] != gateway else (255, 255, 255, 255)
        )
        end_time = time.time()
        if logger.level <= logging.DEBUG:
            print(f"\033[94m[DEBUG] SMART scan completed in {end_time - start_time:.2f} seconds\033[0m")
        return results
    else:
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