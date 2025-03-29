import subprocess
import platform
import concurrent.futures
import socket
import argparse
import json
import os
import sys
from datetime import datetime
from functools import lru_cache

try:
    import netifaces
except ImportError:
    netifaces = None

# ANSI color codes
class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    END = '\033[0m'

# Common ports for scanning
COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 8080, 8443]

def get_local_ips():
    """Get all local IP addresses using netifaces if available."""
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
    except Exception as e:
        pass
    return ips

def get_default_gateway():
    """Get default gateway using netifaces if available."""
    if netifaces:
        gateways = netifaces.gateways()
        return gateways.get('default', {}).get(netifaces.AF_INET, [None])[0]
    return None

def ping(ip):
    """Ping an IP with OS-specific parameters."""
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
    """Get MAC address cross-platform with improved parsing."""
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
    except Exception as e:
        return 'Unknown'

@lru_cache(maxsize=None)
def get_hostname(ip):
    """Get reverse DNS hostname with caching."""
    try:
        return socket.gethostbyaddr(ip)[0]
    except (socket.herror, socket.gaierror):
        return 'Unknown'

def load_oui_data(oui_file='oui.txt'):
    """Load OUI data from file."""
    oui_dict = {}
    if os.path.exists(oui_file):
        with open(oui_file, 'r', encoding='utf-8') as f:  # Specify utf-8 encoding
            for line in f:
                if '(base 16)' in line:
                    parts = line.split('(base 16)')
                    oui = parts[0].strip().replace('-', '').upper()
                    vendor = parts[1].strip()
                    oui_dict[oui] = vendor
    return oui_dict

def get_vendor(mac, oui_dict):
    """Get vendor from MAC address using OUI data."""
    if mac in ['Not Found', 'Unknown'] or not mac:
        return 'Unknown'
    oui = mac.replace(':', '')[:6].upper()
    return oui_dict.get(oui, 'Unknown')

def resolve_vendors(ips, oui_dict):
    """Resolve vendors for a list of IPs using multithreading."""
    vendors = {}

    def resolve(ip):
        mac = get_mac_address(ip)
        vendors[ip] = get_vendor(mac, oui_dict)

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        executor.map(resolve, ips)

    return vendors

def scan_port(ip, port, timeout=1):
    """Scan a single port with timeout."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            return port, True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return port, False

def scan_ports(ip, ports, max_threads=100):
    """Scan multiple ports using threading."""
    open_ports = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_threads) as executor:
        futures = {executor.submit(scan_port, ip, port): port for port in ports}
        for future in concurrent.futures.as_completed(futures):
            port, is_open = future.result()
            if is_open:
                open_ports.append(port)
    return sorted(open_ports)

def resolve_hostnames(ips):
    """Resolve hostnames for a list of IPs using multithreading."""
    hostnames = {}

    def resolve(ip):
        hostnames[ip] = get_hostname(ip)

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        executor.map(resolve, ips)

    return hostnames

def scan_network(subnet, ports=None, output_file='scan_results.txt', output_format='text', scan_hostname=False, scan_vendor=False):
    """Main scanning function with enhanced features."""
    online_devices = []
    local_ips = get_local_ips()
    gateway = get_default_gateway()
    
    # Generate IP range based on subnet and sort them
    base_ip = '.'.join(subnet.split('.')[:3])
    ips = sorted([f"{base_ip}.{i}" for i in range(1, 255)], key=lambda ip: int(ip.split('.')[-1]))

    # Ping sweep
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = {executor.submit(ping, ip): ip for ip in ips}
        for future in concurrent.futures.as_completed(futures):
            ip, status = future.result()
            if status:
                online_devices.append(ip)

    # Sort online devices to ensure they are in order
    online_devices = sorted(online_devices, key=lambda ip: int(ip.split('.')[-1]))

    # Resolve hostnames in parallel if enabled
    hostnames = resolve_hostnames(online_devices) if scan_hostname else {}

    # Load OUI data and resolve vendors in parallel if enabled
    oui_dict = load_oui_data() if scan_vendor else {}
    vendors = resolve_vendors(online_devices, oui_dict) if scan_vendor else {}

    # Gather detailed information
    results = []
    for ip in online_devices:
        mac = get_mac_address(ip)
        hostname = hostnames.get(ip, 'Skipped') if scan_hostname else 'Skipped'
        vendor = vendors.get(ip, 'Skipped') if scan_vendor else 'Skipped'
        open_ports = scan_ports(ip, ports or COMMON_PORTS) if ports else []
        
        device_info = {
            'ip': ip,
            'mac': mac,
            'hostname': hostname,
            'vendor': vendor,
            'open_ports': open_ports,
            'is_local': ip in local_ips,
            'is_gateway': ip == gateway,
            'timestamp': datetime.now().isoformat()
        }
        results.append(device_info)
        
        # Print to console with colors
        color = Colors.GREEN if device_info['is_local'] else Colors.CYAN
        status = f"{color}{ip}{Colors.END}"
        status += f" | MAC: {Colors.YELLOW}{mac}{Colors.END}"
        if scan_hostname:
            status += f" | Hostname: {Colors.BLUE}{hostname}{Colors.END}"
        if scan_vendor:
            status += f" | Vendor: {Colors.WHITE}{vendor}{Colors.END}"
        if open_ports:
            status += f" | Open ports: {Colors.RED}{', '.join(map(str, open_ports))}{Colors.END}"
        print(status)

    # Save results
    if output_file and output_file.strip():
        if output_format == 'json':
            with open(output_file, 'w') as f:
                json.dump(results, f, indent=2)
    else:
        with open(output_file, 'w') as f:
            for device in results:
                f.write(f"IP: {device['ip']}\n")
                f.write(f"MAC: {device['mac']}\n")
                if scan_hostname:
                    f.write(f"Hostname: {device['hostname']}\n")
                if scan_vendor:
                    f.write(f"Vendor: {device['vendor']}\n")
                f.write(f"Open Ports: {', '.join(map(str, device['open_ports']))}\n")
                f.write("-"*50 + "\n")

    return results

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Enhanced Network Scanner")
    parser.add_argument("-s", "--subnet", default="192.168.87", help="Network subnet (e.g., 192.168.1)")
    parser.add_argument("-p", "--ports", nargs="+", type=int, help="Ports to scan")
    parser.add_argument("-o", "--output", default="scan_results.txt", help="Output file name")
    parser.add_argument("-f", "--format", choices=["text", "json"], default="text", help="Output format")
    parser.add_argument("-shn", "--scan-hostname", action="store_true", help="Enable scanning for hostnames")
    parser.add_argument("-sv", "--scan-vendor", action="store_true", help="Enable scanning for vendors")
    args = parser.parse_args()

    print(f"{Colors.CYAN}=== Starting Network Scan ==={Colors.END}")
    print(f"{Colors.WHITE}Local IPs: {', '.join(get_local_ips())}{Colors.END}")
    if gateway := get_default_gateway():
        print(f"{Colors.WHITE}Default Gateway: {gateway}{Colors.END}")

    results = scan_network(
        subnet=args.subnet,
        ports=args.ports,
        output_file=args.output,
        output_format=args.format,
        scan_hostname=args.scan_hostname,
        scan_vendor=args.scan_vendor
    )

    print(f"{Colors.CYAN}=== Scan Complete ==={Colors.END}")
    print(f"Found {len(results)} online devices")
    print(f"Results saved to {args.output} ({args.format.upper()})")