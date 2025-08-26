// JavaScript for MAC address bypass functionality
document.getElementById('bypassTab').addEventListener('click', async () => {
    try {
        const settingsResponse = await fetch('/settings');
        const settings = await settingsResponse.json();
        const bypassMode = settings.bypass_mode || 'registry';
        
        // Initial load of adapters - this will be refreshed when the toggle changes
        refreshAdapters(bypassMode);
        loadVendors();

    } catch (error) {
        showStatus(error.message, 'error');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Handle the toggle for showing ignored adapters
    const showIgnoredAdaptersToggle = document.getElementById('showIgnoreListToggle');
    if (showIgnoredAdaptersToggle) {
        showIgnoredAdaptersToggle.checked = localStorage.getItem('showIgnoredAdapters') === 'true';
        showIgnoredAdaptersToggle.addEventListener('change', () => {
            localStorage.setItem('showIgnoredAdapters', showIgnoredAdaptersToggle.checked);
            refreshAdapters();
        });
    }

    // --- Toolkit Overlay Logic ---
    const toggleToolkitBtn = document.getElementById('toggleToolkitBtn');
    const toolkitOverlay = document.getElementById('bypassToolkitOverlay');
    const vendorSelect = document.getElementById('vendorSelect');
    const vendorSearch = document.getElementById('vendorSearch');
    const generateMacBtn = document.getElementById('generateMacBtn');
    const generatedMacResult = document.getElementById('generatedMacResult');
    const copyMacBtn = document.getElementById('copyMacBtn');
    const verifyMacInput = document.getElementById('verifyMacInput');
    const verifyMacBtn = document.getElementById('verifyMacBtn');
    const verifyMacResult = document.getElementById('verifyMacResult');
    const generateValidMacBtn = document.getElementById('generateValidMacBtn');

    if (toggleToolkitBtn) {
        toggleToolkitBtn.addEventListener('click', () => {
            if (!toolkitOverlay) return;
            toolkitOverlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            // Initial fetch with empty query to avoid loading entire file
            if (vendorSelect && vendorSelect.options.length <= 1) {
                loadVendors('');
            }
        });
    }

    const closeToolkit = () => {
        if (!toolkitOverlay) return;
        toolkitOverlay.style.display = 'none';
        document.body.style.overflow = '';
    };

    if (toolkitOverlay) {
        toolkitOverlay.addEventListener('click', (e) => {
            if (e.target.classList.contains('toolkit-overlay')) {
                closeToolkit();
            }
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && toolkitOverlay.style.display === 'flex') closeToolkit();
        });
    }

    // Debounced search for vendors
    if (vendorSearch) {
        let searchTimeout;
        vendorSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            searchTimeout = setTimeout(() => {
                loadVendors(query);
            }, 300); // Debounce requests by 300ms
        });
    }

    if (generateValidMacBtn) {
        generateValidMacBtn.addEventListener('click', async () => {
            generatedMacResult.textContent = 'Generating...';
            generatedMacResult.style.color = 'var(--text-secondary)';
            copyMacBtn.style.display = 'none';
            try {
                const settingsResponse = await fetch('/settings/get?key=hardware_rng');
                const useHardwareRngData = await settingsResponse.json();
                const useHardwareRng = useHardwareRngData.value !== false;

                const response = await fetch('/bypass/generate-valid-mac', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hardware_rng: useHardwareRng })
                });
                const data = await response.json();
                if (!response.ok || data.error) throw new Error(data.error || 'Failed to generate MAC');
                generatedMacResult.textContent = data.mac;
                generatedMacResult.style.color = 'var(--text-primary)';
                copyMacBtn.style.display = 'inline-flex';
            } catch (err) {
                generatedMacResult.textContent = `Error: ${err.message}`;
                generatedMacResult.style.color = 'var(--error)';
            }
        });
    }

    if (generateMacBtn) {
        generateMacBtn.addEventListener('click', async () => {
            generatedMacResult.textContent = 'Generating...';
            generatedMacResult.style.color = 'var(--text-secondary)';
            copyMacBtn.style.display = 'none';
            // sanitize to 6 hex chars for OUI
            const selectedOui = (vendorSelect.value || '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
            if (!selectedOui || selectedOui.length !== 6) {
                generatedMacResult.textContent = 'Please select a vendor first.';
                generatedMacResult.style.color = 'var(--error)';
                return;
            }
            try {
                const response = await fetch('/bypass/generate-mac', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oui: selectedOui })
                });
                const data = await response.json();
                if (!response.ok || data.error) throw new Error(data.error || 'Failed to generate MAC');
                generatedMacResult.textContent = data.mac;
                generatedMacResult.style.color = 'var(--text-primary)';
                copyMacBtn.style.display = 'inline-flex';
            } catch (err) {
                generatedMacResult.textContent = `Error: ${err.message}`;
                generatedMacResult.style.color = 'var(--error)';
                copyMacBtn.style.display = 'none';
            }
        });
    }

    if (copyMacBtn) {
        copyMacBtn.addEventListener('click', () => {
            const mac = generatedMacResult.textContent;
            if (mac && mac !== 'N/A') {
                navigator.clipboard.writeText(mac)
                    .then(() => showNotification('MAC address copied!', 'success'))
                    .catch(() => showNotification('Failed to copy MAC.', 'error'));
            }
        });
    }

    function isValidUnicastLaa(mac) {
        if (!mac) return { valid: false, reason: 'MAC address is empty.', isUnicast: false, isLaa: false };
        const sanitized = mac.replace(/[-:.]/g, '');
        if (sanitized.length !== 12) return { valid: false, reason: 'Must be 12 hex characters long.', isUnicast: false, isLaa: false };
        if (!/^[0-9a-fA-F]{12}$/.test(sanitized)) return { valid: false, reason: 'Contains invalid characters.', isUnicast: false, isLaa: false };
        const firstOctet = parseInt(sanitized.slice(0, 2), 16);
        const isUnicast = (firstOctet & 1) === 0;
        const isLaa = (firstOctet & 2) !== 0;
        if (isUnicast && isLaa) return { valid: true, reason: 'Valid Unicast LAA MAC. Suitable for bypass.', isUnicast, isLaa };
        const reasons = [];
        if (!isUnicast) reasons.push('multicast (not unicast)');
        if (!isLaa) reasons.push('UAA (not LAA)');
        return { valid: false, reason: `Invalid for bypass: ${reasons.join(' and ')}.`, isUnicast, isLaa };
    }

    if (verifyMacBtn) {
        verifyMacBtn.addEventListener('click', () => {
            const mac = verifyMacInput.value;
            const result = isValidUnicastLaa(mac);
            verifyMacResult.innerHTML = '';

            if (!mac) {
                verifyMacResult.innerHTML = `<div class="validation-item invalid">Please enter a MAC address.</div>`;
                return;
            }

            const sanitized = mac.replace(/[-:.]/g, '');
            const validLength = sanitized.length === 12;
            const validChars = /^[0-9a-fA-F]{12}$/.test(sanitized);

            let lengthHtml = `<div class="validation-item ${validLength ? 'valid' : 'invalid'}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>${validLength ? 'Correct length (12 hex chars)' : 'Incorrect length'}</span>
            </div>`;

            let charsHtml = `<div class="validation-item ${validChars ? 'valid' : 'invalid'}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>${validChars ? 'Contains valid hex characters' : 'Contains invalid characters'}</span>
            </div>`;

            let unicastHtml = `<div class="validation-item ${result.isUnicast ? 'valid' : 'invalid'}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>${result.isUnicast ? 'Unicast Address' : 'Multicast Address (Invalid)'}</span>
            </div>`;
            
            let laaHtml = `<div class="validation-item ${result.isLaa ? 'valid' : 'warning'}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>${result.isLaa ? 'Locally Administered (LAA)' : 'Universally Administered (UAA)'}</span>
            </div>`;

            verifyMacResult.innerHTML = lengthHtml + charsHtml + unicastHtml + laaHtml;
        });
    }

    // Initial refresh of adapters list
    refreshAdapters();
});

async function loadVendors(query = '') {
    const vendorSelect = document.getElementById('vendorSelect');
    if (!vendorSelect) return;
    try {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        params.set('limit', '100');
        const response = await fetch('/bypass/vendors?' + params.toString());
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Failed to load vendors');

        vendorSelect.innerHTML = '<option value="">Select a Vendor</option>';
        // data is a mapping {OUI6HEX: "Vendor Name"}
        Object.entries(data).forEach(([oui, name]) => {
            const option = document.createElement('option');
            option.value = oui; // sanitized 6-hex OUI
            option.textContent = `${name} (${oui})`;
            vendorSelect.appendChild(option);
        });

        if (vendorSelect.options.length === 1) {
            vendorSelect.innerHTML = '<option value="">No matches</option>';
        }
    } catch (error) {
        vendorSelect.innerHTML = `<option value="">${error.message}</option>`;
        console.error('Error loading vendors:', error);
    }
}

async function refreshAdapters(forcedBypassMode = null) {
    try {
        const showIgnored = document.getElementById('showIgnoreListToggle')?.checked || false;
        
        const settingsResponse = await fetch('/settings');
        const settings = await settingsResponse.json();
        const bypassMode = forcedBypassMode || settings.bypass_mode || 'registry';
        
        const adaptersResponse = await fetch('/bypass/adapters?show_ignored=' + showIgnored);
        const adapters = await adaptersResponse.json();
        
        const list = document.getElementById('adapterList');
        if (!list) return;

        if (adapters.length === 0) {
            list.innerHTML = '<div class="no-results">No network adapters found.</div>';
            return;
        }
        
        const previousSelections = {};
        document.querySelectorAll('.bypass-mode-dropdown').forEach(dropdown => {
            const transport = dropdown.dataset.transport;
            if (transport) {
                previousSelections[transport] = dropdown.value;
            }
        });
        
        list.innerHTML = adapters.map(adapter => {
            const isRegistryMode = bypassMode === 'registry';
            return `
                <div class="adapter-card ${adapter.ignored ? 'ignored' : ''}">
                    <div class="adapter-card-header">
                        <div class="adapter-icon">🔌</div>
                        <div class="adapter-info">
                            <div class="adapter-name">${adapter.description}</div>
                            <div class="adapter-transport"><code>${adapter.transport}</code></div>
                        </div>
                        ${adapter.default ? '<div class="adapter-badge default">Default</div>' : ''}
                        ${adapter.ignored ? '<div class="adapter-badge ignored">Ignored</div>' : ''}
                    </div>
                    <div class="adapter-card-body">
                        ${isRegistryMode ? `
                            <div class="control-group">
                                <label for="bypassMode-${adapter.transport}">Method:</label>
                                <select id="bypassMode-${adapter.transport}" class="bypass-mode-dropdown dropdown" data-transport="${adapter.transport}">
                                    <option value="standard">Standard</option>
                                    <option value="tmac">Tmac</option>
                                    <option value="randomized">Randomized</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </div>
                            <div class="control-group manual-mac-input-container" id="manualMacContainer-${adapter.transport}" style="display: none;">
                                <label for="manualMac-${adapter.transport}">MAC Address:</label>
                                <input type="text" id="manualMac-${adapter.transport}" class="hotspot-input manual-mac-input" placeholder="00:1A:2B:3C:4D:5E">
                            </div>
                        ` : ''}
                    </div>
                    <div class="adapter-card-footer">
                        <button class="btn btn-primary btn-bypass" 
                                onclick="changeMac('${adapter.transport}')" 
                                ${adapter.ignored ? 'disabled' : ''}>
                            Bypass (${bypassMode})
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.bypass-mode-dropdown').forEach(dropdown => {
            const transport = dropdown.dataset.transport;
            if (transport && previousSelections[transport]) {
                dropdown.value = previousSelections[transport];
            }
            // Add event listener for showing/hiding manual input
            dropdown.addEventListener('change', (e) => {
                const container = document.getElementById(`manualMacContainer-${transport}`);
                if (container) {
                    container.style.display = e.target.value === 'manual' ? '' : 'none';
                }
            });
            // Trigger change event to set initial state
            dropdown.dispatchEvent(new Event('change'));
        });
        
    } catch (error) {
        showStatus(error.message, 'error');
    }
}

function changeMac(transport) {
    showStatus('Starting MAC address bypass...', 'info');
    
    const dropdown = document.getElementById(`bypassMode-${transport}`);
    const macMode = dropdown ? dropdown.value : 'standard';
    
    showStatus('Processing...', 'info');
    
    (async function() {
        try {
            const settingsResponse = await fetch('/settings/get?key=hardware_rng');
            const useHardwareRngData = await settingsResponse.json();
            const useHardwareRng = useHardwareRngData.value !== 'false';
            
            let payload = { 
                transport: transport,
                mode: macMode,
                hardware_rng: useHardwareRng
            };

            if (macMode === 'manual') {
                const manualMacInput = document.getElementById(`manualMac-${transport}`);
                const manualMac = manualMacInput ? manualMacInput.value.trim() : '';
                if (!manualMac) {
                    throw new Error('Manual MAC address cannot be empty.');
                }
                payload.manual_mac = manualMac;
            }
            
            const changeResponse = await fetch('/bypass/change-mac', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });

            const data = await changeResponse.json();
            if (data.error) throw new Error(data.error);
            
            showStatus(`${data.message}: ${data.new_mac}`, 'success');

            // Perform Post-Bypass Connectivity Check (PBCC) if enabled
            const pbccSettingsResponse = await fetch('/settings/get?key=pbcc_enabled');
            const pbccData = await pbccSettingsResponse.json();
            if (pbccData.value === true) {
                showStatus('Performing Post-Bypass Connectivity Check (PBCC)...', 'info');
                try {
                    // Use the existing ping endpoint for the check
                    const pingResponse = await fetch('/api/ping?ip=google.com');
                    const pingData = await pingResponse.json();
                    if (pingData.success && !pingData.processing) {
                        showStatus(`PBCC successful: Connected to internet (ping: ${pingData.time}ms).`, 'success');
                    } else {
                        showStatus('PBCC failed: Could not confirm internet connectivity.', 'warning');
                    }
                } catch (pingError) {
                    showStatus(`PBCC failed: ${pingError.message}`, 'error');
                }
            }
            
            if (window.updateHistorySizes) {
                window.updateHistorySizes();
            }
            document.dispatchEvent(new Event('historyUpdated'));

        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
        }
    })();
}

function showStatus(message, type) {
    const status = document.getElementById('statusMessage');
    if (!status) return; 
    status.textContent = message;
    status.className = `status-message status-${type}`;
    status.style.display = 'block';
}