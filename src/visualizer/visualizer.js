function loadD3Library() {
    if (!document.querySelector('script[src*="d3.js"]')) {
        const script = document.createElement('script');
        script.src = 'https://d3js.org/d3.v7.min.js';
        script.onload = function() {
            initVisualizer();
        };
        document.head.appendChild(script);
    } else {
        initVisualizer();
    }
}

document.getElementById('visualizerTab').addEventListener('click', () => {
    loadD3Library();
});

let networkData = [];
let svg, simulation, nodes, links, nodeElements, linkElements, routerNode;

function initVisualizer() {
    const networkGraph = document.getElementById('networkGraph');

    networkGraph.innerHTML = '';
    
    const width = networkGraph.clientWidth;
    const height = networkGraph.clientHeight;
    
    if (typeof d3 === 'undefined') {
        networkGraph.innerHTML = '<div style="color: #fff; text-align: center; margin-top: 50px;">Loading visualization library...</div>';
        setTimeout(initVisualizer, 500);
        return;
    }
    
    svg = d3.select('#networkGraph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    createLegend();
    loadVisualizerData();
    createControls();
}

function loadVisualizerData() {
    const lastScanDetails = JSON.parse(localStorage.getItem('lastScanDetails')) || {};
    
    if (lastScanDetails.scanType === 'Basic Scan') {
        console.log('Last scan was basic - looking for full scan data');
        
        fetch('/scan/history')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }
                return response.json();
            })
            .then(history => {
                const fullScan = history.find(scan => scan.type === 'Full Scan');
                if (fullScan && fullScan.results) {
                    console.log('Found full scan data in history');
                    networkData = processNetworkData(fullScan.results);
                    updateVisualization();
                } else {
                    console.log('No full scan data found - showing placeholder');
                    showNoDataMessage();
                }
            })
            .catch(error => {
                console.error('Failed to load network data from history:', error);
                showNoDataMessage();
            });
        return;
    }
    
    const savedResults = localStorage.getItem('savedScanResults');
    if (savedResults) {
        try {
            const data = JSON.parse(savedResults);
            networkData = processNetworkData(data);
            updateVisualization();
            return;
        } catch (e) {
            console.error('Failed to parse saved results:', e);
        }
    }
    
    fetch('/network/last-scan')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data && data.length > 0) {
                networkData = processNetworkData(data);
                updateVisualization();
            } else {
                showNoDataMessage();
            }
        })
        .catch(error => {
            console.error('Failed to load network data:', error);
            showNoDataMessage();
        });
}

function processNetworkData(data) {
    if (!data || data.length === 0) {
        return { nodes: [], links: [], router: null };
    }
    
    const router = data.find(d => d.is_gateway) || { 
        ip: 'Unknown', 
        mac: 'Unknown', 
        hostname: 'Router',
        is_gateway: true 
    };
    const deviceMap = new Map();
    const nodes = data.map(d => {
        const deviceKey = `${d.ip || 'Unknown'}-${d.mac || 'Unknown'}`;
        
        let uniqueId = `${d.mac || 'Unknown'}`;
        if (deviceMap.has(deviceKey)) {
            const count = deviceMap.get(deviceKey) + 1;
            deviceMap.set(deviceKey, count);
            uniqueId = `${d.mac}-${count}`;
            if (d.hostname) {
                d.hostname = `${d.hostname} (${count})`;
            }
        } else {
            deviceMap.set(deviceKey, 1);
        }
        
        return {
            id: uniqueId,
            ip: d.ip || 'Unknown',
            mac: d.mac || 'Unknown',
            hostname: d.hostname || 'Unknown',
            vendor: d.vendor || 'Unknown',
            isRouter: d.is_gateway,
            isLocal: d.is_local,
            isDisabled: false
        };
    });
    
    const links = [];
    
    if (router.mac !== 'Unknown') {
        nodes.forEach(node => {
            if (!node.isRouter) {
                links.push({
                    source: node.id,
                    target: router.mac,
                    active: false,
                    disabled: node.isDisabled
                });
            }
        });
    }
    
    return { nodes, links, router };
}

function updateVisualization() {
    const width = document.getElementById('networkGraph').clientWidth;
    const height = document.getElementById('networkGraph').clientHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    
    svg.selectAll('*').remove();
    
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', '#999');
    
    linkElements = svg.append('g')
        .attr('class', 'links-group')
        .selectAll('line')
        .data(networkData.links)
        .enter().append('line')
        .attr('class', d => `connection ${d.disabled ? 'disabled' : ''}`)
        .attr('stroke-width', 1.5);
    
    const nodeGroup = svg.append('g')
        .attr('class', 'nodes-group')
        .selectAll('g')
        .data(networkData.nodes)
        .enter().append('g')
        .attr('class', d => {
            let classes = 'device-node';
            if (d.isRouter) classes += ' router';
            else if (d.isLocal) classes += ' local';
            else classes += ' other';
            if (d.isDisabled) classes += ' disabled';
            return classes;
        })
        .on('click', handleNodeClick)
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));
    
    const maxRadius = 25;
    
    nodeGroup.append('circle')
        .attr('r', d => d.isRouter ? 20 : 12)
        .attr('fill', 'rgba(30, 30, 30, 0.7)');
    
    nodeGroup.append('text')
        .attr('class', 'device-label')
        .attr('dy', 25)
        .text(d => {
            if (d.isRouter) return 'Router';
            if (d.isLocal) return 'Local';
            return d.hostname !== 'Unknown' ? d.hostname.substring(0, 10) : d.ip.split('.')[3];
        });
    
    nodeElements = nodeGroup;
    
    routerNode = networkData.nodes.find(n => n.isRouter);
    
    if (routerNode) {
        routerNode.fx = centerX;
        routerNode.fy = centerY;
    }
    
    simulation = d3.forceSimulation(networkData.nodes)
        .force('link', d3.forceLink(networkData.links).id(d => d.id).distance(80).strength(0.7))
        .force('charge', d3.forceManyBody().strength(-250))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(25))
        .force('bound', boundingBoxForce)
        .velocityDecay(0.4)
        .alphaTarget(0.05)
        .on('tick', ticked);
    
    if (currentView === 'list') {
        const legend = document.querySelector('.legend');
        if (legend) legend.style.display = 'none';
    }
    
    updateDeviceCount();
    
    function ticked() {
        if (routerNode) {
            routerNode.x = centerX;
            routerNode.y = centerY;
        }
        
        linkElements
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        nodeGroup
            .attr('transform', d => `translate(${d.x},${d.y})`);
    }
    
    function boundingBoxForce() {
        for (let node of networkData.nodes) {
            if (node.isRouter) continue;
            
            node.x = Math.max(maxRadius, Math.min(width - maxRadius, node.x));
            node.y = Math.max(maxRadius, Math.min(height - maxRadius, node.y));
        }
    }
}

let pingUpdateInterval = null;
let currentSelectedDevice = null;

async function disableDeviceD3(device) {
    try {
        showNotification('Processing disable request...', 'info');
        
        const response = await fetch('/network/disable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: device.ip, mac: device.mac }),
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification(data.message, 'success');
            
            const disabledDevices = JSON.parse(localStorage.getItem('disabledDevices')) || [];
            disabledDevices.push(device);
            localStorage.setItem('disabledDevices', JSON.stringify(disabledDevices));
            
            device.isDisabled = true;
            
            updateVisualization();
            updateDeviceDetails(device);
        } else {
            const errorData = await response.json();
            showNotification(errorData.error || 'Failed to disable device', 'error');
        }
    } catch (error) {
        console.error('Error disabling device:', error);
        showNotification('Error disabling device', 'error');
    }
}

async function enableDeviceD3(device) {
    try {
        showNotification('Processing enable request...', 'info');
        
        const response = await fetch('/network/enable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: device.ip, mac: device.mac }),
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification(data.message, 'success');
            
            let disabledDevices = JSON.parse(localStorage.getItem('disabledDevices')) || [];
            disabledDevices = disabledDevices.filter(d => d.mac !== device.mac);
            localStorage.setItem('disabledDevices', JSON.stringify(disabledDevices));
            
            device.isDisabled = false;
            
            updateVisualization();
            updateDeviceDetails(device);
        } else {
            const errorData = await response.json();
            showNotification(errorData.error || 'Failed to enable device', 'error');
        }
    } catch (error) {
        console.error('Error enabling device:', error);
        showNotification('Error enabling device', 'error');
    }
}

function showNotification(message, type = 'success') {
    const notificationContainer = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationContainer.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => notification.remove(), 3000);
}

function createControls() {
    const controls = document.createElement('div');
    controls.className = 'visualizer-controls';
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'visualizer-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', loadVisualizerData);
    
    const resetBtn = document.createElement('button');
    resetBtn.className = 'visualizer-btn';
    resetBtn.textContent = 'Reset View';
    resetBtn.addEventListener('click', () => {
        if (simulation) simulation.alpha(1).restart();
    });
    
    const toggleViewBtn = document.createElement('button');
    toggleViewBtn.className = 'visualizer-btn';
    toggleViewBtn.textContent = 'Switch to List View';
    toggleViewBtn.id = 'toggleViewBtn';
    toggleViewBtn.addEventListener('click', toggleView);
    
    controls.appendChild(refreshBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(toggleViewBtn);
    
    document.getElementById('networkGraph').appendChild(controls);
}

let currentView = 'graph';

function toggleView() {
    const networkGraph = document.getElementById('networkGraph');
    const toggleBtn = document.getElementById('toggleViewBtn');
    const legend = document.querySelector('.legend'); 
    
    if (currentView === 'graph') {
        currentView = 'list';
        toggleBtn.textContent = 'Switch to Graph View';
        
        if (svg) svg.style('display', 'none');
        
        if (legend) legend.style.display = 'none';
        
        createListView(networkGraph);
    } else {
        currentView = 'graph';
        toggleBtn.textContent = 'Switch to List View';
        
        const listView = document.getElementById('deviceListView');
        if (listView) listView.remove();       
        if (legend) legend.style.display = 'block';
        if (svg) svg.style('display', 'block');
    }
}

function createListView(container) {
    const existingList = document.getElementById('deviceListView');
    if (existingList) existingList.remove();
    const listView = document.createElement('div');
    listView.id = 'deviceListView';
    listView.className = 'device-list-view';
    const title = document.createElement('h3');
    title.textContent = 'Network Devices';
    title.style.color = '#fff';
    title.style.margin = '10px 0';
    listView.appendChild(title);
    
    const deviceList = document.createElement('div');
    deviceList.className = 'device-list';
    
    const routerDevices = networkData.nodes.filter(d => d.isRouter);
    const localDevices = networkData.nodes.filter(d => d.isLocal);
    const otherDevices = networkData.nodes.filter(d => !d.isRouter && !d.isLocal);
    
    const addDeviceCategory = (devices, categoryName, categoryClass) => {
        if (devices.length === 0) return;
        
        const category = document.createElement('div');
        category.className = 'device-category';
        
        const categoryTitle = document.createElement('h4');
        categoryTitle.textContent = categoryName;
        categoryTitle.className = categoryClass;
        category.appendChild(categoryTitle);
        
        devices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = `device-list-item ${device.isDisabled ? 'disabled' : ''}`;
            deviceItem.dataset.id = device.id;
            
            const deviceIcon = document.createElement('span');
            deviceIcon.className = `device-icon ${categoryClass}`;
            deviceIcon.innerHTML = '●';
            
            const deviceName = document.createElement('span');
            deviceName.className = 'device-name';
            deviceName.textContent = device.hostname || `Device ${device.ip.split('.')[3]}`;
            
            const deviceIP = document.createElement('span');
            deviceIP.className = 'device-ip';
            deviceIP.textContent = device.ip;
            
            deviceItem.appendChild(deviceIcon);
            deviceItem.appendChild(deviceName);
            deviceItem.appendChild(deviceIP);
            
            deviceItem.addEventListener('click', () => {
                document.querySelectorAll('.device-list-item.selected').forEach(el => 
                    el.classList.remove('selected'));
                
                deviceItem.classList.add('selected');
                
                updateDeviceDetails(device);
            });
            
            category.appendChild(deviceItem);
        });
        
        deviceList.appendChild(category);
    };
    
    addDeviceCategory(routerDevices, 'Routers', 'router-category');
    addDeviceCategory(localDevices, 'Your Devices', 'local-category');
    addDeviceCategory(otherDevices, 'Network Devices', 'other-category');
    
    listView.appendChild(deviceList);
    container.appendChild(listView);
    
    addListViewStyles();
}

function addListViewStyles() {
    if (!document.getElementById('listViewStyles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'listViewStyles';
        styleSheet.textContent = `
            .device-list-view {
                padding: 10px;
                background-color: rgba(30, 30, 30, 0.7);
                border-radius: 8px;
                max-height: calc(100% - 100px);
                overflow-y: auto;
                margin: 10px;
            }
            
            .device-list {
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            
            .device-category h4 {
                margin: 5px 0;
                padding-bottom: 5px;
                border-bottom: 1px solid #444;
                color: #ccc;
            }
            
            .router-category {
                color: #ff9800;
            }
            
            .local-category {
                color: #2196f3;
            }
            
            .other-category {
                color: #4caf50;
            }
            
            .device-list-item {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
                margin: 2px 0;
                color: #e0e0e0;
            }
            
            .device-list-item:hover {
                background-color: #333;
            }
            
            .device-list-item.selected {
                background-color: #444;
                border-left: 3px solid #2196f3;
            }
            
            .device-list-item.disabled {
                opacity: 0.6;
            }
            
            .device-icon {
                margin-right: 10px;
                font-size: 12px;
            }
            
            .device-name {
                flex-grow: 1;
            }
            
            .device-ip {
                color: #999;
                font-size: 0.9em;
            }
        `;
        document.head.appendChild(styleSheet);
    }
}

function createLegend() {
    const legend = document.createElement('div');
    legend.className = 'legend';
    if (currentView === 'list') {
        legend.style.display = 'none';
    }
    
    const items = [
        { type: 'router', label: 'Router' },
        { type: 'local', label: 'Local Device' },
        { type: 'other', label: 'Network Device' },
        { type: 'disabled', label: 'Disabled Device' }
    ];
    
    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'legend-item';
        
        const colorSpan = document.createElement('span');
        colorSpan.className = `legend-color legend-${item.type}`;
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        
        itemDiv.appendChild(colorSpan);
        itemDiv.appendChild(labelSpan);
        legend.appendChild(itemDiv);
    });
    
    document.getElementById('networkGraph').appendChild(legend);
    return legend;
}

function updateDeviceCount() {
    const deviceCount = document.createElement('div');
    deviceCount.className = 'device-count';
    
    const total = networkData.nodes.length;
    const active = networkData.nodes.filter(n => !n.isDisabled).length;
    const disabled = total - active;
    
    deviceCount.textContent = `Devices: ${active} active, ${disabled} disabled`;
    
    document.getElementById('networkGraph').appendChild(deviceCount);
}

function showNoDataMessage() {
    const deviceDetails = document.getElementById('deviceDetailsContent');
    deviceDetails.innerHTML = '<p class="details-prompt">No network data available. Please run a full scan first.</p>';
    
    const networkGraph = document.getElementById('networkGraph');
    
    const existingMessage = networkGraph.querySelector('.no-data-message');
    if (!existingMessage) {
        const message = document.createElement('div');
        message.className = 'no-data-message';
        message.style.position = 'absolute';
        message.style.top = '50%';
        message.style.left = '50%';
        message.style.transform = 'translate(-50%, -50%)';
        message.style.color = '#a0a0a0';
        message.style.fontSize = '18px';
        message.textContent = 'No network data available. Please run a full scan.';
        
        networkGraph.appendChild(message);

    }
}

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    if (!d.isRouter) {
        d.fx = d.x;
        d.fy = d.y;
    }
}

function dragged(event, d) {
    if (d.isRouter) return;
    
    const width = document.getElementById('networkGraph').clientWidth;
    const height = document.getElementById('networkGraph').clientHeight;

    const maxRadius = 25;
    
    d.fx = Math.max(maxRadius, Math.min(width - maxRadius, event.x));
    d.fy = Math.max(maxRadius, Math.min(height - maxRadius, event.y));
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    if (!d.isRouter) {
        d.fx = null;
        d.fy = null;
    }
}

if (document.getElementById('visualizerView').style.display === 'block') {
    loadD3Library();
}

function updateDeviceDetails(d) {
    const deviceDetails = document.getElementById('deviceDetailsContent');
    
    deviceDetails.innerHTML = `
        <div class="detail-item">
            <div class="detail-label">Device Type</div>
            <div class="detail-value">${d.isRouter ? 'Router' : d.isLocal ? 'Local Device' : 'Network Device'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">IP Address</div>
            <div class="detail-value">${d.ip}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">MAC Address</div>
            <div class="detail-value">${d.mac}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Hostname</div>
            <div class="detail-value">${d.hostname || 'Unknown'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Vendor</div>
            <div class="detail-value">${d.vendor || 'Unknown'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Status</div>
            <div class="detail-value">${d.isDisabled ? 'Disabled' : 'Active'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Ping</div>
            <div class="detail-value ping-value">Calculating...</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Signal Strength</div>
            <div class="detail-value">Calculating...</div>
        </div>
    `;
    
    if (!d.isDisabled && !d.isRouter && !d.isLocal) {
        const actionButton = document.createElement('div');
        actionButton.className = 'detail-item';
        actionButton.style.marginTop = '20px';
        
        const disableBtn = document.createElement('button');
        disableBtn.className = 'visualizer-btn';
        disableBtn.style.backgroundColor = '#f44336';
        disableBtn.style.width = '100%';
        disableBtn.textContent = 'Disable Device';
        disableBtn.addEventListener('click', () => disableDeviceD3(d));
        
        actionButton.appendChild(disableBtn);
        deviceDetails.appendChild(actionButton);
    } 
    else if (d.isDisabled) {
        const actionButton = document.createElement('div');
        actionButton.className = 'detail-item';
        actionButton.style.marginTop = '20px';
        
        const enableBtn = document.createElement('button');
        enableBtn.className = 'visualizer-btn';
        enableBtn.style.backgroundColor = '#4caf50';
        enableBtn.style.width = '100%';
        enableBtn.textContent = 'Enable Device';
        enableBtn.addEventListener('click', () => enableDeviceD3(d));
        
        actionButton.appendChild(enableBtn);
        deviceDetails.appendChild(actionButton);
    }
    
    currentSelectedDevice = d;
    
    if (!d.isDisabled && d.ip !== 'Unknown') {
        updateLivePing();
    }
}

function showDeviceDetails(device) {
    const deviceElement = createDeviceElement(device);
    deviceListContainer.appendChild(deviceElement);
    
    const signalIndicator = deviceElement.querySelector('.signal-indicator');
    const pingTimeElement = deviceElement.querySelector('.ping-time');
    
    PingManager.startMonitoring(device.ip, (pingData) => {
        if (pingData.success) {
            signalIndicator.style.width = `${pingData.signal}%`;
            pingTimeElement.textContent = `${pingData.time}ms`;
        } else {
            signalIndicator.style.width = '0%';
            pingTimeElement.textContent = 'Failed';
        }
    });
}

function hideDeviceDetails(device) {
    PingManager.stopMonitoring(device.ip);
}

const StreamingPingManager = {
    clientId: null,
    eventSource: null,
    currentIp: null,
    
    callbacks: {},
    lastPingData: {},
    
    isVisualizerActive: false,
    
    init: function() {
        this.clientId = 'ping-client-' + Math.random().toString(36).substring(2, 15);
        this.setupTabChangeDetection();
        
        console.log('Streaming Ping Manager initialized with client ID:', this.clientId);
    },
    
    setupTabChangeDetection: function() {
        const visualizerView = document.getElementById('visualizerView');
        if (!visualizerView) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'style') {
                    const isVisible = visualizerView.style.display === 'block';
                    
                    if (!isVisible && this.isVisualizerActive) {
                        console.log('Visualizer tab deactivated, stopping ping monitoring');
                        this.isVisualizerActive = false;
                        this.stopAll();
                    }
                    this.isVisualizerActive = isVisible;
                }
            });
        });
        
        observer.observe(visualizerView, { attributes: true });
        this.isVisualizerActive = visualizerView.style.display === 'block';
        
        document.querySelectorAll('.tab').forEach(tab => {
            if (tab.id !== 'visualizerTab') {
                tab.addEventListener('click', () => {
                    console.log('Non-visualizer tab clicked, stopping ping monitoring');
                    this.isVisualizerActive = false;
                    this.stopAll();
                });
            } else {
                tab.addEventListener('click', () => {
                    console.log('Visualizer tab clicked, setting active state');
                    this.isVisualizerActive = true;
                });
            }
        });
    },
    
    monitor: function(ip, callback) {
        if (!this.isVisualizerActive) {
            console.log('Visualizer not active, aborting monitor request for', ip);
            return;
        }
        
        this.callbacks[ip] = callback;
        
        if (this.currentIp === ip && this.eventSource) {
            if (this.lastPingData[ip] && callback) {
                callback(this.lastPingData[ip]);
            }
            return;
        }
        
        this.stopAll(false); 
        
        this.currentIp = ip;
        
        console.log('Starting ping monitoring for IP:', ip);
        
        const timestamp = new Date().getTime();
        const url = `/api/ping/stream?ip=${ip}&client=${this.clientId}&t=${timestamp}`;
        this.eventSource = new EventSource(url);
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                this.lastPingData[ip] = data;

                const callback = this.callbacks[ip];
                if (callback) {
                    callback(data);
                }
            } catch (error) {
                console.error('Error processing ping update:', error);
            }
        };
        
        this.eventSource.onerror = (error) => {
            console.error('Ping stream connection error:', error);
            
            if (this.isVisualizerActive) {
                this.stopAll(false); 
                
                setTimeout(() => {
                    if (this.callbacks[ip] && this.isVisualizerActive) {
                        this.monitor(ip, this.callbacks[ip]);
                    }
                }, 1000); 
            } else {
                this.stopAll(false);
            }
        };
        
        this.eventSource.onopen = () => {
            console.log('Ping stream connection opened for', ip);
        };
    },
    
    stopMonitoring: function(ip) {
        delete this.callbacks[ip];
        
        if (this.currentIp === ip) {
            this.stopAll();
        }
    },
    
    stopAll: function(sendStopRequest = true) {
        const clientIdToStop = this.clientId;
        
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        
        if (sendStopRequest && clientIdToStop) {
            console.log('Sending stop request for client:', clientIdToStop);
            
            fetch('/api/ping/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client: clientIdToStop })
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success && data.message !== "Client not found") {
                    console.warn('Stop ping request response:', data);
                }
            })
            .catch(error => {
                console.error('Error stopping ping stream:', error);
            });
        }
        
        this.currentIp = null;
    },
    
    cleanup: function() {
        this.stopAll();
        this.callbacks = {};
        this.lastPingData = {};
    }
};

document.querySelectorAll('.tab').forEach(tab => {
    if (tab.id !== 'visualizerTab') {
        tab.addEventListener('click', () => {
            StreamingPingManager.stopAll();
        });
    }
});

function updateLivePing() {
    if (!currentSelectedDevice || currentSelectedDevice.disabled || currentSelectedDevice.isDisabled) return;

    const ipAddress = currentSelectedDevice.ip;
    if (ipAddress === 'Unknown') return;

    StreamingPingManager.monitor(ipAddress, (pingData) => {
        if (!currentSelectedDevice || currentSelectedDevice.ip !== ipAddress) return;
        const pingElement = document.querySelector('#deviceDetailsContent .detail-item:nth-child(7) .detail-value');
        const signalElement = document.querySelector('#deviceDetailsContent .detail-item:nth-child(8) .detail-value');

        if (!pingElement || !signalElement) return;

        if (pingData.time !== undefined) {
            pingElement.textContent = `${pingData.time} ms`;
            pingElement.style.color = pingData.time < 50 ? '#4caf50' :
                                     pingData.time < 100 ? '#ff9800' : '#f44336';
        } else if (pingData.processing) {
            pingElement.textContent = 'Calculating...';
            pingElement.style.color = '#999';
        }

        if (pingData.signal !== undefined) {
            signalElement.textContent = `${Math.round(pingData.signal)}%`;
            signalElement.style.color = pingData.signal > 70 ? '#4caf50' :
                                       pingData.signal > 40 ? '#ff9800' : '#f44336';
        } else if (pingData.processing) {
            signalElement.textContent = 'Calculating...';
            signalElement.style.color = '#999';
        }
    });
}

function handleNodeClick(_, d) {
    if (currentSelectedDevice && currentSelectedDevice.ip !== d.ip) {
        StreamingPingManager.stopMonitoring(currentSelectedDevice.ip);
    }
    
    linkElements.classed('active', false);
    nodeElements.classed('selected', false);
    d3.select(this).classed('selected', true);
    
    linkElements.each(function(link) {
        if (link.source.id === d.id || link.target.id === d.id) {
            d3.select(this).classed('active', true);
        }
    });
    
    updateDeviceDetails(d);
    if (!d.isDisabled && d.ip !== 'Unknown') {
        updateLivePing();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    StreamingPingManager.init();
    const visualizerView = document.getElementById('visualizerView');
    if (visualizerView) {
        StreamingPingManager.isVisualizerActive = visualizerView.style.display === 'block';
    }
    const visualizerTab = document.getElementById('visualizerTab');
    if (visualizerTab) {
        visualizerTab.addEventListener('click', () => {
            StreamingPingManager.isVisualizerActive = true;
            console.log('Visualizer tab activated');
            if (currentSelectedDevice && !currentSelectedDevice.disabled && !currentSelectedDevice.isDisabled) {
                updateLivePing();
            }
            
            // load D3 
            loadD3Library();
        });
    }
});