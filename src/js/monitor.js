// Connection Monitor functionality

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const monitorView = document.getElementById('monitorView');
    const connectionCount = document.getElementById('connectionCount');
    const lastRefreshTime = document.getElementById('lastRefreshTime');
    const processListContainer = document.getElementById('processListContainer');
    const whoisPanel = document.getElementById('whoisPanel');
    const whoisContent = document.getElementById('whoisContent');
    const closeWhoisBtn = document.getElementById('closeWhoisBtn');
    const deepDivePanel = document.getElementById('deepDivePanel');
    const deepDiveContent = document.getElementById('deepDiveContent');
    const closeDeepDiveBtn = document.getElementById('closeDeepDiveBtn');
    const processSearchInput = document.getElementById('processSearchInput');
    
    // State variables
    let autoRefreshInterval = null;
    let currentProcesses = [];
    let lastProcessesHash = '';
    let durationIntervals = {};

    // Initialize
    function init() {
        setupEventListeners();
    }
    
    // Setup event listeners
    function setupEventListeners() {
        const handleVisibility = () => {
            if (window.location.hash === '#monitor') {
                monitorView.style.display = 'block';
                startAutoRefresh();
            } else {
                monitorView.style.display = 'none';
                stopAutoRefresh();
            }
        };

        window.addEventListener('hashchange', handleVisibility);
        
        // Initial check
        if (window.location.hash === '#monitor') {
            handleVisibility();
        }
        
        // Close WHOIS panel
        if (closeWhoisBtn && whoisPanel) {
            closeWhoisBtn.addEventListener('click', () => {
                whoisPanel.style.display = 'none';
            });
        }

        if (closeDeepDiveBtn && deepDivePanel) {
            closeDeepDiveBtn.addEventListener('click', () => {
                deepDivePanel.style.display = 'none';
            });
        }

        if (processSearchInput) {
            processSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const processes = processListContainer.querySelectorAll('.process-item');
                processes.forEach(proc => {
                    const pid = proc.dataset.pid;
                    if (pid.includes(searchTerm)) {
                        proc.style.display = '';
                    } else {
                        proc.style.display = 'none';
                    }
                });
            });
        }
    }
    
    function startAutoRefresh() {
        if (autoRefreshInterval) return; // Already running
        refreshConnections(); // Initial refresh
        autoRefreshInterval = setInterval(refreshConnections, 2000); // Refresh every 2 seconds
    }

    function stopAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        clearAllDurationIntervals();
    }
    
    async function refreshConnections() {
        try {
            const response = await fetch('/monitor/connections');
            const data = await response.json();

            if (data && data.connections) {
                currentProcesses = data.connections;
                renderProcesses(currentProcesses);

                // Update stats
                const totalConnections = currentProcesses.reduce((sum, proc) => sum + proc.connection_count, 0);
                connectionCount.textContent = `${currentProcesses.length} processes, ${totalConnections} connections`;
                lastRefreshTime.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
            }
        } catch (error) {
            console.error('Error refreshing connections:', error);
            connectionCount.textContent = 'Error loading connections';
        }
    }

    function renderProcesses(processes) {
        const processesHash = JSON.stringify(processes.map(p => ({ pid: p.pid, count: p.connection_count })));
        if (processesHash === lastProcessesHash) {
            return; // No changes in process list, avoid full re-render
        }
        lastProcessesHash = processesHash;

        const expandedPIDs = new Set([...processListContainer.querySelectorAll('.process-item.expanded')].map(el => el.dataset.pid));
        
        processListContainer.innerHTML = ''; // Clear previous content
        clearAllDurationIntervals();

        if (processes.length === 0) {
            processListContainer.innerHTML = '<div class="no-connections">No active outbound connections</div>';
            return;
        }

        // Sort processes by name
        processes.sort((a, b) => a.process_name.localeCompare(b.process_name));

        processes.forEach(proc => {
            const processItem = document.createElement('div');
            processItem.className = 'process-item';
            processItem.dataset.pid = proc.pid;

            const isExpanded = expandedPIDs.has(String(proc.pid));
            if (isExpanded) {
                processItem.classList.add('expanded');
            }

            processItem.innerHTML = `
                <div class="process-header">
                    <span class="process-name">${proc.process_name} [${proc.pid}]</span>
                    <span class="process-connection-count">${proc.connection_count} connections</span>
                </div>
                <div class="connection-list" style="display: ${isExpanded ? 'block' : 'none'};"></div>
            `;

            const header = processItem.querySelector('.process-header');
            const connectionList = processItem.querySelector('.connection-list');

            header.addEventListener('click', () => {
                const isVisible = connectionList.style.display === 'block';
                connectionList.style.display = isVisible ? 'none' : 'block';
                processItem.classList.toggle('expanded', !isVisible);
                if (!isVisible) {
                    renderConnectionsForProcess(connectionList, proc.connections);
                }
            });

            if (isExpanded) {
                renderConnectionsForProcess(connectionList, proc.connections);
            }

            processListContainer.appendChild(processItem);
        });
    }

    function renderConnectionsForProcess(container, connections) {
        container.innerHTML = `
            <div class="connection-list-header">
                <div class="connection-col dest-col">Destination</div>
                <div class="connection-col duration-col">Duration</div>
                <div class="connection-col type-col">Protocol</div>
                <div class="connection-col actions-col">Actions</div>
            </div>
        `;

        connections.forEach(conn => {
            const connRow = document.createElement('div');
            connRow.className = 'connection-row';
            
            const destCol = document.createElement('div');
            destCol.className = 'connection-col dest-col';
            destCol.textContent = `${conn.remote_ip}:${conn.remote_port}`;
            
            const durationCol = document.createElement('div');
            durationCol.className = 'connection-col duration-col';
            durationCol.textContent = getDurationString(conn.start_time);
            durationIntervals[conn.id] = setInterval(() => {
                durationCol.textContent = getDurationString(conn.start_time);
            }, 1000);

            const typeCol = document.createElement('div');
            typeCol.className = 'connection-col type-col';
            typeCol.textContent = conn.protocol;

            const actionsCol = document.createElement('div');
            actionsCol.className = 'connection-col actions-col';
            const whoisBtn = document.createElement('button');
            whoisBtn.className = 'whois-btn';
            whoisBtn.textContent = 'WHOIS';
            whoisBtn.onclick = () => performWhoisLookup(conn.remote_ip);
            actionsCol.appendChild(whoisBtn);

            const deepDiveBtn = document.createElement('button');
            deepDiveBtn.className = 'whois-btn'; // Re-use style
            deepDiveBtn.textContent = 'Deep Dive';
            deepDiveBtn.onclick = () => performDeepDive(conn.remote_ip);
            actionsCol.appendChild(deepDiveBtn);

            connRow.appendChild(destCol);
            connRow.appendChild(durationCol);
            connRow.appendChild(typeCol);
            connRow.appendChild(actionsCol);
            container.appendChild(connRow);
        });
    }

    function clearAllDurationIntervals() {
        for (const id in durationIntervals) {
            clearInterval(durationIntervals[id]);
        }
        durationIntervals = {};
    }

    function getDurationString(startTime) {
        if (!startTime) return 'N/A';
        const now = new Date().getTime() / 1000;
        const duration = Math.floor(now - startTime);
        
        const h = Math.floor(duration / 3600);
        const m = Math.floor((duration % 3600) / 60);
        const s = duration % 60;

        return [
            h > 0 ? `${h}h` : '',
            m > 0 ? `${m}m` : '',
            `${s}s`
        ].filter(Boolean).join(' ') || '0s';
    }

    // WHOIS lookup functionality
    async function performWhoisLookup(ip) {
        if (window.showNotification) {
            window.showNotification(`Performing WHOIS lookup for ${ip}...`, 'info');
        }
        
        try {
            const response = await fetch(`/monitor/whois?ip=${ip}`);
            const data = await response.json();
            
            if (data.success) {
                const formattedWhois = formatWhoisData(data.result, ip);
                whoisContent.innerHTML = formattedWhois;
                whoisPanel.style.display = 'block';
            } else {
                whoisContent.innerHTML = `<div class="error-message">Failed to get WHOIS information: ${data.error}</div>`;
                whoisPanel.style.display = 'block';
            }
        } catch (error) {
            console.error('WHOIS lookup error:', error);
            whoisContent.innerHTML = '<div class="error-message">Failed to perform WHOIS lookup</div>';
            whoisPanel.style.display = 'block';
        }
    }
    
    function formatWhoisData(whoisText, ip) {
        if (!whoisText || typeof whoisText !== 'string') {
            return `<p>No WHOIS data available for ${ip}.</p>`;
        }
        
        const sanitizedText = sanitizeHTML(whoisText);
        const pairs = sanitizedText
            .split('\n')
            .map(line => {
                // Ignore comment lines from the WHOIS output
                if (line.trim().startsWith('%') || line.trim().startsWith('#')) {
                    return null;
                }
                const parts = line.split(':');
                if (parts.length > 1) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    if (key && value) {
                        return `<div class="whois-pair"><div class="whois-key">${key}</div><div class="whois-value">${value}</div></div>`;
                    }
                }
                return null;
            })
            .filter(Boolean)
            .join('');

        if (!pairs) {
            return `<p>No parsable WHOIS data found for ${ip}. The raw response may contain referral information.</p>`;
        }

        return `<div class="whois-result">${pairs}</div>`;
    }

    async function performDeepDive(ip) {
        if (window.showNotification) {
            window.showNotification(`Performing deep dive for ${ip}... (this might take some time)`, 'info');
        }

        try {
            const response = await fetch(`/monitor/deep-dive?ip=${ip}`);
            const data = await response.json();

            if (data.success) {
                deepDiveContent.innerHTML = formatDeepDiveData(data.result, ip);
                deepDivePanel.style.display = 'block';
            } else {
                deepDiveContent.innerHTML = `<div class="error-message">Failed to get deep dive analysis: ${data.error}</div>`;
                deepDivePanel.style.display = 'block';
            }
        } catch (error) {
            console.error('Deep Dive error:', error);
            deepDiveContent.innerHTML = '<div class="error-message">Failed to perform deep dive analysis.</div>';
            deepDivePanel.style.display = 'block';
        }
    }

    function formatDeepDiveData(data, ip) {
        // Reuse the whois-result class for a consistent look
        let html = '<div class="whois-result">';

        const createPair = (key, value) => {
            if (!value) return '';
            // Use the same structure as the WHOIS panel
            return `<div class="whois-pair"><div class="whois-key">${key}</div><div class="whois-value">${sanitizeHTML(value)}</div></div>`;
        };

        html += createPair('IP Address', ip);
        html += createPair('Reverse DNS', data.reverse_dns);
        html += createPair('Ping Latency', data.ping_latency);

        if (data.geo_info) {
            html += createPair('ISP / Org', data.geo_info.org);
            const location = [data.geo_info.city, data.geo_info.region, data.geo_info.country].filter(Boolean).join(', ');
            html += createPair('Location', location);
        }

        const portsValue = data.open_ports && data.open_ports.length > 0 
            ? data.open_ports.join(', ')
            : 'No common open ports found.';
        html += createPair('Open Ports', portsValue);

        if (data.traceroute && data.traceroute.length > 0) {
            html += `
                <div class="whois-pair">
                    <div class="whois-key">Traceroute</div>
                    <div class="whois-value">
                        <details class="collapsible-section">
                            <summary>
                                <span>Show Path</span>
                                <span class="summary-hint">(click to expand)</span>
                            </summary>
                            <ol class="traceroute-list">
                                ${data.traceroute.map(hop => `<li>${sanitizeHTML(hop)}</li>`).join('')}
                            </ol>
                        </details>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }
    
    // Helper function to sanitize HTML
    function sanitizeHTML(text) {
        const temp = document.createElement('div');
        temp.textContent = text;
        return temp.innerHTML;
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