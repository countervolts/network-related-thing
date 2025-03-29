from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import subprocess
import threading

app = Flask(__name__)
CORS(app)

# Import scanning functions from ping.py
from src.ping import scan_network, get_local_ips, get_default_gateway

@app.route('/scan/basic')
def basic_scan():
    results = scan_network(subnet="192.168.87", ports=[], scan_hostname=False, scan_vendor=False)
    return jsonify([{k: v for k, v in item.items() if k in ['ip', 'mac']} for item in results])

@app.route('/scan/full')
def full_scan():
    results = scan_network(subnet="192.168.87", scan_hostname=True, scan_vendor=True)
    return jsonify(results)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, threaded=True)