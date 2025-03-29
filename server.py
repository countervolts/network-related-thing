from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

# Import scanning functions from ping.py
from src.ping import scan_network, get_local_ips, get_default_gateway

def get_subnet():
    default_gateway = get_default_gateway()
    if default_gateway:
        subnet = '.'.join(default_gateway.split('.')[:3])
        return f"{subnet}.0/24"  # assuming a /24 subnet mask
    else:
        raise ValueError("Unable to determine the default gateway. offline?")

@app.route('/scan/basic')
def basic_scan():
    try:
        subnet = get_subnet()
        results = scan_network(subnet=subnet, scan_hostname=False, scan_vendor=False)
        return jsonify([{k: v for k, v in item.items() if k in ['ip', 'mac']} for item in results])
    except Exception as e:
        print(f"Error during basic scan: {e}")
        return jsonify({"error": "An error occurred during the basic scan."}), 500

@app.route('/scan/full')
def full_scan():
    try:
        subnet = get_subnet()
        results = scan_network(subnet=subnet, scan_hostname=True, scan_vendor=True)
        return jsonify(results)
    except Exception as e:
        print(f"Error during full scan: {e}")
        return jsonify({"error": "An error occurred during the full scan."}), 500

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, threaded=True)