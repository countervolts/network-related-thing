// JavaScript for MAC address bypass functionality
document.getElementById('bypassTab').addEventListener('click', async () => {
    try {
        const settingsResponse = await fetch('/settings');
        const settings = await settingsResponse.json();
        const bypassMode = settings.bypass_mode || 'registry';
        const adaptersResponse = await fetch('/bypass/adapters');
        const adapters = await adaptersResponse.json();

        // Add the info icon and tooltip to the bypass section only for registry mode
        const bypassSection = document.querySelector('.bypass-section');
        if (bypassSection) {
            // Remove any existing info icon to avoid duplicates
            const existingTooltip = bypassSection.querySelector('.tooltip-container');
            if (existingTooltip) {
                existingTooltip.remove();
            }
            
            // Only add tooltip for registry mode
            if (bypassMode === 'registry') {
                // Create and add the info icon at the correct position
                const infoContainer = document.createElement('div');
                infoContainer.className = 'tooltip-container';
                
                const infoIcon = document.createElement('div');
                infoIcon.className = 'info-icon';
                infoIcon.textContent = '?';
                
                const tooltip = document.createElement('div');
                tooltip.className = 'tooltip';
                tooltip.innerHTML = `
                    <h3>MAC Address Change Options</h3>
                    
                    <div class="tooltip-item">
                        <h4>Standard Method</h4>
                        <p>Generates a random MAC address starting with DE. This will change your device identity on the network.</p>
                    </div>
                    
                    <div class="tooltip-item">
                        <h4>IEEE Standard Method</h4>
                        <p>Generates a random MAC address starting with 02, which follows IEEE standards for locally administered addresses. May have better compatibility with some networks.</p>
                    </div>
                    
                    <div class="tooltip-warning">
                        <strong>Note:</strong> Both methods work the same way to change your MAC address. The IEEE method is recommended as it follows proper standards and may have better network compatibility.
                    </div>
                `;
                
                infoContainer.appendChild(infoIcon);
                infoContainer.appendChild(tooltip);
                
                // Insert at the beginning of the bypass section
                bypassSection.insertBefore(infoContainer, bypassSection.firstChild);
            }
        }

        const list = document.getElementById('adapterList');

        // --- Preserve dropdown selections before updating the list ---
        const previousSelections = {};
        adapters.forEach(adapter => {
            const dropdown = document.getElementById(`bypassMode-${adapter.transport}`);
            if (dropdown) {
                previousSelections[adapter.transport] = dropdown.value;
            }
        });

        // --- Update the HTML ---
        list.innerHTML = adapters.map(adapter => `
            <div class="adapter-item">
                <h3>${adapter.description} ${adapter.default ? '(Default)' : ''}</h3>
                <p>Transport Name: <code>${adapter.transport}</code></p>
                
                <div class="bypass-options">
                    ${bypassMode === 'registry' ? `
                        <div class="bypass-mode-selector">
                            <label for="bypassMode-${adapter.transport}">MAC Change Mode:</label>
                            <select id="bypassMode-${adapter.transport}" class="bypass-mode-dropdown">
                                <option value="standard">Standard Method (DE)</option>
                                <option value="ieee">IEEE Standard Method (02)</option>
                            </select>
                        </div>
                    ` : ''}
                    
                    <button class="btn-bypass" 
                            onclick="changeMac('${adapter.transport}')">
                        Initiate Bypass (${bypassMode.toUpperCase()})
                    </button>
                </div>
            </div>
        `).join('');       

        // --- Restore previous dropdown selections if possible ---
        adapters.forEach(adapter => {
            const dropdown = document.getElementById(`bypassMode-${adapter.transport}`);
            if (dropdown && previousSelections[adapter.transport]) {
                dropdown.value = previousSelections[adapter.transport];
            }
        });

    } catch (error) {
        showStatus(error.message, 'error');
    }
});

function changeMac(transport) {
    const bypassMode = document.querySelector('.btn-bypass').textContent.includes('REGISTRY') ? 'registry' : 'cmd';
    const dropdown = document.getElementById(`bypassMode-${transport}`);
    const macMode = dropdown ? dropdown.value : 'standard';
    
    let payload = { 
        transport: transport,
        mode: macMode
    };
    
    fetch('/bypass/change-mac', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        showStatus(`${data.message}: ${data.new_mac} - ${data.note}`, 'success');
        
        if (window.updateHistorySizes) {
            window.updateHistorySizes();
        }
        document.dispatchEvent(new Event('historyUpdated'));
    })
    .catch(error => showStatus(error.message, 'error'));
}

function showStatus(message, type) {
    const status = document.getElementById('statusMessage');
    status.textContent = message;
    status.className = `status-message status-${type}`;
    status.style.display = 'block';
}

// Add this after a successful scan in app.js
if (window.updateHistorySizes) {
    window.updateHistorySizes();
}
// Or dispatch an event
document.dispatchEvent(new Event('historyUpdated'));