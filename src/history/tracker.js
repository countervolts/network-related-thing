// Move formatMac function outside any event handler to make it globally available
function formatMac(mac) {
    if (!mac) return 'Unknown';
    mac = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    if (mac.length === 12) {
        return mac.match(/.{1,2}/g).join(':');
    }
    return mac;
}

document.getElementById('historyTab').addEventListener('click', async () => {
    try {
        const scanHistoryList = document.getElementById('scanHistoryList');
        const bypassHistoryList = document.getElementById('bypassHistoryList');
        scanHistoryList.innerHTML = '<div class="loading">Loading scan history...</div>';
        bypassHistoryList.innerHTML = '<div class="loading">Loading bypass history...</div>';

        const [scanHistoryResponse, bypassHistoryResponse] = await Promise.all([
            fetch('/history/scans'),
            fetch('/history/bypasses')
        ]);

        if (!scanHistoryResponse.ok || !bypassHistoryResponse.ok) {
            throw new Error('Failed to fetch history data.');
        }

        const scanHistory = (await scanHistoryResponse.json()) || []; // Ensure scanHistory is an array
        const bypassHistory = (await bypassHistoryResponse.json()) || []; // Ensure bypassHistory is an array

        scanHistory.sort((a, b) => new Date(b.time) - new Date(a.time));
        bypassHistory.sort((a, b) => new Date(b.time) - new Date(a.time));

        const formatTime = (time) => {
            const date = new Date(time);
            return date.toLocaleString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: true,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        };

        scanHistoryList.innerHTML = scanHistory.map(item => `
            <div class="history-item">
                <div>
                    <strong>Time:</strong> ${formatTime(item.time)} <br>
                    <strong>Type:</strong> ${item.type} <br>
                    <strong>Devices:</strong> ${item.deviceCount}
                </div>
                <div>
                    <a href="/history/json/${item.id}.json" target="_blank" class="json-link">View JSON</a>
                    <button onclick="deleteScan('${item.id}')">Delete</button>
                </div>
            </div>
        `).join('');

        bypassHistoryList.innerHTML = bypassHistory.map(item => {
            let mode = item.method || "Unknown"; 
            mode = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase(); 
            let method = "Standard";
            
            // Check if the method info is already included in the history item
            if (item.mac_mode) {
                // Use the recorded MAC mode if available
                method = item.mac_mode.charAt(0).toUpperCase() + item.mac_mode.slice(1);
            } else {
                // Determine method based on MAC format if not specified
                if (item.newMac) {
                    const firstByte = item.newMac.substring(0, 2).toUpperCase();
                    if (firstByte === 'DE') {
                        method = "Standard";
                    } else if (firstByte === '02') {
                        // Could be either Tmac or LAA
                        method = "Tmac";
                    } else {
                        // Check if it matches LAA pattern (second hex digit is 2, 6, A, or E)
                        const secondHexDigit = item.newMac.substring(1, 2).toUpperCase();
                        if (['2', '6', 'A', 'E'].includes(secondHexDigit)) {
                            method = "Unicast LAA";
                        }
                    }
                }
            }
            
            return `
            <div class="history-item">
                <div>
                    <strong>Time:</strong> ${formatTime(item.time)} <br>
                    <strong>Last MAC:</strong> ${formatMac(item.previousMac)} <br>
                    <strong>New MAC:</strong> ${formatMac(item.newMac)} <br>
                    <strong>Mode:</strong> ${mode} <br>
                    <strong>Method:</strong> ${method}
                </div>
                <button onclick="revertMac('${item.transport}', '${item.previousMac}')">Revert</button>
            </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load history:', error);
        // Use global showNotification instead of window.showNotification
        showNotification('Failed to load history.', 'error');

        document.getElementById('scanHistoryList').innerHTML = '<div class="error">Failed to load scan history.</div>';
        document.getElementById('bypassHistoryList').innerHTML = '<div class="error">Failed to load bypass history.</div>';
    }
});

async function deleteScan(id) {
    try {
        const response = await fetch(`/history/scans/${id}`, { method: 'DELETE' });
        if (response.ok) {
            // Refresh the history view
            document.getElementById('historyTab').click();
            
            // Update history sizes
            // Use try-catch instead of checking if the function exists
            try {
                updateHistorySizes();
            } catch (e) {
                console.log('updateHistorySizes not available');
            }
            
            showNotification('Scan history deleted successfully.', 'success');
        } else {
            showNotification('Failed to delete scan history.', 'error');
        }
    } catch (error) {
        console.error('Failed to delete scan history:', error);
        showNotification('An error occurred while deleting scan history.', 'error');
    }
}

// Fixed function with removed unused parameter
function revertMac(transport, oldMac) {
    // Add notification when revert process starts
    showNotification(`Starting MAC address revert...`, 'info');
    
    // Check if the MAC format is valid
    if (!oldMac || oldMac.length < 12) {
        showNotification(`Invalid MAC address format in history: ${oldMac}`, 'error');
        return;
    }
    
    // Remove colons or other separators for registry format
    const formattedMac = oldMac.replace(/[^a-fA-F0-9]/g, '');
    
    showNotification(`Attempting to restore MAC: ${formatMac(oldMac)}`, 'info');
    
    fetch('/bypass/revert-mac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            transport: transport, 
            mac: formattedMac  // Send properly formatted MAC
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        showNotification(`MAC address change requested successfully!`, 'success');
        showNotification(`Attempted to restore MAC: ${formatMac(oldMac)}`, 'info');
        
        // Refresh the history after a small delay to show updated adapters
        setTimeout(() => {
            document.getElementById('historyTab').click();
        }, 1500);
    })
    .catch(error => {
        console.error('Failed to revert MAC address:', error);
        showNotification(`Failed to revert MAC address: ${error.message}`, 'error');
    });
}