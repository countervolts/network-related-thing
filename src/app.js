document.addEventListener('DOMContentLoaded', () => {
    const basicBtn = document.getElementById('basicScanBtn');
    const fullBtn = document.getElementById('fullScanBtn');
    const resultsContainer = document.getElementById('resultsContainer');
    const notificationContainer = document.getElementById('notificationContainer');

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationContainer.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => notification.remove(), 3000);
    }

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

    async function performScan(endpoint) {
        const scanType = endpoint === 'scan/basic' ? 'Basic Scan' : 'Full Scan';
        showNotification(`${scanType} started...`, 'info');

        try {
            const response = await fetch(`http://localhost:5000/${endpoint}`);
            const data = await response.json();
            displayResults(data, endpoint === 'scan/basic');
            showNotification(`${scanType} completed successfully!`);
        } catch (error) {
            showNotification(`${scanType} failed: ${error.message}`, 'error');
        }
    }

    basicBtn.addEventListener('click', () => performScan('scan/basic'));
    fullBtn.addEventListener('click', () => performScan('scan/full'));
});