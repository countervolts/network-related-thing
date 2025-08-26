function formatMac(mac) {
    if (!mac) return 'Unknown';
    mac = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    if (mac.length === 12) {
        return mac.match(/.{1,2}/g).join(':');
    }
    return mac;
}

document.addEventListener('DOMContentLoaded', () => {
    const historyTab = document.getElementById('historyTab');
    if (!historyTab) return;

    let fullScanHistory = [];
    let fullBypassHistory = [];

    // Filter and sort controls
    const bypassModeFilter = document.getElementById('bypassModeFilter');
    const bypassMethodFilter = document.getElementById('bypassMethodFilter');
    const bypassSort = document.getElementById('bypassSort');
    const scanSort = document.getElementById('scanSort');

    // Tab controls
    const historyNavBtns = document.querySelectorAll('.history-nav-btn');
    const historyPanels = document.querySelectorAll('.history-panel');

    const formatTime = (time) => {
        const date = new Date(time);
        return date.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true
        });
    };

    const formatMac = (mac) => mac ? mac.replace(/[-:]/g, '').toUpperCase().match(/.{1,2}/g).join(':') : 'N/A';

    const renderBypassHistory = () => {
        const list = document.getElementById('bypassHistoryList');
        if (!list) return;

        const generationModeFilter = bypassModeFilter.value; // e.g., 'randomized'
        const applicationMethodFilter = bypassMethodFilter.value; // e.g., 'registry'
        const sortOrder = bypassSort.value;

        let filtered = fullBypassHistory
            .filter(item => (applicationMethodFilter === 'all' || (item.method && item.method.toLowerCase() === applicationMethodFilter)))
            .filter(item => (generationModeFilter === 'all' || (item.mac_mode || 'N/A').toLowerCase() === generationModeFilter));

        filtered.sort((a, b) => {
            const dateA = new Date(a.time);
            const dateB = new Date(b.time);
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="no-results">No bypass history found matching your criteria.</div>';
            return;
        }

        list.innerHTML = filtered.map(item => {
            const method = item.method ? item.method.charAt(0).toUpperCase() + item.method.slice(1) : 'N/A';
            const mode = (item.mac_mode || 'N/A').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            const canRevert = item.previousMac && item.previousMac.toLowerCase() !== 'n/a';
            const revertButton = canRevert
                ? `<button class="btn btn-revert" onclick="showRevertConfirmation('${item.transport}', '${item.newMac}', '${item.previousMac}')">Revert</button>`
                : `<button class="btn btn-revert" disabled title="Original MAC address not available.">Revert</button>`;

            return `
            <div class="history-card">
                <div class="history-card-header">
                    <h4>Bypass Event</h4>
                    <span class="history-card-time">${formatTime(item.time)}</span>
                </div>
                <div class="history-card-body">
                    <div class="detail-row">
                        <span class="detail-label">Method:</span>
                        <span class="detail-value">${method}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Mode:</span>
                        <span class="detail-value">${mode}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Old MAC:</span>
                        <span class="detail-value">${formatMac(item.previousMac)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">New MAC:</span>
                        <span class="detail-value">${formatMac(item.newMac)}</span>
                    </div>
                </div>
                <div class="history-card-footer">
                    ${revertButton}
                </div>
            </div>`;
        }).join('');
    };

    const renderScanHistory = () => {
        const list = document.getElementById('scanHistoryList');
        if (!list) return;

        const sortOrder = scanSort.value;
        let sorted = [...fullScanHistory];

        sorted.sort((a, b) => {
            const dateA = new Date(a.time);
            const dateB = new Date(b.time);
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });

        if (sorted.length === 0) {
            list.innerHTML = '<div class="no-results">No scan history found.</div>';
            return;
        }

        list.innerHTML = sorted.map(item => {
            // Fix for incorrect absolute paths in rawJsonUrl
            const rawUrl = item.rawJsonUrl || '';
            const filename = rawUrl.split(/[\\/]/).pop();
            const correctedUrl = `/history/json/${filename}`;
            const scanningMethod = item.scanning_method 
                ? item.scanning_method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) 
                : 'N/A';
            const duration = item.duration ? `${item.duration.toFixed(2)}s` : 'N/A';

            return `
            <div class="history-card scan-card" data-scan-id="${item.id}">
                <div class="history-card-header">
                    <div class="history-card-title-group">
                        <input type="checkbox" class="history-select-checkbox" data-scan-id="${item.id}">
                        <h4>${item.type} Scan</h4>
                    </div>
                    <span class="history-card-time">${formatTime(item.time)}</span>
                </div>
                <div class="history-card-body">
                     <div class="detail-row">
                        <span class="detail-label">Devices Found:</span>
                        <span class="detail-value">${item.deviceCount}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Duration:</span>
                        <span class="detail-value">${duration}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Scanning Method:</span>
                        <span class="detail-value">${scanningMethod}</span>
                    </div>
                </div>
                <div class="history-card-footer">
                    <a href="${correctedUrl}" target="_blank" class="json-link btn">View JSON</a>
                </div>
            </div>`;
        }).join('');

        // Add event listeners for selection
        list.querySelectorAll('.history-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox' || e.target.classList.contains('json-link')) return; // Don't toggle if checkbox or link is clicked
                const checkbox = card.querySelector('.history-select-checkbox');
                checkbox.checked = !checkbox.checked;
                card.classList.toggle('selected', checkbox.checked);
                updateDeleteButtonState();
            });
        });

        list.querySelectorAll('.history-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const card = checkbox.closest('.history-card');
                card.classList.toggle('selected', checkbox.checked);
                updateDeleteButtonState();
            });
        });
    };

    const updateDeleteButtonState = () => {
        const selected = document.querySelectorAll('#scanHistoryList .history-select-checkbox:checked');
        const deleteBtn = document.getElementById('deleteSelectedScansBtn');
        if (deleteBtn) {
            const hasSelection = selected.length > 0;
            deleteBtn.disabled = !hasSelection;
            deleteBtn.classList.toggle('active-selection', hasSelection);
        }
    };

    const deleteSelectedScans = async () => {
        const selectedCheckboxes = document.querySelectorAll('#scanHistoryList .history-select-checkbox:checked');
        const scanIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.scanId);

        if (scanIds.length === 0) return;

        const confirmed = await window.showConfirmation(
            'Delete Scans?',
            `Are you sure you want to delete ${scanIds.length} scan record(s)? This action cannot be undone.`,
            'Delete'
        );

        if (!confirmed) return;

        try {
            const response = await fetch('/history/scans/delete-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: scanIds })
            });

            if (response.ok) {
                showNotification('Selected scan records deleted.', 'success');
                loadHistory(); // Refresh the history view
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete scan records.');
            }
        } catch (error) {
            showNotification(error.message, 'error');
        }
    };

    const populateFilters = () => {
        // Populate Method filter (Registry/CMD)
        const applicationMethods = [...new Set(fullBypassHistory.map(item => item.method).filter(Boolean))];
        bypassMethodFilter.innerHTML = '<option value="all">All Methods</option>' + 
            applicationMethods.map(m => `<option value="${m.toLowerCase()}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('');

        // Populate Mode filter (e.g., Randomized, Manual)
        const generationModes = [...new Set(fullBypassHistory.map(item => item.mac_mode || 'N/A'))];
        bypassModeFilter.innerHTML = '<option value="all">All Modes</option>' + 
            generationModes.map(m => {
                const formattedName = m.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                return `<option value="${m.toLowerCase()}">${formattedName}</option>`;
            }).join('');
    };

    const loadHistory = async () => {
        const bypassList = document.getElementById('bypassHistoryList');
        const scanList = document.getElementById('scanHistoryList');
        
        bypassList.innerHTML = '<div class="loading">Loading bypass history...</div>';
        scanList.innerHTML = '<div class="loading">Loading scan history...</div>';

        try {
            const [scanRes, bypassRes] = await Promise.all([
                fetch('/history/scans'),
                fetch('/history/bypasses')
            ]);

            if (!scanRes.ok || !bypassRes.ok) throw new Error('Failed to fetch history data.');

            fullScanHistory = await scanRes.json() || [];
            fullBypassHistory = await bypassRes.json() || [];

            populateFilters();
            renderBypassHistory();
            renderScanHistory();
        } catch (error) {
            console.error('Failed to load history:', error);
            showNotification('Failed to load history.', 'error');
            bypassList.innerHTML = '<div class="error">Failed to load bypass history.</div>';
            scanList.innerHTML = '<div class="error">Failed to load scan history.</div>';
        }
    };

    historyTab.addEventListener('click', loadHistory);

    // Event listeners for controls
    [bypassModeFilter, bypassMethodFilter, bypassSort].forEach(el => el.addEventListener('change', renderBypassHistory));
    scanSort.addEventListener('change', renderScanHistory);
    document.getElementById('deleteSelectedScansBtn')?.addEventListener('click', deleteSelectedScans);

    // Tab switching logic
    historyNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            historyNavBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            historyPanels.forEach(p => p.classList.remove('active'));
            const panelId = btn.dataset.historyType === 'bypass' ? 'bypassHistoryPanel' : 'scanHistoryPanel';
            document.getElementById(panelId).classList.add('active');
        });
    });
});

// Global functions for button clicks
async function deleteScan(id) {
    const confirmed = await window.showConfirmation(
        'Delete Scan',
        'Are you sure you want to delete this scan record? This action cannot be undone.',
        'Delete'
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`/history/scans/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showNotification('Scan record deleted.', 'success');
            document.getElementById('historyTab').click(); // Refresh history
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Failed to delete scan record.');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function showRevertConfirmation(transport, currentMac, revertToMac) {
    const modal = document.getElementById('revertMacModal');
    const currentMacSpan = document.getElementById('revertCurrentMac');
    const revertToMacSpan = document.getElementById('revertToMac');
    const confirmBtn = document.getElementById('confirmRevertBtn');
    const cancelBtn = document.getElementById('cancelRevertBtn');

    currentMacSpan.textContent = formatMac(currentMac);
    revertToMacSpan.textContent = formatMac(revertToMac);

    modal.style.display = 'flex';

    const confirmHandler = () => {
        revertMac(transport, revertToMac);
        hideModal();
    };

    const hideModal = () => {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', hideModal);
    };

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', hideModal);
}

function revertMac(transport, oldMac) {
    fetch('/bypass/revert-mac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transport, mac: oldMac })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showNotification(data.message, 'success');
            // Optionally refresh bypass history or adapter list
            if (document.getElementById('bypassTab').classList.contains('active')) {
                document.getElementById('bypassTab').click();
            }
        } else {
            throw new Error(data.error || 'Revert failed.');
        }
    })
    .catch(error => showNotification(`Revert Error: ${error.message}`, 'error'));
}