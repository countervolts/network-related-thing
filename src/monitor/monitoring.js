// Connection Monitor functionality

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const monitorTab = document.getElementById('monitorTab');
    const monitorView = document.getElementById('monitorView');
    const adapterSelector = document.getElementById('adapterSelector');
    const refreshConnectionsBtn = document.getElementById('refreshConnectionsBtn');
    const autoRefreshToggle = document.getElementById('autoRefreshToggle');
    const connectionCount = document.getElementById('connectionCount');
    const lastRefreshTime = document.getElementById('lastRefreshTime');
    const connectionsBody = document.getElementById('connectionsBody');
    const whoisPanel = document.getElementById('whoisPanel');
    const whoisContent = document.getElementById('whoisContent');
    const closeWhoisBtn = document.getElementById('closeWhoisBtn');
    
    // State variables
    let autoRefreshInterval = null;
    let currentConnections = [];
    let lastConnectionsHash = '';
    let durationIntervals = {};
    let connectionStartTimesCache = {};
    
    // Sorting state
    let sortField = null; // 'process' or 'duration'
    let sortDirection = 'asc'; // 'asc' or 'desc'

    // Initialize
    function init() {
        loadAdapters();
        setupEventListeners();
    }
    
    // Setup event listeners
    function setupEventListeners() {
        monitorTab.addEventListener('click', () => {
            showMonitorView();
            refreshConnections();
        });
        
        refreshConnectionsBtn.addEventListener('click', refreshConnections);
        
        adapterSelector.addEventListener('change', () => {
            refreshConnections();
        });
        
        autoRefreshToggle.addEventListener('change', toggleAutoRefresh);
        
        closeWhoisBtn.addEventListener('click', () => {
            whoisPanel.style.display = 'none';
        });
        
        // Stop auto-refresh when leaving the tab
        document.querySelectorAll('.tab').forEach(tab => {
            if (tab.id !== 'monitorTab') {
                tab.addEventListener('click', () => {
                    if (autoRefreshInterval) {
                        clearInterval(autoRefreshInterval);
                        autoRefreshInterval = null;
                        autoRefreshToggle.checked = false;
                    }
                });
            }
        });
        
        // Also handle hash change for direct URL navigation
        window.addEventListener('hashchange', () => {
            if (window.location.hash !== '#monitor' && autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
                autoRefreshToggle.checked = false;
            }
        });
    }
    
    function showMonitorView() {
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });
        monitorView.style.display = 'block';
    }
    
    function toggleAutoRefresh() {
        if (autoRefreshToggle.checked) {
            // Start auto-refresh (every 5 seconds)
            autoRefreshInterval = setInterval(refreshConnections, 5000);
        } else {
            // Stop auto-refresh
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        }
    }
    
    async function loadAdapters() {
        try {
            const response = await fetch('/monitor/adapters');
            const adapters = await response.json();
            
            // Clear existing options except "All Adapters"
            while (adapterSelector.options.length > 1) {
                adapterSelector.remove(1);
            }
            
            // Add adapters to dropdown
            adapters.forEach(adapter => {
                const option = document.createElement('option');
                option.value = adapter.name;
                option.textContent = `${adapter.name} (${adapter.ip})`;
                adapterSelector.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading adapters:', error);
            showNotification('Failed to load network adapters', 'error');
        }
    }
    
    async function refreshConnections() {
        try {
            const selectedAdapter = adapterSelector.value;
            const response = await fetch(`/monitor/connections?adapter=${selectedAdapter}`);
            const data = await response.json();

            if (data && data.connections) {
                // Preserve start_time for existing connections
                data.connections.forEach(conn => {
                    if (connectionStartTimesCache[conn.id]) {
                        conn.start_time = connectionStartTimesCache[conn.id];
                    } else {
                        connectionStartTimesCache[conn.id] = conn.start_time;
                    }
                });

                // Remove start_times for connections that no longer exist
                const currentIds = new Set(data.connections.map(conn => conn.id));
                Object.keys(connectionStartTimesCache).forEach(id => {
                    if (!currentIds.has(id)) {
                        delete connectionStartTimesCache[id];
                    }
                });

                currentConnections = data.connections;
                renderConnections(currentConnections);

                // Update stats
                connectionCount.textContent = `${currentConnections.length} connection${currentConnections.length !== 1 ? 's' : ''}`;
                lastRefreshTime.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
            }
        } catch (error) {
            console.error('Error refreshing connections:', error);
            showNotification('Failed to refresh connections', 'error');
        }
    }

    function addSortingToHeader() {
        const header = document.querySelector('.connections-header');
        if (!header) return;

        // Process column
        const processCol = header.querySelector('.process-col');
        const durationCol = header.querySelector('.duration-col');

        // Remove any previous sort indicators
        processCol.innerHTML = 'Process';
        durationCol.innerHTML = 'Duration';

        // Add arrow if sorted
        if (sortField === 'process') {
            processCol.innerHTML += sortDirection === 'asc' ? ' <span class="sort-arrow">&#9650;</span>' : ' <span class="sort-arrow">&#9660;</span>';
        }
        if (sortField === 'duration') {
            durationCol.innerHTML += sortDirection === 'asc' ? ' <span class="sort-arrow">&#9650;</span>' : ' <span class="sort-arrow">&#9660;</span>';
        }

        // Add click listeners
        processCol.style.cursor = 'pointer';
        durationCol.style.cursor = 'pointer';

        processCol.onclick = () => {
            if (sortField === 'process') {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = 'process';
                sortDirection = 'asc';
            }
            addSortingToHeader();
            renderConnections(currentConnections);
        };

        durationCol.onclick = () => {
            if (sortField === 'duration') {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = 'duration';
                sortDirection = 'asc';
            }
            addSortingToHeader();
            renderConnections(currentConnections);
        };
    }

    function renderConnections(connections) {
        addSortingToHeader();

        // Clear previous intervals
        clearAllDurationIntervals();

        let sortedConnections = [...connections];
        if (sortField === 'process') {
            sortedConnections.sort((a, b) => {
                const aName = (a.process_name || '').toLowerCase();
                const bName = (b.process_name || '').toLowerCase();
                if (aName < bName) return sortDirection === 'asc' ? -1 : 1;
                if (aName > bName) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        } else if (sortField === 'duration') {
            sortedConnections.sort((a, b) => {
                // Parse duration in seconds from string (e.g. "1h 2m 3s")
                const parseDuration = (str) => {
                    if (!str) return 0;
                    let total = 0;
                    const h = /(\d+)h/.exec(str);
                    const m = /(\d+)m/.exec(str);
                    const s = /(\d+)s/.exec(str);
                    if (h) total += parseInt(h[1], 10) * 3600;
                    if (m) total += parseInt(m[1], 10) * 60;
                    if (s) total += parseInt(s[1], 10);
                    return total;
                };
                const aDur = parseDuration(a.duration);
                const bDur = parseDuration(b.duration);
                return sortDirection === 'asc' ? aDur - bDur : bDur - aDur;
            });
        }

        // Generate a hash of the connections to avoid unnecessary DOM updates
        const connectionsHash = JSON.stringify(sortedConnections);
        if (connectionsHash === lastConnectionsHash) {
            return; // No changes, skip update
        }
        lastConnectionsHash = connectionsHash;

        // Clear existing connections
        connectionsBody.innerHTML = '';

        if (sortedConnections.length === 0) {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'no-connections';
            emptyRow.textContent = 'No active outbound connections';
            connectionsBody.appendChild(emptyRow);
            return;
        }

        // Add each connection
        sortedConnections.forEach(conn => {
            const connectionRow = document.createElement('div');
            connectionRow.className = 'connection-row';
            connectionRow.dataset.id = conn.id;

            // Process column
            const processCol = document.createElement('div');
            processCol.className = 'connection-col process-col';
            processCol.textContent = `${conn.process_name} [${conn.pid}]`;
            connectionRow.appendChild(processCol);

            // Duration column (dynamic)
            const durationCol = document.createElement('div');
            durationCol.className = 'connection-col duration-col';
            durationCol.textContent = getDurationString(conn.start_time);

            durationIntervals[conn.id] = setInterval(() => {
                durationCol.textContent = getDurationString(conn.start_time);
            }, 1000);
            connectionRow.appendChild(durationCol);

            // Destination column
            const destCol = document.createElement('div');
            destCol.className = 'connection-col dest-col';
            destCol.textContent = `${conn.remote_ip}:${conn.remote_port}`;
            connectionRow.appendChild(destCol);

            // Type column
            const typeCol = document.createElement('div');
            typeCol.className = 'connection-col type-col';
            typeCol.textContent = conn.type;
            connectionRow.appendChild(typeCol);

            // Actions column (only WHOIS button)
            const actionsCol = document.createElement('div');
            actionsCol.className = 'connection-col actions-col';
            const whoisBtn = document.createElement('button');
            whoisBtn.className = 'whois-btn';
            whoisBtn.textContent = 'WHOIS';
            whoisBtn.addEventListener('click', () => {
                performWhoisLookup(conn.remote_ip);
            });
            actionsCol.appendChild(whoisBtn);
            connectionRow.appendChild(actionsCol);

            connectionsBody.appendChild(connectionRow);
        });
    }

    function clearAllDurationIntervals() {
        Object.values(durationIntervals).forEach(clearInterval);
        durationIntervals = {};
    }

    function getDurationString(startTime) {
        if (!startTime) return 'Unknown';
        const start = new Date(startTime * 1000); // start_time is in seconds since epoch
        const now = new Date();
        const diff = Math.floor((now - start) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
    }

    async function performWhoisLookup(ip) {
        // Show the WHOIS panel with loading state
        whoisPanel.style.display = 'block';
        whoisContent.innerHTML = '<div class="loading-spinner"></div>';
        
        try {
            const response = await fetch(`/monitor/whois?ip=${ip}`);
            const data = await response.json();
            
            if (data.success) {
                // Format the WHOIS data
                const formattedWhois = formatWhoisData(data.result, ip);
                whoisContent.innerHTML = formattedWhois;
            } else {
                whoisContent.innerHTML = `<div class="error-message">Failed to get WHOIS information: ${data.error}</div>`;
            }
        } catch (error) {
            console.error('WHOIS lookup error:', error);
            whoisContent.innerHTML = '<div class="error-message">Failed to perform WHOIS lookup</div>';
        }
    }
    
    function formatWhoisData(whoisText, ip) {
        // Simple formatting of WHOIS data
        const lines = whoisText.split('\n');
        let html = `<h4>WHOIS Information for ${ip}</h4>`;
        html += '<div class="whois-data">';
        
        for (const line of lines) {
            if (line.trim()) {
                // Highlight important fields
                if (line.match(/^(Organization|NetName|Country|City|Address|Email|Phone|Created|Updated):/i)) {
                    html += `<div class="whois-highlight">${sanitizeHTML(line)}</div>`;
                } else {
                    html += `<div>${sanitizeHTML(line)}</div>`;
                }
            }
        }
        
        html += '</div>';
        return html;
    }
    
    // Helper function for notifications
    function showNotification(message, type = 'success') {
        // Use global notification function if available
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            // Fallback notification function
            const container = document.getElementById('notificationContainer') || document.body;
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.textContent = message;
            
            container.appendChild(notification);
            
            // Auto-remove after 3 seconds
            setTimeout(() => {
                notification.classList.add('hide');
                setTimeout(() => {
                    container.removeChild(notification);
                }, 300);
            }, 3000);
        }
    }
    
    // Helper function to sanitize HTML
    function sanitizeHTML(text) {
        const element = document.createElement('div');
        element.textContent = text;
        return element.innerHTML;
    }

    // Initialize
    init();
});

// Add a little CSS for the sort arrow
const style = document.createElement('style');
style.textContent = `
    .sort-arrow {
        font-size: 0.9em;
        margin-left: 2px;
    }
`;
document.head.appendChild(style);