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

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationContainer.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => notification.remove(), 3000);
    }

    miscTab.addEventListener('click', () => {
        scannerView.style.display = 'none';
        settingsView.style.display = 'none';
        miscView.style.display = 'block';
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
});