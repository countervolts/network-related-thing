import subprocess
import platform
import concurrent.futures
import socket
import os
from datetime import datetime
from functools import lru_cache

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

@lru_cache(maxsize=None)
def get_hostname(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except (socket.herror, socket.gaierror):
        return 'Unknown'

def load_oui_data(oui_file='oui.txt'):
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

    def resolve(ip):
        hostnames[ip] = get_hostname(ip)

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        executor.map(resolve, ips)

    return hostnames

def scan_network(subnet, scan_hostname=False, scan_vendor=False):
    online_devices = []
    local_ips = get_local_ips()
    gateway = get_default_gateway()
    
    base_ip = '.'.join(subnet.split('.')[:3])
    ips = sorted([f"{base_ip}.{i}" for i in range(1, 255)], key=lambda ip: int(ip.split('.')[-1]))

    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = {executor.submit(ping, ip): ip for ip in ips}
        for future in concurrent.futures.as_completed(futures):
            ip, status = future.result()
            if status:
                online_devices.append(ip)

    online_devices = sorted(online_devices, key=lambda ip: int(ip.split('.')[-1]))

    hostnames = resolve_hostnames(online_devices) if scan_hostname else {}

    oui_dict = load_oui_data() if scan_vendor else {}
    vendors = resolve_vendors(online_devices, oui_dict) if scan_vendor else {}

    results = []
    for ip in online_devices:
        mac = get_mac_address(ip)
        hostname = hostnames.get(ip, 'Skipped') if scan_hostname else 'Skipped'
        vendor = vendors.get(ip, 'Skipped') if scan_vendor else 'Skipped'
        
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

    return results