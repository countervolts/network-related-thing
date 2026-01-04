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
import re
import psutil  # Add this import

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Remove netifaces import and replace with psutil-based functions
try:
    # Scapy for fast ARP sweep (much faster than per-IP ping)
    from scapy.all import ARP, Ether, srp, conf  # type: ignore
    _SCAPY_AVAILABLE = True
except Exception:
    _SCAPY_AVAILABLE = False

def get_local_ips():
    ips = []
    try:
        # Use psutil instead of netifaces
        for interface_name, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    # Filter out non-local network IPs
                    if (ip.startswith('192.168.') or 
                        ip.startswith('10.') or 
                        ip.startswith('172.16.') or ip.startswith('172.17.') or 
                        ip.startswith('172.18.') or ip.startswith('172.19.') or 
                        ip.startswith('172.20.') or ip.startswith('172.21.') or 
                        ip.startswith('172.22.') or ip.startswith('172.23.') or 
                        ip.startswith('172.24.') or ip.startswith('172.25.') or 
                        ip.startswith('172.26.') or ip.startswith('172.27.') or 
                        ip.startswith('172.28.') or ip.startswith('172.29.') or 
                        ip.startswith('172.30.') or ip.startswith('172.31.')):
                        ips.append(ip)
        
        # Fallback if no private IPs found
        if not ips:
            ips.append(socket.gethostbyname(socket.gethostname()))
    except Exception:
        ips.append(socket.gethostbyname(socket.gethostname()))
    return ips

def get_default_gateway():
    # First, try to get gateway based on our local network IPs
    local_ips = get_local_ips()
    if local_ips:
        for local_ip in local_ips:
            # Calculate likely gateway based on local IP
            if local_ip.startswith('192.168.'):
                # For 192.168.x.x networks, gateway is usually 192.168.x.1
                gateway_candidate = '.'.join(local_ip.split('.')[:3]) + '.1'
                # Test if this gateway is reachable
                _, reachable = ping(gateway_candidate)
                if reachable:
                    print(f"\033[94m[DEBUG] Found working gateway via local IP calculation: {gateway_candidate}\033[0m")
                    return gateway_candidate
            elif local_ip.startswith('10.'):
                # For 10.x.x.x networks, try common gateways
                for gateway_suffix in ['.1', '.254']:
                    gateway_candidate = '.'.join(local_ip.split('.')[:3]) + gateway_suffix
                    _, reachable = ping(gateway_candidate)
                    if reachable:
                        print(f"\033[94m[DEBUG] Found working gateway via local IP calculation: {gateway_candidate}\033[0m")
                        return gateway_candidate
            elif local_ip.startswith('172.'):
                # For 172.16-31.x.x networks
                gateway_candidate = '.'.join(local_ip.split('.')[:3]) + '.1'
                _, reachable = ping(gateway_candidate)
                if reachable:
                    print(f"\033[94m[DEBUG] Found working gateway via local IP calculation: {gateway_candidate}\033[0m")
                    return gateway_candidate

    try:
        # Method 1: Parse Windows route table more carefully
        result = subprocess.run(['route', 'print', '0.0.0.0'], 
                              capture_output=True, text=True, check=True)
        
        # Look for the active default route (0.0.0.0 destination)
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            
            # Skip header lines
            if 'Network Destination' in line or 'Destination' in line or '=' in line:
                continue
                
            parts = line.split()
            # Look for default route: 0.0.0.0  0.0.0.0  gateway_ip  interface  metric
            if len(parts) >= 3 and parts[0] == '0.0.0.0' and parts[1] == '0.0.0.0':
                gateway_ip = parts[2]
                # Validate it's a proper IP address and in a private range
                if (gateway_ip != '0.0.0.0' and '.' in gateway_ip and 
                    not gateway_ip.startswith('On-link') and
                    (gateway_ip.startswith('192.168.') or 
                     gateway_ip.startswith('10.') or 
                     gateway_ip.startswith('172.1') or 
                     gateway_ip.startswith('172.2') or 
                     gateway_ip.startswith('172.3'))):
                    try:
                        socket.inet_aton(gateway_ip)
                        print(f"\033[94m[DEBUG] Found gateway via route table: {gateway_ip}\033[0m")
                        return gateway_ip
                    except socket.error:
                        continue
                        
    except Exception as e:
        print(f"\033[93m[WARN] Route table parsing failed: {e}\033[0m")
    
    # Method 3: Fallback to ipconfig
    try:
        result = subprocess.run(['ipconfig', '/all'], 
                              capture_output=True, text=True, check=True)
        for line in result.stdout.splitlines():
            if 'Default Gateway' in line and ':' in line:
                gateway = line.split(':')[-1].strip()
                if (gateway and gateway != '' and '.' in gateway and
                    (gateway.startswith('192.168.') or 
                     gateway.startswith('10.') or 
                     gateway.startswith('172.1') or 
                     gateway.startswith('172.2') or 
                     gateway.startswith('172.3'))):
                    try:
                        socket.inet_aton(gateway)
                        print(f"\033[94m[DEBUG] Found gateway via ipconfig: {gateway}\033[0m")
                        return gateway
                    except socket.error:
                        continue
    except Exception as e:
        print(f"\033[93m[WARN] ipconfig gateway detection failed: {e}\033[0m")
    
    print(f"\033[91m[ERROR] Could not detect default gateway\033[0m")
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
        base_ip = '.'.join(subnet.split('.')[:3]) + '.'
        # Use psutil instead of netifaces
        for interface_name, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    if ip and ip.startswith(base_ip):
                        return interface_name
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
    
    # Add debug info
    debug_network_info()
    
    online_devices = []
    local_ips = get_local_ips()
    gateway = get_default_gateway()
    
    print(f"\033[94m[DEBUG] Starting scan on subnet: {subnet}\033[0m")
    print(f"\033[94m[DEBUG] Local IPs: {local_ips}, Gateway: {gateway}\033[0m")

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
            hostname = hostnames.get(ip, 'Unknown') if scan_hostname else 'Skipped'
            vendor = vendors.get(ip, 'Unknown') if scan_vendor else 'Skipped'
            
            # Detect OS if full scan
            os_info = None
            if scan_hostname and scan_vendor:  # Only during full scans
                os_info = detect_os(ip, mac=mac, hostname=hostname)
                
                # Override vendor to Microsoft if Windows detected with high/medium confidence
                if os_info and 'Windows' in os_info['os'] and os_info['confidence'] in ['high', 'medium']:
                    vendor = 'Microsoft'
            
            device_info = {
                'ip': ip,
                'mac': mac,
                'hostname': hostname,
                'vendor': vendor,
                'is_local': ip in local_ips,
                'is_gateway': ip == gateway,
                'timestamp': datetime.now().isoformat()
            }
            
            # Add OS info if detected
            if os_info:
                device_info['os'] = os_info['os']
                device_info['os_confidence'] = os_info['confidence']
                device_info['os_method'] = os_info.get('method', 'unknown') 
            
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
        
        # Detect OS if full scan
        os_info = None
        if scan_hostname and scan_vendor:  # Only during full scans
            os_info = detect_os(ip, mac=mac, hostname=hostname)
            
            # Override vendor to Microsoft if Windows detected with high/medium confidence
            if os_info and 'Windows' in os_info['os'] and os_info['confidence'] in ['high', 'medium']:
                vendor = 'Microsoft'

        device_info = {
            'ip': ip,
            'mac': mac,
            'hostname': hostname,
            'vendor': vendor,
            'is_local': ip in local_ips,
            'is_gateway': ip == gateway,
            'timestamp': datetime.now().isoformat()
        }
        
        # Add OS info if detected
        if os_info:
            device_info['os'] = os_info['os']
            device_info['os_confidence'] = os_info['confidence']
            device_info['os_method'] = os_info.get('method', 'unknown')  # NEW
        
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

def detect_os(ip, mac=None, hostname=None):
    os_guess = "Unknown"
    confidence = "low"
    method = "none"
    version_info = ""
    
    # Method 1: TTL Analysis (fastest - just parse existing ping data)
    ttl_result = _detect_os_by_ttl(ip)
    if ttl_result:
        os_guess = ttl_result['os']
        confidence = ttl_result['confidence']
        method = "TTL"
        # If we got high confidence from TTL, skip TCP check
        if confidence == "high":
            return {"os": os_guess, "confidence": confidence, "method": method}
    
    # Method 2: Quick TCP Port Check (only if TTL gave low confidence)
    if confidence != "high":
        tcp_result = _detect_os_by_tcp_stack(ip)
        if tcp_result:
            os_guess = tcp_result['os']
            confidence = tcp_result['confidence']
            method = tcp_result.get('method', 'TCP')
            version_info = tcp_result.get('version', '')
    
    # Format final result
    if version_info:
        os_guess = f"{os_guess} {version_info}"
    
    return {
        "os": os_guess,
        "confidence": confidence,
        "method": method
    }


def _detect_os_by_ttl(ip):
    """Detect OS based on TTL values from ping response."""
    try:
        param = ['-n', '1', '-w', '500'] if platform.system().lower() == 'windows' else ['-c', '1', '-W', '1']
        result = subprocess.run(['ping'] + param + [ip], 
                              capture_output=True, 
                              text=True,
                              timeout=1)
        
        if result.returncode != 0:
            return None
        
        # Extract TTL from output
        ttl_match = re.search(r'(?:ttl|TTL)=(\d+)', result.stdout, re.IGNORECASE)
        if not ttl_match:
            return None
        
        ttl = int(ttl_match.group(1))
        
        # TTL fingerprinting (common initial TTL values)
        # Windows: 128, Linux: 64, Cisco: 255
        if 60 < ttl <= 64:
            return {"os": "Linux/Unix", "confidence": "high"}
        elif 120 < ttl <= 128:
            return {"os": "Windows", "confidence": "high"}
        elif 240 < ttl <= 255:
            return {"os": "Network Device", "confidence": "high"}
        elif ttl <= 60:
            return {"os": "Linux/Android", "confidence": "medium"}
        elif ttl <= 120:
            return {"os": "Windows", "confidence": "low"}
        
    except Exception:
        pass
    
    return None


def _detect_os_by_tcp_stack(ip):
    """
    Fast TCP port-based detection - only checks if ports are open.
    Does NOT use the actual protocols, just TCP connection tests.
    """
    # Only check the most common ports - in priority order
    ports_to_try = [
        (445, "Windows", "Port 445"),      # SMB port (Windows file sharing)
        (22, "Linux/Unix", "Port 22"),      # SSH port (Linux remote access)
        (3389, "Windows", "Port 3389")      # RDP port (Windows remote desktop)
    ]
    
    for port, os_type, method_name in ports_to_try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        
        try:
            if sock.connect_ex((ip, port)) == 0:
                sock.close()
                
                version = "10/11" if port == 3389 else ""
                return {
                    "os": os_type,
                    "confidence": "high",
                    "version": version,
                    "method": method_name  # More accurate: "Port 445" instead of "SMB"
                }
        except:
            pass
        finally:
            try:
                sock.close()
            except:
                pass
    
    return None

# Add this after the get_default_gateway function for debugging
def debug_network_info():
    """Temporary debug function to diagnose network scanning issues"""
    print("\033[94m[DEBUG] === Network Debug Info ===\033[0m")
    
    local_ips = get_local_ips()
    print(f"\033[94m[DEBUG] Local IPs found: {local_ips}\033[0m")
    
    gateway = get_default_gateway()
    print(f"\033[94m[DEBUG] Gateway detected: {gateway}\033[0m")
    
    if gateway:
        # Test basic connectivity to gateway
        _, gateway_reachable = ping(gateway)
        print(f"\033[94m[DEBUG] Gateway reachable: {gateway_reachable}\033[0m")
        
        # Test subnet calculation
        if local_ips:
            subnet = '.'.join(local_ips[0].split('.')[:3]) + '.0'
            print(f"\033[94m[DEBUG] Calculated subnet: {subnet}\033[0m")
    
    print("\033[94m[DEBUG] === End Network Debug ===\033[0m")
