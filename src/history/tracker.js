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

        const scanHistory = await scanHistoryResponse.json();
        const bypassHistory = await bypassHistoryResponse.json();

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

        bypassHistoryList.innerHTML = bypassHistory.map(item => `
            <div class="history-item">
                <div>
                    <strong>Time:</strong> ${formatTime(item.time)} <br>
                    <strong>Last MAC:</strong> ${item.previousMac} <br>
                    <strong>New MAC:</strong> ${item.newMac} <br>
                    <strong>Method:</strong> ${item.method}
                </div>
                <button onclick="revertMac('${item.transport}', '${item.previousMac}')">Revert</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load history:', error);
        showNotification('Failed to load history.', 'error');

        document.getElementById('scanHistoryList').innerHTML = '<div class="error">Failed to load scan history.</div>';
        document.getElementById('bypassHistoryList').innerHTML = '<div class="error">Failed to load bypass history.</div>';
    }
});

async function deleteScan(id) {
    try {
        const response = await fetch(`/history/scans/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showNotification('Scan history deleted successfully.', 'success');  
            document.getElementById('historyTab').click();
        } else {
            showNotification('Failed to delete scan history.', 'error');  
        }
    } catch (error) {
        console.error('Failed to delete scan history:', error);
        showNotification('An error occurred while deleting scan history.', 'error'); 
    }
}

function revertMac(transport, oldMac) {
    fetch('/bypass/revert-mac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transport: transport, mac: oldMac })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        showNotification(data.message, 'success');
    })
    .catch(error => {
        console.error('Failed to revert MAC address:', error);
        showNotification(`Failed to revert MAC address: ${error.message}`, 'error');
    });
}