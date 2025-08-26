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
        self.process_cache = {}
        self.process_stats = {}  # To store persistent stats like dropped connections
        # Added caches / state
        self.whois_cache = {}
        self.whois_cache_ttl = 3600  # seconds
        self.adapters_info = {}
        self._last_adapter_refresh = 0.0
        self._whois_max_entries = 256

    def find_interface_for_connection(self, conn):
        try:
            local_ip = conn.laddr.ip
            for name, info in self.adapters_info.items():
                if info.get('ip') == local_ip:
                    return name
            return None
        except:
            return None

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

    def refresh_adapters_info(self):
        adapters = {}
        try:
            addrs = psutil.net_if_addrs()
            stats = psutil.net_if_stats()
            for name, addr_list in addrs.items():
                ipv4 = None
                mac = None
                for a in addr_list:
                    try:
                        if a.family == socket.AF_INET and not ipv4:
                            ipv4 = a.address
                        # Cross‑platform MAC detection
                        if (hasattr(psutil, 'AF_LINK') and a.family == getattr(psutil, 'AF_LINK')) or \
                           (hasattr(socket, 'AF_PACKET') and a.family == getattr(socket, 'AF_PACKET')):
                            mac = a.address
                    except Exception:
                        continue
                adapters[name] = {
                    'name': name,
                    'ip': ipv4,
                    'mac': mac,
                    'is_up': stats.get(name).isup if name in stats else None
                }
        except Exception:
            pass
        self.adapters_info = adapters

    def get_connections(self):
        current_time = time.time()
        # Refresh adapter map periodically (every 5s)
        if current_time - getattr(self, "_last_adapter_refresh", 0) > 5:
            self.refresh_adapters_info()
            self._last_adapter_refresh = current_time
        processes_data = {}
        
        active_pids = set()

        try:
            # Get all connections
            all_connections = psutil.net_connections(kind='inet')
            
            # Get processes once for efficiency
            processes = {p.pid: p for p in psutil.process_iter(['pid', 'name', 'create_time', 'memory_info', 'io_counters', 'status'])}
            
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
                    active_pids.add(pid)
                    
                    # Ignore system processes
                    if pid in (None, 0):
                        continue

                    # Initialize process entry if not present
                    if pid not in processes_data:
                        # Initialize persistent stats if first time seeing this process
                        if pid not in self.process_stats:
                            try:
                                proc_obj = psutil.Process(pid)
                            except psutil.Error:
                                continue
                            self.process_stats[pid] = {
                                'dropped_connections': 0,
                                'previous_connection_ids': set(),
                                'process_obj': proc_obj,
                                'create_time': process.info.get('create_time')
                            }
                            # Prime CPU measurement (first call returns 0.0)
                            try:
                                self.process_stats[pid]['process_obj'].cpu_percent(None)
                            except psutil.Error:
                                pass
                            cpu_usage = 0.0
                        else:
                            stats = self.process_stats[pid]
                            # If process restarted or cached handle is dead, refresh and prime
                            try:
                                restarted = stats.get('create_time') != process.info.get('create_time')
                                not_running = not stats['process_obj'].is_running()
                            except psutil.Error:
                                restarted = True
                                not_running = True
                            if restarted or not_running:
                                try:
                                    stats['process_obj'] = psutil.Process(pid)
                                    stats['create_time'] = process.info.get('create_time')
                                    stats['process_obj'].cpu_percent(None)  # prime
                                except psutil.Error:
                                    pass
                                cpu_usage = 0.0
                            else:
                                try:
                                    cpu_usage = stats['process_obj'].cpu_percent(None)
                                except psutil.Error:
                                    cpu_usage = 0.0

                        processes_data[pid] = {
                            'pid': pid,
                            'process_name': process_name,
                            'connections': [],
                            'cpu_percent': cpu_usage,
                            'memory_rss': process.info['memory_info'].rss if process.info['memory_info'] else 0,
                            'io_read_bytes': process.info['io_counters'].read_bytes if process.info['io_counters'] else 0,
                            'io_write_bytes': process.info['io_counters'].write_bytes if process.info['io_counters'] else 0,
                            'create_time': process.info['create_time'],
                            'status': process.info['status'],
                            'dropped_connections': self.process_stats[pid]['dropped_connections']
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
                        'duration': duration,
                        'start_time': start_time,
                        'interface': interface_name,
                        'type': connection_type,
                        'protocol': proto
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            # Calculate dropped connections and add connection count
            for pid, data in processes_data.items():
                # Add connection_count field
                data['connection_count'] = len(data['connections'])

                current_connection_ids = {c['id'] for c in data['connections']}
                previous_ids = self.process_stats[pid]['previous_connection_ids']
                
                dropped_count = len(previous_ids - current_connection_ids)
                if dropped_count > 0:
                    self.process_stats[pid]['dropped_connections'] += dropped_count
                
                self.process_stats[pid]['previous_connection_ids'] = current_connection_ids
                processes_data[pid]['dropped_connections'] = self.process_stats[pid]['dropped_connections']

            # Cleanup stats for processes that are no longer active
            for pid in list(self.process_stats.keys()):
                if pid not in active_pids:
                    del self.process_stats[pid]

        except Exception as e:
            print(f"Error getting connections: {e}")

        return list(processes_data.values())

    def perform_whois_lookup(self, ip):
        # Ensure cache dict exists (defensive)
        if not hasattr(self, 'whois_cache'):
            self.whois_cache = {}
        now = time.time()

        # Purge expired & size control
        expired = [k for k, v in list(self.whois_cache.items()) if now - v['timestamp'] > self.whois_cache_ttl]
        for k in expired:
            self.whois_cache.pop(k, None)
        if len(self.whois_cache) > self._whois_max_entries:
            # Drop oldest entries
            for k in sorted(self.whois_cache, key=lambda kk: self.whois_cache[kk]['timestamp'])[:len(self.whois_cache)-self._whois_max_entries]:
                self.whois_cache.pop(k, None)

        # Check if the IP is private/reserved first
        try:
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_unspecified:
                return f"This is a private or reserved IP address ({ip}) and has no public WHOIS record."
        except ValueError:
            return f"Invalid IP address: {ip}"

        # Check cache first
        if ip in self.whois_cache and (now - self.whois_cache[ip]['timestamp']) < self.whois_cache_ttl:
            return self.whois_cache[ip]['result']
        
        output = None
        try:
            command = ["whois", ip]
            result = subprocess.run(command, capture_output=True, text=True, timeout=10, check=False)
            if result.returncode == 0 and result.stdout:
                output = result.stdout
            else:
                output = self._online_whois_lookup(ip)
        except FileNotFoundError:
            output = self._online_whois_lookup(ip)
        except Exception:
            try:
                output = self._online_whois_lookup(ip)
            except Exception as e2:
                output = f"WHOIS lookup failed: {str(e2)}"

        self.whois_cache[ip] = {'result': output, 'timestamp': now}
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
        # Scan all well-known ports (1-1024) plus a other list
        well_known_ports = range(1, 1025)
        
        other_ports = [
            80,     
            443,    
            1433,   
            2049,   
            5900,   
            19132,  
            25565,
            27015
        ]

        ports_to_scan = sorted(list(set(list(well_known_ports) + other_ports)))
        
        open_ports = []
        threads = []
        
        def scan_port(port):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.2)
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