function showNotification(message, type = 'success') {
    const notificationContainer = document.getElementById('notificationContainer');
    if (!notificationContainer) return;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationContainer.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

let disabledDevicesBox;
let disabledDevices = [];
let pingStreams = {};

function requestPing(ip) {
    if (pingStreams[ip]) return;
    
    const clientId = 'scanner-' + Math.random().toString(36).substring(2, 15);
    const eventSource = new EventSource(`/api/ping/stream?ip=${ip}&client=${clientId}`);
    
    pingStreams[ip] = { eventSource, clientId };

    const deviceElement = document.querySelector(`.device-item[data-ip="${ip}"]`);
    if (deviceElement) {
        const pingTimeElement = deviceElement.querySelector('.ping-time');
        if (pingTimeElement) pingTimeElement.textContent = 'Pinging...';
    }
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.processing) return;
            
            const deviceElement = document.querySelector(`.device-item[data-ip="${ip}"]`);
            if (deviceElement) {
                const signalIndicator = deviceElement.querySelector('.signal-indicator');
                if (signalIndicator && data.signal !== undefined) {
                    signalIndicator.style.width = `${data.signal}%`;
                    signalIndicator.title = `Ping: ${data.time}ms, Signal: ${data.signal}%`;
                }
                
                const pingTimeElement = deviceElement.querySelector('.ping-time');
                if (pingTimeElement) {
                    pingTimeElement.textContent = data.success ? `${data.time}ms` : 'Failed';
                }
            } else {
                stopPingStream(ip);
            }
        } catch (error) {
            console.error('Error processing ping update:', error);
        }
    };
    
    eventSource.onerror = (error) => {
        console.error('Ping stream connection error for IP:', ip, error);
        stopPingStream(ip);
    };
}

function stopPingStream(ip) {
    if (pingStreams[ip]) {
        pingStreams[ip].eventSource.close();
        fetch('/api/ping/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client: pingStreams[ip].clientId })
        }).catch(error => console.error('Error stopping ping stream:', error));
        delete pingStreams[ip];
    }
}

function stopAllPingStreams() {
    Object.keys(pingStreams).forEach(stopPingStream);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopAllPingStreams();
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        if (!e.target.closest('[data-view="scanner"]')) {
            stopAllPingStreams();
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const basicBtn = document.getElementById('basicScanBtn');
    const fullBtn = document.getElementById('fullScanBtn');
    const resultsBody = document.getElementById('resultsBody');
    const userDeviceList = document.getElementById('userDeviceList');
    disabledDevicesBox = document.getElementById('disabledDevices');
    const lastScanTimestamp = document.getElementById('lastScanTimestamp');
    const deviceDetailsPanel = document.getElementById('deviceDetailsContent');
    const portScanPanel = document.getElementById('portScanContent');
    const deviceSearchInput = document.getElementById('deviceSearchInput');

    let lastScanDetails = JSON.parse(localStorage.getItem('lastScanDetails')) || null;
    let savedScanResults = JSON.parse(localStorage.getItem('savedScanResults')) || [];

    function updateLastScanDisplay(scanDetails) {
        if (lastScanTimestamp) {
            lastScanTimestamp.textContent = scanDetails 
                ? `- Previous scan: ${scanDetails.timestamp} (${scanDetails.scanType})`
                : '- Previous scan: None';
        }
    }

    function createDeviceItem(device, isDisabled = false, isUserOrRouter = false) {
        const item = document.createElement('div');
        item.className = 'device-item';
        if (isDisabled) item.classList.add('disabled');
        item.dataset.ip = device.ip;
        item.dataset.mac = device.mac;

        let iconContent = device.is_router ? '🌐' : (device.is_local ? '🏠' : '🖥️');
        if (isDisabled) iconContent = '🚫';

        item.innerHTML = `
            <div class="device-icon">${iconContent}</div>
            <div class="device-info">
                <div class="device-name">${device.hostname || 'Unknown Host'}</div>
                <div class="device-sub">
                    <span>${device.ip}</span> | <span>${device.mac}</span>
                </div>
                <div class="device-sub"><strong>Vendor:</strong> ${device.vendor || 'Unknown'}</div>
            </div>
            <div class="device-actions"></div>
        `;

        const actionsContainer = item.querySelector('.device-actions');

        if (isUserOrRouter) {
            item.classList.add('non-actionable');
        } else if (isDisabled) {
            const unblockBtn = document.createElement('button');
            unblockBtn.className = 'btn btn-success';
            unblockBtn.textContent = 'Unblock';
            unblockBtn.onclick = (e) => {
                e.stopPropagation();
                enableDevice(device);
            };
            actionsContainer.appendChild(unblockBtn);
        } else {
            const blockBtn = document.createElement('button');
            blockBtn.className = 'btn btn-danger';
            blockBtn.textContent = 'Block';
            blockBtn.onclick = (e) => {
                e.stopPropagation();
                disableDevice(device);
            };
            actionsContainer.appendChild(blockBtn);
        }

        item.addEventListener('click', () => {
            if (deviceDetailsPanel) {
                document.querySelectorAll('.device-item.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                deviceDetailsPanel.innerHTML = `
                    <div class="detail-item"><div class="detail-label">IP Address</div><div class="detail-value">${device.ip}</div></div>
                    <div class="detail-item"><div class="detail-label">MAC Address</div><div class="detail-value">${device.mac}</div></div>
                    <div class="detail-item"><div class="detail-label">Hostname</div><div class="detail-value">${device.hostname || 'N/A'}</div></div>
                    <div class="detail-item"><div class="detail-label">Vendor</div><div class="detail-value">${device.vendor || 'N/A'}</div></div>
                    <div class="detail-item">
                        <div class="detail-label">Operating System</div>
                        <div class="detail-value">
                            ${device.os}
                            <span class="os-confidence os-confidence-${device.os_confidence || 'low'}">
                                (${device.os_confidence || 'low'}, ${device.os_method || 'unknown'})
                            </span>
                        </div>
                    </div>
                    ${device.is_gateway ? '<div class="detail-item"><div class="detail-label">Role</div><div class="detail-value">Gateway/Router</div></div>' : ''}
                    ${device.is_local ? '<div class="detail-item"><div class="detail-label">Role</div><div class="detail-value">This Device</div></div>' : ''}
                `;
                // Trigger port scan when a device is selected
                scanPorts(device.ip);
            }
        });

        if (isUserOrRouter) {
            if (userDeviceList) userDeviceList.appendChild(item);
        } else if (isDisabled) {
            if (disabledDevicesBox) disabledDevicesBox.appendChild(item);
        } else {
            if (resultsBody) resultsBody.appendChild(item);
        }
    }

    function saveDisabledDevices() {
        localStorage.setItem('disabledDevices', JSON.stringify(disabledDevices));
    }

    function saveLastScanDetails(scanType, results) {
        const timestamp = new Date().toLocaleString();
        const scanDetails = { timestamp, scanType, results };
        localStorage.setItem('lastScanDetails', JSON.stringify(scanDetails));
        localStorage.setItem('savedScanResults', JSON.stringify(results));
        updateLastScanDisplay(scanDetails);
    }

    function resetDeviceDetails() {
        if (deviceDetailsPanel) {
            deviceDetailsPanel.innerHTML = '<p class="details-prompt">Select a device to see details.</p>';
        }
    }

    function loadSavedScanResults() {
        if (resultsBody) {
            resultsBody.innerHTML = ''; // Always clear it first
        }
    
        let discoveredDevicesCount = 0;
        savedScanResults.forEach(device => {
            if (!disabledDevices.some(d => d.mac === device.mac)) {
                if (device.is_local || device.is_gateway) {
                    createDeviceItem(device, false, true);
                } else {
                    createDeviceItem(device, false);
                    discoveredDevicesCount++;
                }
            }
        });
    
        if (resultsBody && discoveredDevicesCount === 0) {
            resultsBody.innerHTML = '<div class="no-results">Run a scan to discover devices.</div>';
            resetDeviceDetails();
        }
    }

    async function scanPorts(ip) {
        const portResultContainer = document.getElementById('ports-scan-result-container');
        if (!portResultContainer) return;

        try {
            const response = await fetch(`/scan/ports?ip=${ip}`);
            const data = await response.json();

            if (response.ok) {
                if (data.ports && data.ports.length > 0) {
                    portResultContainer.innerHTML = `<span>${data.ports.join(', ')}</span>`;
                } else {
                    portResultContainer.innerHTML = `<span>No open ports found</span>`;
                }
            } else {
                portResultContainer.innerHTML = `<span class="error-message">${data.error || 'Failed to scan ports.'}</span>`;
            }
        } catch (error) {
            console.error('Port scan error:', error);
            portResultContainer.innerHTML = '<span class="error-message">Error scanning ports.</span>';
        }
    }

    async function performScan(endpoint) {
        const scanType = endpoint === 'scan/basic' ? 'Basic Scan' : 'Full Scan';
        showNotification(`Starting ${scanType}...`, 'info');
        resetDeviceDetails();

        try {
            const response = await fetch(`/${endpoint}`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);

            const data = await response.json();
            const results = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);
            
            if (resultsBody) resultsBody.innerHTML = '';
            if (userDeviceList) userDeviceList.innerHTML = '';

            let discoveredDevicesCount = 0;
            results.forEach(device => {
                const isDisabled = disabledDevices.some(d => d.mac === device.mac);
                if (device.is_local || device.is_gateway) {
                    createDeviceItem(device, false, true);
                } else if (!isDisabled) {
                    createDeviceItem(device, false);
                    discoveredDevicesCount++;
                }
            });

            if (resultsBody && discoveredDevicesCount === 0) {
                resultsBody.innerHTML = '<div class="no-results">No devices discovered in this scan.</div>';
            }

            saveLastScanDetails(scanType, results);
            showNotification(`${scanType} completed. Found ${results.length} devices.`, 'success');
            if (data.warning) showNotification(data.warning, 'warning');
            document.dispatchEvent(new CustomEvent('scanCompleted', { detail: { results, scanType } }));
            if (window.updateHistorySizes) window.updateHistorySizes();
            document.dispatchEvent(new Event('historyUpdated'));
        } catch (error) {
            console.error(`${scanType} failed:`, error);
            showNotification(`${scanType} failed: ${error.message}`, 'error');
        }
    }

    async function disableDevice(device) {
        showNotification(`Blocking ${device.mac}...`, 'info');
        try {
            const response = await fetch('/network/disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(device),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to block device');

            showNotification(data.message, 'success');
            const deviceElement = document.querySelector(`.device-item[data-mac="${device.mac}"]`);
            if (deviceElement) deviceElement.remove();

            disabledDevices.push(device);
            createDeviceItem(device, true);
            saveDisabledDevices();
        } catch (error) {
            showNotification(`Error blocking ${device.mac}: ${error.message}`, 'error');
        }
    }

    async function enableDevice(device) {
        showNotification(`Unblocking ${device.mac}...`, 'info');
        try {
            const response = await fetch('/network/enable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: device.ip, mac: device.mac }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to unblock device');

            showNotification(data.message, 'success');
            const deviceElement = document.querySelector(`.device-item[data-mac="${device.mac}"]`);
            if (deviceElement) deviceElement.remove();
            
            disabledDevices = disabledDevices.filter(d => d.mac !== device.mac);
            createDeviceItem(device, false);
            saveDisabledDevices();
        } catch (error) {
            showNotification(`Error unblocking ${device.mac}: ${error.message}`, 'error');
        }
    }

    async function loadDisabledDevices() {
        try {
            const response = await fetch('/network/disabled-devices');
            const serverDisabledDevices = await response.json();
            localStorage.setItem('disabledDevices', JSON.stringify(serverDisabledDevices));
            disabledDevices = serverDisabledDevices;

            if (disabledDevicesBox) disabledDevicesBox.innerHTML = '';
            disabledDevices.forEach(device => createDeviceItem(device, true));
        } catch (error) {
            console.error('Failed to load disabled devices:', error);
        }
    }

    if (basicBtn) basicBtn.addEventListener('click', () => performScan('scan/basic'));
    if (fullBtn) fullBtn.addEventListener('click', () => performScan('scan/full'));

    if (document.getElementById('scannerView')) {
        loadDisabledDevices();
        updateLastScanDisplay(lastScanDetails);
        loadSavedScanResults();
    }

    if (deviceSearchInput) {
        deviceSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const devices = resultsBody.querySelectorAll('.device-item');
            devices.forEach(device => {
                const ip = device.dataset.ip.toLowerCase();
                const mac = device.dataset.mac.toLowerCase();
                if (ip.includes(searchTerm) || mac.includes(searchTerm)) {
                    device.style.display = '';
                } else {
                    device.style.display = 'none';
                }
            });
        });
    }

    document.addEventListener('localStorageCleared', () => {
        if (resultsBody) {
            resultsBody.innerHTML = '<div class="no-results">Run a scan to discover devices.</div>';
        }
        if (userDeviceList) userDeviceList.innerHTML = '';
        if (lastScanTimestamp) lastScanTimestamp.textContent = '- Previous scan: None';
        savedScanResults = [];
        resetDeviceDetails();
    });
});