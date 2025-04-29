// Hotspot management functionality
document.addEventListener('DOMContentLoaded', () => {
    const hotspotTab = document.getElementById('hotspotTab');
    const hotspotView = document.getElementById('hotspotView');
    const toggleHotspotBtn = document.getElementById('toggleHotspotBtn');
    const hotspotName = document.getElementById('hotspotName');
    const hotspotPassword = document.getElementById('hotspotPassword');
    const saveHotspotSettingsBtn = document.getElementById('saveHotspotSettingsBtn');
    const connectedDevicesList = document.getElementById('connectedDevicesList');
    const deviceControlPanel = document.querySelector('.device-control-panel');
    const selectedDeviceInfo = document.getElementById('selectedDeviceInfo');

    let hotspotEnabled = false;
    let connectedDevices = [];
    let selectedDevice = null;
    let refreshInterval = null;
    let lastHotspotStatus = null; // Track last status to avoid duplicate notifications

    // Helper to check if hotspot tab is active
    function isHotspotTabActive() {
        return window.location.hash === '#hotspot' || hotspotView.style.display === 'block';
    }

    // Helper to open Windows Hotspot settings
    function openWindowsHotspotSettings() {
        // This will only work on Windows with ms-settings URI support
        window.open('ms-settings:network-mobilehotspot', '_blank');
    }

    // Helper to check hotspot status and only then refresh devices
    async function checkAndRefreshConnectedDevices() {
        // Only run if hotspot tab is active
        if (!isHotspotTabActive()) return;

        try {
            const response = await fetch('/hotspot/status');
            const result = await response.json();
            if (response.ok) {
                if (lastHotspotStatus !== result.enabled) {
                    updateHotspotStatus(result.enabled);
                    lastHotspotStatus = result.enabled;
                }
                hotspotEnabled = !!result.enabled;
            } else {
                hotspotEnabled = false;
            }
        } catch (error) {
            hotspotEnabled = false;
        }

        // Only refresh devices if hotspot is enabled
        if (hotspotEnabled) {
            refreshConnectedDevices();
        }
    }

    hotspotTab.addEventListener('click', () => {
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });
        hotspotView.style.display = 'block';
        
        // Fetch initial hotspot status and settings
        fetchHotspotStatus();
        fetchHotspotSettings();
        
        // Start refreshing connected devices list ONLY if hotspot is running
        checkAndRefreshConnectedDevices();
        
        // Set up interval to refresh devices ONLY if not already set
        if (!refreshInterval) {
            refreshInterval = setInterval(checkAndRefreshConnectedDevices, 5000);
        }
    });

    // Switch to another tab - clear the refresh interval
    document.querySelectorAll('.nav-menu a').forEach(tab => {
        if (tab.id !== 'hotspotTab') {
            tab.addEventListener('click', () => {
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                    refreshInterval = null;
                }
            });
        }
    });

    // Toggle hotspot state
    toggleHotspotBtn.addEventListener('click', async () => {
        try {
            toggleHotspotBtn.disabled = true;
            
            const action = hotspotEnabled ? 'disable' : 'enable';
            const response = await fetch(`/hotspot/${action}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification(result.message, 'success');
                updateHotspotStatus(!hotspotEnabled);
            } else {
                showNotification(result.error || 'Failed to toggle hotspot', 'error');
            }
        } catch (error) {
            console.error('Error toggling hotspot:', error);
            showNotification('Error toggling hotspot', 'error');
        } finally {
            toggleHotspotBtn.disabled = false;
        }
    });

    // Save hotspot settings
    saveHotspotSettingsBtn.addEventListener('click', async () => {
        const name = hotspotName.value.trim();
        const password = hotspotPassword.value.trim();
        
        if (!name) {
            showNotification('Please enter a network name', 'error');
            return;
        }
        
        if (password.length < 8) {
            showNotification('Password must be at least 8 characters', 'error');
            return;
        }
        
        try {
            saveHotspotSettingsBtn.disabled = true;
            
            const response = await fetch('/hotspot/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    password: password
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification(result.message, 'success');
            } else {
                showNotification(result.error || 'Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Error saving hotspot settings:', error);
            showNotification('Error saving hotspot settings', 'error');
        } finally {
            saveHotspotSettingsBtn.disabled = false;
        }
    });

    async function fetchHotspotStatus() {
        try {
            const response = await fetch('/hotspot/status');
            const result = await response.json();
            
            if (response.ok) {
                updateHotspotStatus(result.enabled);
            } else {
                showNotification(result.error || 'Failed to get hotspot status', 'error');
            }
        } catch (error) {
            console.error('Error fetching hotspot status:', error);
        }
    }

    async function fetchHotspotSettings() {
        try {
            const response = await fetch('/hotspot/settings');
            const result = await response.json();
            
            if (response.ok) {
                hotspotName.value = result.name || '';
            }
        } catch (error) {
            console.error('Error fetching hotspot settings:', error);
        }
    }

    async function refreshConnectedDevices() {
        try {
            const response = await fetch('/hotspot/connected-devices');
            const result = await response.json();
    
            if (response.ok) {
                const prevSelectedId = selectedDevice ? selectedDevice.id : null;
    
                connectedDevices = result.devices.map(device => {
                    let fixedMac = device.mac;
                    let fixedName = device.name;
                    if (device.mac && device.mac.length < 5 && 
                        device.name && device.name.toLowerCase().startsWith('c') && 
                        device.name.length <= 3) {
                        fixedMac = `${device.mac}:${device.name.toLowerCase()}:??:??:??:??`;
                        fixedName = `Client ${device.ip.split('.')[3] || ''}`;
                    }
                    if (fixedMac && fixedMac.length === 12 && !fixedMac.includes(':') && !fixedMac.includes('-')) {
                        fixedMac = fixedMac.match(/.{1,2}/g).join(':');
                    }
                    return {
                        id: device.id || device.mac || generateTempId(),
                        name: fixedName || 'Unknown Device',
                        ip: device.ip || 'Unknown IP',
                        mac: fixedMac || 'Unknown MAC',
                        connectedSince: device.connectedSince || new Date().toLocaleString(),
                        blocked: !!device.blocked,
                        _original: {
                            mac: device.mac,
                            name: device.name
                        }
                    };
                });
    
                // Check if the previously selected device still exists in the new list
                if (prevSelectedId && connectedDevices.some(d => d.id === prevSelectedId)) {
                    selectedDevice = connectedDevices.find(d => d.id === prevSelectedId);
                } else {
                    selectedDevice = null;
                }
    
                updateDevicesList();
            }
        } catch (error) {
            console.error('Error fetching connected devices:', error);
        }
    }

    // Generate a temporary id for devices that don't have one
    function generateTempId() {
        return 'temp-' + Math.random().toString(36).substring(2, 10);
    }

    // Helper function to update the devices list UI
    function updateDevicesList() {
        connectedDevicesList.innerHTML = '';
        
        if (connectedDevices.length === 0) {
            const noDevices = document.createElement('div');
            noDevices.className = 'no-devices-message';
            noDevices.textContent = 'No devices connected';
            connectedDevicesList.appendChild(noDevices);
            deviceControlPanel.style.display = 'none';
            selectedDevice = null;
            return;
        }
        
        connectedDevices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = `device-item ${selectedDevice && selectedDevice.id === device.id ? 'selected' : ''}`;
            deviceItem.innerHTML = `
                <div class="device-name">${sanitizeHtml(device.name)}</div>
                <div class="device-info">
                    <div>IP: ${sanitizeHtml(device.ip)}</div>
                    <div>MAC: ${sanitizeHtml(device.mac)}</div>
                    ${device.blocked ? '<div class="device-blocked">BLOCKED</div>' : ''}
                </div>
            `;
            
            deviceItem.addEventListener('click', () => {
                const isAlreadySelected = deviceItem.classList.contains('selected');
                document.querySelectorAll('.device-item').forEach(item => {
                    item.classList.remove('selected');
                });
                if (!isAlreadySelected) {
                    deviceItem.classList.add('selected');
                    selectedDevice = device;
                    updateDeviceControls();
                } else {
                    selectedDevice = null;
                    updateDeviceControls();
                }
            });
            
            connectedDevicesList.appendChild(deviceItem);
        });
    }

    // Helper function to update the hotspot status UI
    function updateHotspotStatus(enabled) {
        hotspotEnabled = enabled;
        lastHotspotStatus = enabled;

        // Update the toggle button text and color
        function styleToggleButton(btn, enabled) {
            btn.textContent = enabled ? 'Disable Hotspot' : 'Enable Hotspot';
            btn.style.backgroundColor = enabled ? '#F44336' : '#2196F3';
            btn.style.color = '#fff';
        }

        const statusPanel = document.querySelector('.hotspot-status-panel');
        if (statusPanel) {
            const toggleButton = document.getElementById('toggleHotspotBtn');
            const toggleButtonParent = toggleButton ? toggleButton.parentNode : null;

            statusPanel.innerHTML = '';

            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'status-indicator';

            const statusIconDiv = document.createElement('div');
            statusIconDiv.id = 'hotspotStatusIcon';
            statusIconDiv.className = enabled ? 'status-icon active' : 'status-icon inactive';
            statusIndicator.appendChild(statusIconDiv);

            const statusTextSpan = document.createElement('span');
            statusTextSpan.id = 'hotspotStatusText';
            statusTextSpan.textContent = enabled ? 'Hotspot is active' : 'Hotspot is inactive';
            statusIndicator.appendChild(statusTextSpan);

            const infoIcon = document.createElement('div');
            infoIcon.className = 'inline-info-icon';
            infoIcon.textContent = '?';
            infoIcon.style.marginLeft = '8px';

            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.innerHTML = `
                <h3>WiFi Hotspot Feature</h3>
                <div class="tooltip-item">
                    <h4>Hardware Requirement</h4>
                    <p>This feature requires WiFi hardware to use, if your device supports WiFi then it should work.</p>
                </div>
                <div class="tooltip-warning">
                    Note: Devices with only ethernet support WILL NOT WORK.
                </div>
            `;
            infoIcon.appendChild(tooltip);
            statusIndicator.appendChild(infoIcon);

            statusPanel.appendChild(statusIndicator);

            const buttonRow = document.createElement('div');
            buttonRow.style.display = 'flex';
            buttonRow.style.gap = '10px';
            buttonRow.style.marginTop = '15px';

            let btn;
            if (toggleButtonParent === statusPanel && toggleButton) {
                btn = toggleButton;
            } else {
                btn = document.createElement('button');
                btn.id = 'toggleHotspotBtn';
                btn.className = 'hotspot-btn';
            }
            styleToggleButton(btn, enabled);

            // Add the "Open Windows Hotspot Settings" button
            let openSettingsBtn = document.createElement('button');
            openSettingsBtn.id = 'openHotspotSettingsBtn';
            openSettingsBtn.className = 'hotspot-btn';
            openSettingsBtn.style.backgroundColor = '#555';
            openSettingsBtn.style.color = '#fff';
            openSettingsBtn.style.fontSize = '0.95em';
            openSettingsBtn.textContent = 'Open Windows Hotspot Settings';
            openSettingsBtn.onclick = openWindowsHotspotSettings;

            // Add both buttons to the row
            buttonRow.appendChild(btn);
            buttonRow.appendChild(openSettingsBtn);
            statusPanel.appendChild(buttonRow);

            // Remove previous event listeners by replacing the button
            btn.onclick = async () => {
                try {
                    btn.disabled = true;
                    const action = hotspotEnabled ? 'disable' : 'enable';
                    showNotification(`${action === 'enable' ? 'Starting' : 'Stopping'} hotspot...`, 'info');
                    const response = await fetch(`/hotspot/${action}`, { method: 'POST' });
                    const result = await response.json();

                    if (response.ok) {
                        if (action === 'enable') {
                            showNotification('Hotspot started successfully!', 'success');
                            await fetchHotspotStatus();
                        } else {
                            showNotification('Hotspot stopped.', 'info');
                            await fetchHotspotStatus();
                        }
                        updateHotspotStatus(!hotspotEnabled);
                    } else {
                        showNotification(result.error || 'Failed to toggle hotspot', 'error');
                    }
                } catch (error) {
                    console.error('Error toggling hotspot:', error);
                    showNotification('Error toggling hotspot', 'error');
                } finally {
                    btn.disabled = false;
                }
            };
        }
    }

    function showNotification(message, type = 'success') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            // fallback: colored console log and alert
            const color = type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196F3';
            console.log(`%c[${type.toUpperCase()}] ${message}`, `color: ${color}; font-weight: bold;`);
            if (type === 'error') {
                alert(message);
            }
        }
    }

    // Helper function to update the device controls UI
    function updateDeviceControls() {
        if (!selectedDevice) {
            deviceControlPanel.style.display = 'none';
            return;
        }
        
        deviceControlPanel.style.display = 'block';
        selectedDeviceInfo.innerHTML = `
            <div><strong>Name:</strong> ${selectedDevice.name || 'Unknown Device'}</div>
            <div><strong>IP Address:</strong> ${selectedDevice.ip}</div>
            <div><strong>MAC Address:</strong> ${selectedDevice.mac}</div>
            <div><strong>Connected Since:</strong> ${selectedDevice.connectedSince || 'Unknown'}</div>
        `;
        
        updateBlockButtonText();
    }

    // Helper function to update block button text (now just for kick)
    function updateBlockButtonText() {
        if (!selectedDevice) return;
        
        blockDeviceBtn.textContent = 'Kick Device';
        blockDeviceBtn.style.backgroundColor = '#F44336';
    }
    
    // Helper function to sanitize HTML content
    function sanitizeHtml(text) {
        const element = document.createElement('div');
        element.textContent = text;
        return element.innerHTML;
    }
});