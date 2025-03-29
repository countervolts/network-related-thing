document.addEventListener('DOMContentLoaded', () => {
    const basicBtn = document.getElementById('basicScanBtn');
    const fullBtn = document.getElementById('fullScanBtn');
    const resultsContainer = document.getElementById('resultsContainer');
    const notificationContainer = document.getElementById('notificationContainer');
    const lastScanTimestamp = document.getElementById('lastScanTimestamp');

    // Function to show notifications
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationContainer.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => notification.remove(), 3000);
    }

    // Function to display results
    function displayResults(data, isBasic = false) {
        const resultsBody = document.getElementById('resultsBody');
        resultsBody.innerHTML = '';

        data.forEach(device => {
            const deviceEl = document.createElement('div');
            deviceEl.className = 'result-item';

            deviceEl.innerHTML = `
                <div class="ip">${device.ip}</div>
                <div class="mac">${device.mac}</div>
                <div class="hostname">${isBasic ? 'Skipped' : device.hostname || 'Unknown'}</div>
                <div class="vendor">${isBasic ? 'Skipped' : device.vendor || 'Unknown'}</div>
            `;

            resultsBody.appendChild(deviceEl);
        });
    }

    // Save results and timestamp to localStorage
    function saveResultsToLocalStorage(results, scanType) {
        const timestamp = new Date().toLocaleString();
        localStorage.setItem('scanResults', JSON.stringify(results));
        localStorage.setItem('scanType', scanType);
        localStorage.setItem('lastScanTimestamp', timestamp);
        updateLastScanTimestamp(timestamp);
    }

    // Load results and timestamp from localStorage
    function loadResultsFromLocalStorage() {
        const results = localStorage.getItem('scanResults');
        const scanType = localStorage.getItem('scanType');
        const timestamp = localStorage.getItem('lastScanTimestamp');
        if (results && scanType) {
            const parsedResults = JSON.parse(results);
            displayResults(parsedResults, scanType === 'basic');
        }
        if (timestamp) {
            updateLastScanTimestamp(timestamp);
        }
    }

    // Update the last scan timestamp display
    function updateLastScanTimestamp(timestamp) {
        lastScanTimestamp.textContent = `- Previous scan: ${timestamp}`;
    }

    // Perform a scan
    async function performScan(endpoint) {
        const scanType = endpoint === 'scan/basic' ? 'Basic Scan' : 'Full Scan';
        showNotification(`${scanType} started...`, 'info');

        try {
            const response = await fetch(`http://localhost:5000/${endpoint}`);
            const data = await response.json();
            displayResults(data, endpoint === 'scan/basic');
            saveResultsToLocalStorage(data, endpoint === 'scan/basic' ? 'basic' : 'full');
            showNotification(`${scanType} completed successfully!`);
        } catch (error) {
            showNotification(`${scanType} failed: ${error.message}`, 'error');
        }
    }

    // Event listeners for scan buttons
    basicBtn.addEventListener('click', () => performScan('scan/basic'));
    fullBtn.addEventListener('click', () => performScan('scan/full'));

    // Load results and timestamp from localStorage on page load
    loadResultsFromLocalStorage();
});