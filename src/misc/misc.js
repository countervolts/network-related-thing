document.addEventListener('DOMContentLoaded', () => {
    const miscTab = document.getElementById('miscTab');
    const miscView = document.getElementById('miscView');
    const scannerView = document.getElementById('scannerView');
    const settingsView = document.getElementById('settingsView');
    const clearConsoleBtn = document.getElementById('clearConsoleBtn');
    const clearLocalStorageBtn = document.getElementById('clearLocalStorageBtn');
    const downloadOuiBtn = document.getElementById('downloadOuiBtn');
    const clearHistoryDropdown = document.getElementById('clearHistoryDropdown');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const openHistoryFolderBtn = document.getElementById('openHistoryFolderBtn');
    const notificationContainer = document.getElementById('notificationContainer');
    const restartAdaptersBtn = document.getElementById('restartAdaptersBtn');

    // Make showNotification available globally
    window.showNotification = function(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationContainer.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => notification.remove(), 3000);
    };

    miscTab.addEventListener('click', () => {
        scannerView.style.display = 'none';
        settingsView.style.display = 'none';
        miscView.style.display = 'block';
        
        // Update history sizes when tab is clicked
        updateHistorySizes();
    });

    clearConsoleBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/clear-console', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await response.json();
            if (response.ok) {
                showNotification(data.message, 'success');  
            } else {
                showNotification(data.error || 'Failed to clear console.', 'error');  
            }
        } catch (error) {
            console.error('Error clearing console:', error);
            showNotification('An error occurred while clearing the console.', 'error');  
        }
    });

    function initializeResultsHeader() {
        const resultsContainer = document.getElementById('resultsContainer');
        if (!resultsContainer.querySelector('.results-header')) {
            const resultsHeader = document.createElement('div');
            resultsHeader.className = 'results-header';
            resultsHeader.innerHTML = `
                <div>IP Address</div>
                <div>MAC Address</div>
                <div>Hostname</div>
                <div>Vendor</div>
            `;
            resultsContainer.insertBefore(resultsHeader, resultsContainer.firstChild);
        }
    }
    
    clearLocalStorageBtn.addEventListener('click', () => {
        // Clear all localStorage data
        localStorage.clear();

        // Notify the user
        showNotification('Local storage cleared successfully!', 'success');

        // Reinitialize the results header
        initializeResultsHeader();

        // Dispatch a custom event to notify other parts of the app
        const event = new Event('localStorageCleared');
        document.dispatchEvent(event);

        // Clear disabled devices from the UI
        const disabledDevicesBox = document.getElementById('disabledDevices');
        if (disabledDevicesBox) {
            disabledDevicesBox.innerHTML = '';
        }
    });

    downloadOuiBtn.addEventListener('click', async () => {
        showNotification('Downloading OUI file...', 'info');
    
        try {
            const response = await fetch('/misc/download-oui', { method: 'GET' });
            const data = await response.json();
            if (response.ok) {
                showNotification(data.message, 'success'); 
            } else {
                showNotification(data.error || 'Failed to download OUI file.', 'error'); 
            }
        } catch (error) {
            console.error('Error downloading OUI file:', error);
            showNotification('An error occurred while downloading the OUI file.', 'error');
        }
    });

    clearHistoryBtn.addEventListener('click', async () => {
        const option = clearHistoryDropdown.value;
        try {
            const response = await fetch('/misc/clear-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ option }),
            });
            const data = await response.json();
            if (response.ok) {
                showNotification(data.message, 'success');
                // Update history sizes after clearing
                updateHistorySizes();
            } else {
                showNotification(data.error || 'Failed to clear history.', 'error');  
            }
        } catch (error) {
            console.error('Error clearing history:', error);
            showNotification('An error occurred while clearing history.', 'error');  
        }
    });

    openHistoryFolderBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/misc/open-history-folder', { method: 'POST' });
            if (response.ok) {
                showNotification('Storage Folder opened in Explorer.', 'success');
            } else {
                showNotification('Failed to open Storage Folder.', 'error');
            }
        } catch (error) {
            console.error('Error opening Storage Folder:', error);
            showNotification('An error occurred while opening the Storage Folder.', 'error');
        }
    });

    restartAdaptersBtn.addEventListener('click', async () => {
        try {
            showNotification('Restarting network adapters...', 'info');
            
            const response = await fetch('/network/restart-adapters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            
            const data = await response.json();
            if (response.ok) {
                showNotification(data.message || 'Network adapters restarted successfully.', 'success');
            } else {
                showNotification(data.error || 'Failed to restart network adapters.', 'error');
            }
        } catch (error) {
            console.error('Error restarting network adapters:', error);
            showNotification('An error occurred while restarting network adapters.', 'error');
        }
    });

    // Make updateHistorySizes available globally
    window.updateHistorySizes = async function() {
        // Only update if the misc tab is currently visible
        const miscView = document.getElementById('miscView');
        if (!miscView || miscView.style.display !== 'block') {
            return null;
        }
        try {
            const response = await fetch('/misc/history-sizes');
            const sizes = await response.json();

            if (response.ok) {
                // Convert sizes to a human-readable format
                const formatSize = (size) => {
                    if (size < 1024) return `${size} B`;
                    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
                    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
                };

                // Update dropdown options with sizes
                if (clearHistoryDropdown) {
                    clearHistoryDropdown.innerHTML = `
                        <option value="scan">Scan History (${formatSize(sizes.scan)})</option>
                        <option value="bypass">Bypass History (${formatSize(sizes.bypass)})</option>
                        <option value="all">All History (${formatSize(sizes.all)})</option>
                    `;
                }
                
                return sizes; // Return sizes for potential use elsewhere
            } else {
                console.error('Failed to fetch history sizes:', sizes.error);
                return null;
            }
        } catch (error) {
            console.error('Error fetching history sizes:', error);
            return null;
        }
    };

    // Initial update
    updateHistorySizes();
    
    // Set up event listeners for history updates
    document.addEventListener('historyUpdated', function() {
        updateHistorySizes();
    });
    
    // Set a periodic update interval (every 30 seconds) as a fallback
    setInterval(updateHistorySizes, 30000);
});