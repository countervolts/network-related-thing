// app.js
function showNotification(message, type = 'success') {
    const notificationContainer = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationContainer.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => notification.remove(), 3000);
}

let disabledDevicesBox;

document.addEventListener('DOMContentLoaded', () => {
    const basicBtn = document.getElementById('basicScanBtn');
    const fullBtn = document.getElementById('fullScanBtn');
    const resultsBody = document.getElementById('resultsBody');
    disabledDevicesBox = document.getElementById('disabledDevices');
    const disableBtn = document.getElementById('disableBtn');
    const enableBtn = document.getElementById('enableBtn');
    const lastScanTimestamp = document.getElementById('lastScanTimestamp');

    const userDeviceSection = document.createElement('div');
    userDeviceSection.id = 'userDeviceSection';
    userDeviceSection.style.backgroundColor = '#1e1e1e'; 
    userDeviceSection.style.padding = '10px';
    userDeviceSection.style.borderBottom = '1px solid #444';
    userDeviceSection.innerHTML = `
        <h3 style="margin: 0; color: #ffffff;">Your Device and Router</h3>
        <div id="userDeviceList" class="results-body"></div>
    `;
    resultsBody.parentElement.insertBefore(userDeviceSection, resultsBody);

    const userDeviceList = document.getElementById('userDeviceList');

    let selectedDevices = [];
    let selectedDisabledDevices = [];
    let disabledDevices = JSON.parse(localStorage.getItem('disabledDevices')) || [];
    let lastScanDetails = JSON.parse(localStorage.getItem('lastScanDetails')) || null;
    let savedScanResults = JSON.parse(localStorage.getItem('savedScanResults')) || [];
    let userIp = null;
    let routerIp = null;

    function updateButtons() {
        disableBtn.disabled = selectedDevices.length === 0;
        enableBtn.disabled = selectedDisabledDevices.length === 0;
    }

    function clearSelections() {
        selectedDevices = [];
        selectedDisabledDevices = [];
        document.querySelectorAll('.result-item.selected').forEach(item => item.classList.remove('selected'));
        document.querySelectorAll('.result-item.disabled.selected').forEach(item => item.classList.remove('selected'));
        updateButtons();
    }

    function toggleDeviceSelection(deviceElement, device, isDisabled) {
        const isSelected = deviceElement.classList.contains('selected');
    
        if (isSelected) {
            deviceElement.classList.remove('selected');
            if (isDisabled) {
                selectedDisabledDevices = selectedDisabledDevices.filter(d => d.mac !== device.mac);
            } else {
                selectedDevices = selectedDevices.filter(d => d.mac !== device.mac);
            }
        } else {
            // Clear selections from the other list
            if (isDisabled) {
                selectedDevices = [];
                document.querySelectorAll('.result-item.selected:not(.disabled)').forEach(item => item.classList.remove('selected'));
            } else {
                selectedDisabledDevices = [];
                document.querySelectorAll('.result-item.disabled.selected').forEach(item => item.classList.remove('selected'));
            }
    
            deviceElement.classList.add('selected');
            if (isDisabled) {
                selectedDisabledDevices.push(device);
            } else {
                selectedDevices.push(device);
            }
        }
    
        updateButtons();
    }

    function createDeviceItem(device, isDisabled = false, isUserOrRouter = false) {
        const item = document.createElement('div');
        item.className = `result-item ${isDisabled ? 'disabled' : ''}`;
        item.innerHTML = `
            <div class="ip">${device.ip}</div>
            <div class="mac">${device.mac}</div>
            <div class="hostname">${device.hostname}</div>
            <div class="vendor">${device.vendor}</div>
        `;
        item.dataset.ip = device.ip;
        item.dataset.mac = device.mac;

        if (isUserOrRouter) {
            item.classList.add('non-selectable');
            userDeviceList.appendChild(item); // Add to the user's device section
        } else if (isDisabled) {
            item.addEventListener('click', () => toggleDeviceSelection(item, device, true));
            disabledDevicesBox.appendChild(item); // Add to the Disabled Devices box
        } else {
            item.addEventListener('click', () => toggleDeviceSelection(item, device, false));
            resultsBody.appendChild(item);
        }
    }

    function saveDisabledDevices() {
        localStorage.setItem('disabledDevices', JSON.stringify(disabledDevices));
    }

    function saveLastScanDetails(scanType, results) {
        const timestamp = new Date().toLocaleString();
        const scanDetails = {
            timestamp,
            scanType,
            results,
        };
        localStorage.setItem('lastScanDetails', JSON.stringify(scanDetails));
        localStorage.setItem('savedScanResults', JSON.stringify(results));
        updateLastScanDisplay(scanDetails);
    }

    function updateLastScanDisplay(scanDetails) {
        if (scanDetails) {
            lastScanTimestamp.textContent = `- Previous scan: ${scanDetails.timestamp} (${scanDetails.scanType})`;
        } else {
            lastScanTimestamp.textContent = '- Previous scan: None';
        }
    }

    function loadSavedScanResults() {
        savedScanResults.forEach(device => {
            if (!disabledDevices.some(d => d.mac === device.mac)) {
                if (device.is_local || device.is_gateway) {
                    createDeviceItem(device, false, true);
                } else {
                    createDeviceItem(device, false);
                }
            }
        });
    }

    async function performScan(endpoint) {
        const scanType = endpoint === 'scan/basic' ? 'Basic Scan' : 'Full Scan';
        console.log(`Starting ${scanType}...`);

        try {
            const response = await fetch(`http://localhost:5000/${endpoint}`);
            console.log(`Response received for ${scanType}:`, response);

            if (!response.ok) {
                throw new Error(`Failed to perform ${scanType}. Status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Data received for ${scanType}:`, data);

            const results = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];
            resultsBody.innerHTML = '';
            userDeviceList.innerHTML = '';

            results.forEach(device => {
                // Check if the device is in the disabledDevices list
                const isDisabled = disabledDevices.some(d => d.mac === device.mac);

                if (device.is_local || device.is_gateway) {
                    createDeviceItem(device, false, true); // Add to the user's device section
                } else if (!isDisabled) {
                    createDeviceItem(device, false); // Add to the active devices list
                } else {
                    console.log(`Skipping disabled device: ${device.mac}`);
                }
            });

            saveLastScanDetails(scanType, results);
            showNotification(`${scanType} completed successfully. Found ${results.length} devices.`, 'success');
        } catch (error) {
            console.error(`${scanType} failed:`, error);
            showNotification(`${scanType} failed: ${error.message}`, 'error');
        }

        clearSelections();
    }

    basicBtn.addEventListener('click', () => {
        console.log('Basic Scan button clicked'); 
        showNotification('Starting Basic Scan...', 'info'); 
        performScan('scan/basic');
    });
    
    fullBtn.addEventListener('click', () => {
        console.log('Full Scan button clicked'); 
        showNotification('Starting Full Scan...', 'info');
        performScan('scan/full');
    });

    disableBtn.addEventListener('click', async () => {
        if (selectedDevices.length === 0) {
            console.log('No devices selected for disabling.');
            return;
        }

        // Show a notification that the server is processing the disable request
        showNotification(`Processing disable for ${selectedDevices.length} device(s)...`, 'info');
        console.log(`Disabling ${selectedDevices.length} device(s):`, selectedDevices);

        for (const device of selectedDevices) {
            try {
                console.log(`Sending disable request for device:`, device);
                const response = await fetch('/network/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(device),
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`Server response for disabling device ${device.mac}:`, data);
                    showNotification(data.message, 'success');

                    const deviceElement = [...resultsBody.children].find(
                        el => el.dataset.mac === device.mac
                    );
                    if (deviceElement) {
                        console.log(`Removing device ${device.mac} from resultsBody.`);
                        resultsBody.removeChild(deviceElement); // Remove from results
                    } else {
                        console.log(`Device element for ${device.mac} not found in resultsBody.`);
                    }

                    console.log(`Adding device ${device.mac} to Disabled Devices box.`);
                    createDeviceItem(device, true);
                    disabledDevices.push(device); 
                } else {
                    const errorData = await response.json();
                    console.error(`Failed to disable device ${device.mac}:`, errorData);
                    showNotification(errorData.error || `Failed to disable device: ${device.mac}`, 'error');
                }
            } catch (error) {
                console.error(`Error disabling device ${device.mac}:`, error);
                showNotification(`Error disabling device ${device.mac}: ${error.message}`, 'error');
            }
        }

        // Clear selections and save the updated disabled devices list
        console.log('Clearing selections and saving disabled devices.');
        clearSelections();
        saveDisabledDevices();
        console.log('Disabled devices saved:', disabledDevices);
    });

    enableBtn.addEventListener('click', async () => {
        if (selectedDisabledDevices.length === 0) {
            console.log('No devices selected for enabling.');
            return;
        }

        // Show a notification that the server is processing the enable request
        showNotification(`Processing enable for ${selectedDisabledDevices.length} device(s)...`, 'info');
        console.log(`Enabling ${selectedDisabledDevices.length} device(s):`, selectedDisabledDevices);

        for (const device of selectedDisabledDevices) {
            try {
                const response = await fetch('/network/enable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip: device.ip, mac: device.mac }),
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`Server response for enabling device ${device.mac}:`, data);
                    showNotification(data.message, 'success');

                    // Remove the device from the Disabled Devices box
                    const deviceElement = [...disabledDevicesBox.children].find(
                        el => el.dataset.mac === device.mac
                    );
                    if (deviceElement) {
                        console.log(`Removing device ${device.mac} from disabledDevicesBox.`);
                        disabledDevicesBox.removeChild(deviceElement);
                    }

                    // Remove the device from the disabledDevices array
                    disabledDevices = disabledDevices.filter(d => d.mac !== device.mac);
                } else {
                    const errorData = await response.json();
                    console.error(`Failed to enable device ${device.mac}:`, errorData);
                    showNotification(errorData.error || `Failed to enable device: ${device.mac}`, 'error');
                }
            } catch (error) {
                console.error(`Error enabling device ${device.mac}:`, error);
                showNotification(`Error enabling device ${device.mac}: ${error.message}`, 'error');
            }
        }

        // Clear selections and save the updated disabled devices list
        clearSelections();
        saveDisabledDevices();
        console.log('Disabled devices updated:', disabledDevices);
    });

    async function loadDisabledDevices() {
        try {
            const response = await fetch('/network/disabled-devices');
            const serverDisabledDevices = await response.json();

            // Update local storage to match the server's state
            localStorage.setItem('disabledDevices', JSON.stringify(serverDisabledDevices));
            disabledDevices = serverDisabledDevices;

            // Clear the disabled devices box
            disabledDevicesBox.innerHTML = '';

            // Populate the disabled devices box
            disabledDevices.forEach(device => {
                createDeviceItem(device, true); // Add to the Disabled Devices box
            });

            console.log('Disabled devices synchronized with the server.');
        } catch (error) {
            console.error('Failed to load disabled devices:', error);
        }
    }

    // Load disabled devices on page load
    loadDisabledDevices();

    // Load last scan details and results from localStorage on page load
    updateLastScanDisplay(lastScanDetails);
    loadSavedScanResults();

    document.addEventListener('localStorageCleared', () => {
        resultsBody.innerHTML = '';
        userDeviceList.innerHTML = '';
        lastScanTimestamp.textContent = '- Previous scan: None';
    });

    const bypassView = document.getElementById('bypassView');
    const adapterList = document.getElementById('adapterList');
    const statusMessage = document.getElementById('statusMessage');

    const activeDevicesBox = document.getElementById('activeDevices');
    
    function showBypassStatus(message, type = 'success') {
        statusMessage.textContent = message;
        statusMessage.className = `status-message status-${type}`;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }

    async function loadAdapters() {
        try {
            const response = await fetch('/bypass/adapters');
            const adapters = await response.json();
            
            adapterList.innerHTML = adapters.map(adapter => `
                <div class="adapter-item">
                    <h3>${adapter.description} ${adapter.default ? '(Default)' : ''}</h3>
                    <p>Transport Name: <code>${adapter.transport}</code></p>
                    <button class="btn-bypass" 
                            data-transport="${adapter.transport}">
                        Initiate Bypass
                    </button>
                </div>
            `).join('');

            document.querySelectorAll('.btn-bypass').forEach(button => {
                button.addEventListener('click', () => changeMac(button.dataset.transport));
            });
        } catch (error) {
            showBypassStatus(`Error loading adapters: ${error.message}`, 'error');
        }
    }

    async function changeMac(transport) {
        try {
            const response = await fetch('/bypass/change-mac', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ transport: transport })
            });
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            showBypassStatus(`${data.message}: ${data.new_mac} - ${data.note}`, 'success');
            showNotification('MAC address changed successfully!', 'info');
        } catch (error) {
            showBypassStatus(`Error: ${error.message}`, 'error');
        }
    }

    const scannerTab = document.getElementById('scannerTab');
    const bypassTab = document.getElementById('bypassTab');
    const settingsTab = document.getElementById('settingsTab');
    const miscTab = document.getElementById('miscTab');
    const scannerView = document.getElementById('scannerView');
    const settingsView = document.getElementById('settingsView');
    const miscView = document.getElementById('miscView');

    function hideAllViews() {
        scannerView.style.display = 'none';
        bypassView.style.display = 'none';
        settingsView.style.display = 'none';
        miscView.style.display = 'none';
        clearSelections(); // Clear selections when switching tabs
    }

    scannerTab.addEventListener('click', () => {
        hideAllViews();
        scannerView.style.display = 'block';
    });

    bypassTab.addEventListener('click', () => {
        hideAllViews();
        bypassView.style.display = 'block';
    });

    settingsTab.addEventListener('click', () => {
        hideAllViews();
        settingsView.style.display = 'block';
    });

    miscTab.addEventListener('click', () => {
        hideAllViews();
        miscView.style.display = 'block';
    });

    // Initial load
    document.addEventListener('localStorageCleared', () => {
        resultsBody.innerHTML = '';
        userDeviceList.innerHTML = '';
        lastScanTimestamp.textContent = '- Previous scan: None';
        showNotification('Scanner tab updated after clearing local storage.', 'info');  
    });

    checkServerStart();
});

function clearDisabledDevices() {
    console.log('Clearing disabled devices from local storage.');
    localStorage.removeItem('disabledDevices');
    disabledDevices = [];
    if (disabledDevicesBox) {
        disabledDevicesBox.innerHTML = '';
    }
}

// Clear disabled devices when the server starts
async function checkServerStart() {
    try {
        const response = await fetch('/server/start');
        if (response.ok) {
            const data = await response.json();
            console.log(data.message);
            clearDisabledDevices();
        }
    } catch (error) {
        console.error('Failed to check server start:', error);
    }
}

// Call this function on page load
document.addEventListener('DOMContentLoaded', () => {
    checkServerStart();
});