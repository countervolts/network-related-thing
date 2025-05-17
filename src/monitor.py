import psutil
import socket
import time
import subprocess
import platform


class ConnectionMonitor:
    def __init__(self):
        self.connection_start_times = {}
        self.adapters_info = {}
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

    def get_connections(self, adapter_filter='all', filter_type=None):
        current_time = time.time()
        connections = []
        
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
                    
                    # Apply adapter filter if specified
                    if adapter_filter and adapter_filter != "all" and interface_name != adapter_filter:
                        continue
                    
                    # Get process info
                    process_name = "Unknown"
                    pid = conn.pid or 0
                    if pid in processes:
                        process = processes[pid]
                        process_name = process.info['name']
                    
                    # Track connection duration
                    connection_id = f"{conn.laddr.ip}:{conn.laddr.port}-{conn.raddr.ip}:{conn.raddr.port}"
                    if connection_id not in self.connection_start_times:
                        self.connection_start_times[connection_id] = current_time
                    duration = current_time - self.connection_start_times[connection_id]
                    start_time = self.connection_start_times[connection_id]
                    
                    connection_type = self.get_connection_type(interface_name or "")
                    
                    # Add protocol type (TCP/UDP)
                    proto = "TCP" if conn.type == socket.SOCK_STREAM else "UDP"

                    connections.append({
                        'id': connection_id,
                        'process_name': process_name,
                        'pid': pid,
                        'local_addr': f"{conn.laddr.ip}:{conn.laddr.port}",
                        'remote_addr': f"{conn.raddr.ip}:{conn.raddr.port}",
                        'remote_ip': conn.raddr.ip,
                        'remote_port': conn.raddr.port,
                        'status': conn.status,
                        'type': connection_type,
                        'interface': interface_name or "Unknown",
                        'duration': format_duration(duration),
                        'start_time': start_time,
                        'protocol': proto,  # <-- Add this line
                    })
                except Exception as e:
                    continue
                    
            # Clean up stale connection timings
            active_ids = {conn['id'] for conn in connections}
            for conn_id in list(self.connection_start_times.keys()):
                if conn_id not in active_ids:
                    del self.connection_start_times[conn_id]
                
            filtered = []
            for conn in connections:
                # Ignore local addresses
                if conn.get('remote_ip', '').startswith('127.') or conn.get('remote_ip', '') == '::1':
                    continue
                # Ignore system processes (PID 0 or None)
                if conn.get('pid') in (None, 0):
                    continue
                filtered.append(conn)
            return filtered
        except Exception as e:
            print(f"Error getting connections: {e}")
            return []

    def perform_whois_lookup(self, ip):
        try:
            if platform.system() == 'Windows':
                result = subprocess.run(["whois", ip], capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    return result.stdout
                else:
                    # If the built-in whois fails, try an online API
                    return self._online_whois_lookup(ip)
            else:
                # For other platforms
                result = subprocess.run(["whois", ip], capture_output=True, text=True, timeout=10)
                return result.stdout if result.returncode == 0 else f"WHOIS failed: {result.stderr}"
        except Exception as e:
            try:
                # Fallback to online lookup
                return self._online_whois_lookup(ip)
            except Exception as e2:
                return f"WHOIS lookup failed: {str(e2)}"

    def _online_whois_lookup(self, ip):
        import urllib.request
        import json
        
        try:
            with urllib.request.urlopen(f"https://ipinfo.io/{ip}/json", timeout=5) as response:
                data = json.loads(response.read().decode())
                
            # Format the response in a WHOIS-like format
            result = f"IP: {ip}\n"
            result += f"Hostname: {data.get('hostname', 'N/A')}\n"
            result += f"Organization: {data.get('org', 'N/A')}\n"
            result += f"Country: {data.get('country', 'N/A')}\n"
            result += f"Region: {data.get('region', 'N/A')}\n"
            result += f"City: {data.get('city', 'N/A')}\n"
            result += f"Location: {data.get('loc', 'N/A')}\n"
            result += f"Timezone: {data.get('timezone', 'N/A')}\n"
            
            return result
        except Exception as e:
            return f"Online WHOIS lookup failed: {str(e)}"

def format_duration(seconds):
    if (seconds < 60):
        return f"{int(seconds)}s"
    elif (seconds < 3600):
        minutes = int(seconds / 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs}s"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours}h {minutes}m"

connection_monitor = ConnectionMonitor()