import psutil
import socket
import time
import platform
import subprocess
from threading import Thread
import urllib.request
import json
import ipaddress

class ConnectionMonitor:
    def __init__(self):
        self.connection_start_times = {}
        self.adapters_info = {}
        self.whois_cache = {}
        self.refresh_adapters_info()

    def refresh_adapters_info(self):
        self.adapters_info = {}
        try:
            # Get all network interfaces with their addresses
            for interface, addrs in psutil.net_if_addrs().items():
                for addr in addrs:
                    if addr.family == socket.AF_INET:  # IPv4
                        self.adapters_info[interface] = {
                            'name': interface,
                            'ip': addr.address,
                            'netmask': addr.netmask,
                            'status': 'UP' if interface in psutil.net_if_stats() and psutil.net_if_stats()[interface].isup else 'DOWN'
                        }
        except Exception as e:
            print(f"Error refreshing adapter info: {e}")

    def get_adapters(self):
        self.refresh_adapters_info()
        return list(self.adapters_info.values())

    def get_connection_type(self, interface_name):
        if not interface_name:
            return "Unknown"
        
        # Common naming patterns
        if "wi" in interface_name.lower() or "wlan" in interface_name.lower() or "wireless" in interface_name.lower():
            return "WiFi"
        elif "eth" in interface_name.lower() or "local" in interface_name.lower():
            return "Ethernet"
        return "Other"

    def find_interface_for_connection(self, connection):
        try:
            local_ip = connection.laddr.ip
            for name, info in self.adapters_info.items():
                if info.get('ip') == local_ip:
                    return name
            return None
        except:
            return None

    def get_connections(self):
        current_time = time.time()
        processes_data = {}

        try:
            # Get all connections
            all_connections = psutil.net_connections(kind='inet')
            
            # Get processes once for efficiency
            processes = {p.pid: p for p in psutil.process_iter(['pid', 'name', 'create_time'])}
            
            for conn in all_connections:
                try:
                    # Only include connections with a remote address (outbound)
                    if not conn.raddr or not conn.raddr.ip:
                        continue
                    
                    interface_name = self.find_interface_for_connection(conn)
                    
                    # Get process info
                    pid = conn.pid or 0
                    if pid not in processes:
                        continue
                    
                    process = processes[pid]
                    process_name = process.info['name']
                    
                    # Ignore system processes
                    if pid in (None, 0):
                        continue

                    # Initialize process entry if not present
                    if pid not in processes_data:
                        processes_data[pid] = {
                            'pid': pid,
                            'process_name': process_name,
                            'connections': []
                        }

                    # Track connection duration
                    connection_id = f"{conn.laddr.ip}:{conn.laddr.port}-{conn.raddr.ip}:{conn.raddr.port}"
                    if connection_id not in self.connection_start_times:
                        self.connection_start_times[connection_id] = current_time
                    duration = current_time - self.connection_start_times[connection_id]
                    start_time = self.connection_start_times[connection_id]
                    
                    connection_type = self.get_connection_type(interface_name or "")
                    
                    # Add protocol type (TCP/UDP)
                    proto = "TCP" if conn.type == socket.SOCK_STREAM else "UDP"

                    processes_data[pid]['connections'].append({
                        'id': connection_id,
                        'local_addr': f"{conn.laddr.ip}:{conn.laddr.port}",
                        'remote_addr': f"{conn.raddr.ip}:{conn.raddr.port}",
                        'remote_ip': conn.raddr.ip,
                        'remote_port': conn.raddr.port,
                        'status': conn.status,
                        'type': connection_type,
                        'interface': interface_name or "Unknown",
                        'duration': format_duration(duration),
                        'start_time': start_time,
                        'protocol': proto,
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
            # Clean up stale connection timings
            active_conn_ids = {
                conn['id'] 
                for proc in processes_data.values() 
                for conn in proc['connections']
            }
            for conn_id in list(self.connection_start_times.keys()):
                if conn_id not in active_conn_ids:
                    del self.connection_start_times[conn_id]
            
            # Convert dict to list and add connection count
            result_list = list(processes_data.values())
            for proc in result_list:
                proc['connection_count'] = len(proc['connections'])

            return result_list
        except Exception as e:
            print(f"Error getting connections: {e}")
            return []

    def perform_whois_lookup(self, ip):
        # Check if the IP is private/reserved first
        try:
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_unspecified:
                return f"This is a private or reserved IP address ({ip}) and has no public WHOIS record."
        except ValueError:
            return f"Invalid IP address: {ip}"

        # Check cache first
        if ip in self.whois_cache and (time.time() - self.whois_cache[ip]['timestamp']) < 3600:
            return self.whois_cache[ip]['result']
        
        output = None
        try:
            # Determine the command based on the platform
            command = ["whois", ip]
            
            # Execute the command
            result = subprocess.run(command, capture_output=True, text=True, timeout=10, check=False)

            if result.returncode == 0 and result.stdout:
                output = result.stdout
            else:
                # If the command fails or returns no output, try the online lookup
                output = self._online_whois_lookup(ip)

        except FileNotFoundError:
            # If 'whois' command is not found, go directly to online lookup
            output = self._online_whois_lookup(ip)
        except Exception:
            # Broad exception for other potential issues, fallback to online
            try:
                output = self._online_whois_lookup(ip)
            except Exception as e2:
                output = f"WHOIS lookup failed: {str(e2)}"

        # Cache the result
        self.whois_cache[ip] = {
            'result': output,
            'timestamp': time.time()
        }
        
        return output

    def perform_deep_dive(self, ip):
        results = {
            "reverse_dns": self._get_reverse_dns(ip),
            "open_ports": self._scan_common_ports(ip),
            "ping_latency": self._ping_ip(ip),
            "geo_info": self._get_ip_geo_info(ip),
            "traceroute": self._perform_traceroute(ip)
        }
        return results

    def _get_reverse_dns(self, ip):
        try:
            return socket.gethostbyaddr(ip)[0]
        except socket.herror:
            return None

    def _perform_traceroute(self, ip):
        try:
            command = ['tracert', '-d', '-w', '1000', ip] if platform.system().lower() == 'windows' else ['traceroute', '-n', '-w', '1', ip]
            output = subprocess.check_output(command, stderr=subprocess.STDOUT, universal_newlines=True, timeout=20)
            
            hops = []
            lines = output.strip().splitlines()
            
            if platform.system().lower() == 'windows':
                trace_started = False
                for line in lines:
                    if 'Tracing route to' in line:
                        trace_started = True
                        continue
                    if not trace_started or not line.strip() or 'Trace complete' in line:
                        continue
                    parts = line.strip().split()
                    if len(parts) > 1 and parts[0].isdigit():
                        hops.append(' '.join(parts[1:]))
            else:
                for line in lines[1:]: # Skip header
                    hops.append(line.strip())

            return hops if hops else ["Traceroute completed but returned no hops."]
        except subprocess.TimeoutExpired:
            return ["Traceroute timed out after 20 seconds."]
        except FileNotFoundError:
            return ["Traceroute command not found. Is it installed and in your PATH?"]
        except Exception as e:
            return [f"Traceroute failed: {str(e)}"]

    def _ping_ip(self, ip):
        try:
            param = '-n' if platform.system().lower() == 'windows' else '-c'
            command = ['ping', param, '4', ip]
            output = subprocess.check_output(command, stderr=subprocess.STDOUT, universal_newlines=True, timeout=10)
            
            # Extract the time= value from the ping output
            for line in output.strip().splitlines():
                if 'time=' in line:
                    time_part = line.split('time=')[1]
                    latency = time_part.split(' ')[0]
                    return latency 
            
            return "Ping successful but latency not found."
        except subprocess.TimeoutExpired:
            return "Ping command timed out."
        except Exception as e:
            return f"Ping failed: {str(e)}"

    def _get_ip_geo_info(self, ip):
        try:
            # Use a public API to get geo-information
            with urllib.request.urlopen(f"https://ipinfo.io/{ip}/json", timeout=5) as response:
                data = json.loads(response.read().decode())
                return data
        except Exception:
            return None

    def _scan_common_ports(self, ip):
        # Scan all well-known ports (1-1024)
        ports_to_scan = range(1, 1025)
        open_ports = []
        threads = []
        
        def scan_port(port):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.2) # Aggressive timeout for speed
                    if s.connect_ex((ip, port)) == 0:
                        open_ports.append(port)
            except Exception:
                pass

        for port in ports_to_scan:
            thread = Thread(target=scan_port, args=(port,))
            threads.append(thread)
            thread.start()
        
        for thread in threads:
            thread.join()
            
        return sorted(open_ports)

    def _online_whois_lookup(self, ip):
        try:
            # Request plain text directly, which is more reliable than parsing JSON
            req = urllib.request.Request(
                f"https://whois.arin.net/rest/ip/{ip}", 
                headers={'Accept': 'text/plain'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                # Read and decode the response as plain text
                whois_text = response.read().decode('utf-8')
                return whois_text
        except Exception as e:
            return f"Online WHOIS lookup failed: {str(e)}"

def format_duration(seconds):
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        mins = int(seconds / 60)
        secs = int(seconds % 60)
        return f"{mins}m {secs}s"
    else:
        hours = int(seconds / 3600)
        mins = int((seconds % 3600) / 60)
        return f"{hours}h {mins}m"

connection_monitor = ConnectionMonitor()