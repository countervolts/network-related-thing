from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import subprocess
import threading
import argparse
import sys

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

def suppress_console_output():
    """Redirect stdout and stderr to suppress console output."""
    if sys.platform == 'win32': 
        sys.stdout = open('nul', 'w')
        sys.stderr = open('nul', 'w')

if __name__ == '__main__':
    print("hosted at http://localhost:5000")

    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Run the Flask server.")
    parser.add_argument('-s', '--suppress', action='store_true', help="Suppress console output")
    args = parser.parse_args()

    # Suppress console output if -s is passed
    if args.suppress:
        print("supressing console output")
        suppress_console_output()

    app.run(host='0.0.0.0', port=5000, threaded=True)