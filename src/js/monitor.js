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
    const processInfoPanel = document.getElementById('processInfoPanel');
    const processInfoContent = document.getElementById('processInfoContent');
    const closeProcessInfoBtn = document.getElementById('closeProcessInfoBtn');
    
    // State variables
    let autoRefreshInterval = null;
    let currentProcesses = [];
    let lastProcessesHash = '';
    let durationIntervals = {};
    let processStatsCache = {}; // For persisting stats across tab changes
    let processInfoOutsideClickHandler = null; // close on outside click

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

        if (closeProcessInfoBtn && processInfoPanel) {
            // Hide the close button in the Process Details panel
            closeProcessInfoBtn.style.display = 'none';
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
        if (autoRefreshInterval) return;
        refreshConnections();
        autoRefreshInterval = setInterval(refreshConnections, 2000);
    }

    function stopAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        clearAllDurationIntervals();
    }
    
    async function refreshConnections() {
        if (document.hidden || window.location.hash !== '#monitor') return;

        const lastRefreshTime = document.getElementById('lastRefreshTime');
        if (lastRefreshTime) lastRefreshTime.textContent = `Refreshing...`;

        try {
            const response = await fetch('/monitor/connections');
            const data = await response.json();

            if (response.ok) {
                // The server sends the process list under the "connections" key.
                currentProcesses = data.connections || [];
                
                // Calculate total connections from the process list
                const totalConnections = currentProcesses.reduce((sum, proc) => sum + (proc.connection_count || 0), 0);

                renderProcesses(currentProcesses);
                updateProcessStatsCache(currentProcesses);
                updateConnectionCount(totalConnections);
            } else {
                console.error('Failed to refresh connections:', data.error);
                connectionCount.textContent = 'Error';
            }
        } catch (error) {
            console.error('Error refreshing connections:', error);
            connectionCount.textContent = 'Error';
        } finally {
            if (lastRefreshTime) lastRefreshTime.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    }

    function updateConnectionCount(count) {
        const connectionCount = document.getElementById('connectionCount');
        if (connectionCount) {
            connectionCount.textContent = `${count} Connections`;
        }
    }

    function updateProcessStatsCache(processes) {
        processes.forEach(proc => {
            if (!processStatsCache[proc.pid]) {
                processStatsCache[proc.pid] = {};
            }
            // Update cache with latest data from backend
            Object.assign(processStatsCache[proc.pid], proc);
        });
    }

    function renderProcesses(processes) {
        const processesHash = JSON.stringify(processes.map(p => ({ pid: p.pid, count: p.connection_count })));
        if (processesHash === lastProcessesHash && document.activeElement.closest('.process-item')) {
            return; // No changes in process list, avoid full re-render if user is interacting
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
                    <span class="process-name">
                        ${proc.process_name} [${proc.pid}]
                        <span class="process-info-icon" data-pid="${proc.pid}" title="Show process details">?</span>
                    </span>
                    <span class="process-connection-count">${proc.connection_count} connections</span>
                </div>
                <div class="connection-list" style="display: ${isExpanded ? 'block' : 'none'};"></div>
            `;

            const header = processItem.querySelector('.process-header');
            const connectionList = processItem.querySelector('.connection-list');
            const infoIcon = processItem.querySelector('.process-info-icon');

            header.addEventListener('click', (e) => {
                if (e.target.classList.contains('process-info-icon')) return;
                const isVisible = connectionList.style.display === 'block';
                connectionList.style.display = isVisible ? 'none' : 'block';
                processItem.classList.toggle('expanded', !isVisible);
                if (!isVisible) {
                    renderConnectionsForProcess(connectionList, proc.connections);
                }
            });

            infoIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                showProcessInfo(proc.pid);
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

    function getProcessUptime(createTime) {
        if (!createTime) return 'N/A';
        const now = new Date().getTime() / 1000;
        const duration = Math.floor(now - createTime);
        
        const d = Math.floor(duration / 86400);
        const h = Math.floor((duration % 86400) / 3600);
        const m = Math.floor((duration % 3600) / 60);

        let parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        
        return parts.join(' ') || '< 1m';
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showProcessInfo(pid) {
        const processData = processStatsCache[pid];
        if (!processData) {
            processInfoContent.innerHTML = `<div class="error-message">Could not find details for PID ${pid}.</div>`;
            processInfoPanel.style.display = 'block';
            setupProcessInfoOutsideClick();
            return;
        }

        const uptime = getProcessUptime(processData.create_time);
        const readBytes = processData.io_read_bytes || 0;
        const writeBytes = processData.io_write_bytes || 0;
        const totalData = readBytes + writeBytes;
        const conns = Array.isArray(processData.connections) ? processData.connections : [];
        const uniqueRemotes = new Set(conns.map(c => c.remote_ip)).size;
        const currentConns = processData.connection_count || 0;
        const dropped = processData.dropped_connections || 0;
        const totalObserved = currentConns + dropped;
        const dropRate = totalObserved > 0 ? ((dropped / totalObserved) * 100).toFixed(1) + '%' : '0%';

        processInfoContent.innerHTML = `
            <div class="process-info-grid">
                <!-- Basics -->
                <div class="process-info-item">
                    <div class="process-info-label">PROCESS</div>
                    <div class="process-info-value">${sanitizeHTML(processData.process_name)}</div>
                </div>
                <div class="process-info-item">
                    <div class="process-info-label">PID</div>
                    <div class="process-info-value">${processData.pid}</div>
                </div>
                
                <!-- Runtime / Memory -->
                <div class="process-info-item">
                    <div class="process-info-label">TIME ACTIVE</div>
                    <div class="process-info-value">${uptime}</div>
                </div>
                <div class="process-info-item">
                    <div class="process-info-label">MEMORY (RSS)</div>
                    <div class="process-info-value">${formatBytes(processData.memory_rss || 0)}</div>
                </div>
                
                <!-- I/O -->
                <div class="process-info-item">
                    <div class="process-info-label">DATA READ</div>
                    <div class="process-info-value">${formatBytes(readBytes)}</div>
                </div>
                <div class="process-info-item">
                    <div class="process-info-label">DATA WRITTEN</div>
                    <div class="process-info-value">${formatBytes(writeBytes)}</div>
                </div>
                <div class="process-info-item">
                    <div class="process-info-label">TOTAL I/O</div>
                    <div class="process-info-value">${formatBytes(totalData)}</div>
                </div>
                
                <!-- Connections -->
                <div class="process-info-item">
                    <div class="process-info-label">CURRENT CONNECTIONS</div>
                    <div class="process-info-value">${currentConns}</div>
                </div>
                <div class="process-info-item">
                    <div class="process-info-label">UNIQUE REMOTES</div>
                    <div class="process-info-value">${uniqueRemotes}</div>
                </div>
                <div class="process-info-item">
                    <div class="process-info-label">DROPPED CONNECTIONS</div>
                    <div class="process-info-value">${dropped}</div>
                </div>
                <div class="process-info-item">
                    <div class="process-info-label">DROP RATE</div>
                    <div class="process-info-value">${dropRate}</div>
                </div>
            </div>
        `;
        processInfoPanel.style.display = 'block';
        setupProcessInfoOutsideClick();
    }

    function setupProcessInfoOutsideClick() {
        // Delay to avoid immediate close from the opening click
        setTimeout(() => {
            if (processInfoOutsideClickHandler) {
                document.removeEventListener('click', processInfoOutsideClickHandler, true);
                processInfoOutsideClickHandler = null;
            }
            processInfoOutsideClickHandler = (e) => {
                if (!processInfoPanel.contains(e.target)) {
                    processInfoPanel.style.display = 'none';
                    document.removeEventListener('click', processInfoOutsideClickHandler, true);
                    processInfoOutsideClickHandler = null;
                }
            };
            document.addEventListener('click', processInfoOutsideClickHandler, true);
        }, 0);
    }

    function getDurationString(startTime) {
        if (!startTime) return 'N/A';
        const now = Date.now() / 1000;
        const seconds = Math.floor(now - startTime);

        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remSeconds = seconds % 60;
        return `${minutes}m ${remSeconds}s`;
    }

    // WHOIS lookup functionality
    async function performWhoisLookup(ip) {
        whoisContent.innerHTML = '<div class="loading-spinner"></div>';
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
    #closeProcessInfoBtn { display: none !important; }
`;
document.head.appendChild(style);