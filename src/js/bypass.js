// JavaScript for MAC address bypass functionality
document.getElementById('bypassTab').addEventListener('click', async () => {
    try {
        const settingsResponse = await fetch('/settings');
        const settings = await settingsResponse.json();
        const bypassMode = settings.bypass_mode || 'registry';
        
        // Initial load of adapters - this will be refreshed when the toggle changes
        refreshAdapters(bypassMode);

    } catch (error) {
        showStatus(error.message, 'error');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Handle the toggle for showing ignored adapters
    const showIgnoredAdaptersToggle = document.getElementById('showIgnoreListToggle');
    if (showIgnoredAdaptersToggle) {
        // Load preference from localStorage
        showIgnoredAdaptersToggle.checked = localStorage.getItem('showIgnoredAdapters') === 'true';
        
        showIgnoredAdaptersToggle.addEventListener('change', () => {
            localStorage.setItem('showIgnoredAdapters', showIgnoredAdaptersToggle.checked);
            // Refresh the adapter list to include or exclude ignored adapters
            refreshAdapters();
        });
    }
    
    // Initial refresh of adapters list
    refreshAdapters();
});

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
                                </select>
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