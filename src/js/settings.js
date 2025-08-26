document.addEventListener('DOMContentLoaded', () => {
    const hideWebsiteToggle = document.getElementById('hideWebsiteToggle');
    const autoOpenToggle = document.getElementById('autoOpenToggle');
    const autoUpdateToggle = document.getElementById('autoUpdateToggle');
    const debugModeDropdown = document.getElementById('debugModeDropdown');
    const bypassModeDropdown = document.getElementById('bypassModeDropdown');
    const runAsAdminToggle = document.getElementById('runAsAdminToggle');
    const hardwareRngToggle = document.getElementById('hardwareRngToggle');
    const pbccToggle = document.getElementById('pbccToggle');
    const acceleratedBypassingToggle = document.getElementById('acceleratedBypassingToggle');
    const serverBackendDropdown = document.getElementById('serverBackendDropdown');
    const scanningMethodDropdown = document.getElementById('scanningMethodDropdown');
    const parallelScansToggle = document.getElementById('parallelScansToggle');
    const overrideMultiplierInput = document.getElementById('overrideMultiplierInput');
    const betaFeaturesToggle = document.getElementById('betaFeaturesToggle');
    const applySettingsBtn = document.getElementById('applySettingsBtn');
    const confirmationModal = document.getElementById('confirmationModal');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const changesList = document.getElementById('changesList');
    const openWinHotspotSettingsBtn = document.getElementById('openWinHotspotSettingsBtn');
    const uiDebugModeToggle = document.getElementById('uiDebugModeToggle');
    const networkDebugModeToggle = document.getElementById('networkDebugModeToggle');
    let networkStatsInterval = null;
    let originalFetch = null;

    // Store original console methods
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug,
    };

    // Check if all elements are properly selected
    if (!hideWebsiteToggle || !autoOpenToggle || !debugModeDropdown || !bypassModeDropdown || 
        !runAsAdminToggle || !applySettingsBtn || !confirmationModal || 
        !confirmBtn || !cancelBtn || !changesList || !hardwareRngToggle ||
        !pbccToggle || !acceleratedBypassingToggle || !serverBackendDropdown || !scanningMethodDropdown || 
        !parallelScansToggle || !overrideMultiplierInput || !betaFeaturesToggle || !openWinHotspotSettingsBtn || !uiDebugModeToggle || !networkDebugModeToggle) {
        console.error('One or more settings elements are missing in the DOM.');
        return;
    }

    let currentSettings = {};

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function updateMultiplierDescription() {
        const multiplier = overrideMultiplierInput.value;
        const cpuThreads = currentSettings.cpu_thread_count || 'N/A';
        const multiplierCalcSpan = document.getElementById('multiplierCalculationSpan');
        const cpuThreadCountSpan = document.getElementById('cpuThreadCountSpan');
        const parallelScansMultiplier = document.getElementById('parallelScansMultiplier');

        if (cpuThreadCountSpan) {
            cpuThreadCountSpan.textContent = cpuThreads;
        }
        if (parallelScansMultiplier) {
            parallelScansMultiplier.textContent = multiplier;
        }

        if (multiplierCalcSpan && cpuThreads !== 'N/A') {
            const totalThreads = parseInt(multiplier, 10) * parseInt(cpuThreads, 10);
            multiplierCalcSpan.textContent = `${multiplier} x ${cpuThreads} threads = ${totalThreads} total threads`;
        } else if (multiplierCalcSpan) {
            multiplierCalcSpan.textContent = 'N/A';
        }
    }

    // Make loadOuiFileInfo globally accessible so it can be called after an update.
    window.loadOuiFileInfo = async function() {
        try {
            const response = await fetch('/misc/oui-info');
            const data = await response.json();
            const downloadOuiBtn = document.getElementById('downloadOuiBtn');

            if (!downloadOuiBtn) return;

            if (data.exists) {
                downloadOuiBtn.textContent = 'Update';
                const lastModifiedDate = new Date(data.last_modified * 1000).toLocaleDateString();
                createInfoTooltip('ouiFileInfo', `
                    <h3>OUI Database Information</h3>
                    <div class="tooltip-item">
                        <p><strong>Status:</strong> Downloaded</p>
                    </div>
                    <div class="tooltip-item">
                        <p><strong>Unique Vendors:</strong> ${data.vendor_count.toLocaleString()}</p>
                    </div>
                    <div class="tooltip-item">
                        <p><strong>Size:</strong> ${formatBytes(data.size)}</p>
                    </div>
                    <div class="tooltip-item">
                        <p><strong>Last Updated:</strong> ${lastModifiedDate}</p>
                    </div>
                `);
            } else {
                downloadOuiBtn.textContent = 'Download';
                createInfoTooltip('ouiFileInfo', `
                    <h3>OUI Database Information</h3>
                    <div class="tooltip-item">
                        <p><strong>Status:</strong> Not Downloaded</p>
                    </div>
                    <div class="tooltip-warning">The OUI (Organizationally Unique Identifier) database is required to match MAC addresses to device manufacturers during a full scan.</div>
                `);
            }
        } catch (error) {
            console.error('Failed to load OUI file info:', error);
        }
    }

    async function loadSettings() {
        try {
            const response = await fetch('/settings');
            const settings = await response.json();
            currentSettings = settings;

            // General Settings
            hideWebsiteToggle.checked = settings.hide_website || false;
            autoOpenToggle.checked = settings.auto_open_page !== false;
            autoUpdateToggle.checked = settings.auto_update !== false;
            runAsAdminToggle.checked = settings.run_as_admin || false;
            
            // Developer Settings
            debugModeDropdown.value = settings.debug_mode || 'off';
            serverBackendDropdown.value = settings.server_backend || 'waitress';
            uiDebugModeToggle.checked = settings.ui_debug_mode || false;
            networkDebugModeToggle.checked = settings.network_debug_mode || false;

            // Networking Settings
            bypassModeDropdown.value = settings.bypass_mode || 'registry';
            hardwareRngToggle.checked = settings.hardware_rng !== false;
            pbccToggle.checked = settings.pbcc_enabled || false;
            acceleratedBypassingToggle.checked = settings.accelerated_bypassing !== false;
            scanningMethodDropdown.value = settings.scanning_method || 'divide_and_conquer';
            parallelScansToggle.checked = settings.parallel_scans !== false;
            overrideMultiplierInput.value = settings.override_multiplier || 2;

            // Misc Settings
            betaFeaturesToggle.checked = settings.beta_features || false;

            applyDebugMode(settings.debug_mode);
            applyUiDebugMode(settings.ui_debug_mode);
            networkDebugModeToggle.checked = settings.network_debug_mode || false;
            applyNetworkDebugMode(settings.network_debug_mode);
            updateMultiplierDescription();
            if (window.loadOuiFileInfo) {
                window.loadOuiFileInfo();
            }
            initializeTooltips(); // Initialize tooltips after settings are loaded
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    function applyDebugMode(debugMode) {
        console.log = (debugMode === 'full' || debugMode === 'basic') ? originalConsole.log : () => {};
        console.warn = (debugMode === 'full' || debugMode === 'basic') ? originalConsole.warn : () => {};
        console.error = (debugMode === 'full' || debugMode === 'basic') ? originalConsole.error : () => {};
        console.info = (debugMode === 'full') ? originalConsole.info : () => {};
        console.debug = (debugMode === 'full') ? originalConsole.debug : () => {};
    }

    function getUpdatedSettings() {
        return {
            // General
            hide_website: hideWebsiteToggle.checked,
            auto_open_page: autoOpenToggle.checked,
            auto_update: autoUpdateToggle.checked,
            run_as_admin: runAsAdminToggle.checked,
            
            // Developer
            debug_mode: debugModeDropdown.value,
            server_backend: serverBackendDropdown.value,
            ui_debug_mode: uiDebugModeToggle.checked,
            network_debug_mode: networkDebugModeToggle.checked,

            // Networking
            bypass_mode: bypassModeDropdown.value,
            hardware_rng: hardwareRngToggle.checked,
            pbcc_enabled: pbccToggle.checked,
            accelerated_bypassing: acceleratedBypassingToggle.checked,
            scanning_method: scanningMethodDropdown.value,
            parallel_scans: parallelScansToggle.checked,
            override_multiplier: parseInt(overrideMultiplierInput.value, 10),

            // Misc
            beta_features: betaFeaturesToggle.checked
        };
    }

    function getChangedSettings(updatedSettings) {
        const changed = [];
        for (const [key, value] of Object.entries(updatedSettings)) {
            if (currentSettings[key] !== value) {
                changed.push({ key, old: currentSettings[key], new: value });
            }
        }
        return changed;
    }

    function handleSettingChange() {
        const updatedSettings = getUpdatedSettings();
        const changed = getChangedSettings(updatedSettings);
        applySettingsBtn.classList.toggle('visible', changed.length > 0);
    }

    async function saveSettings() {
        const updatedSettings = getUpdatedSettings();
        try {
            const response = await fetch('/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSettings),
            });

            if (response.ok) {
                showNotification('Settings applied successfully!', 'success');
                currentSettings = { ...updatedSettings }; // Update current settings state
                applySettingsBtn.classList.remove('visible');
                applyDebugMode(updatedSettings.debug_mode);
                applyUiDebugMode(updatedSettings.ui_debug_mode);
                applyNetworkDebugMode(updatedSettings.network_debug_mode);
                applyBetaFeatures(updatedSettings.beta_features);
            } else {
                const errorData = await response.json();
                showNotification(errorData.error || 'Failed to apply settings.', 'error');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            showNotification('An error occurred while saving settings.', 'error');
        }
    }

    function showConfirmationModal() {
        changesList.innerHTML = '';
        const updatedSettings = getUpdatedSettings();
        const changed = getChangedSettings(updatedSettings);
        const restartMessage = document.getElementById('restartRequiredMessage');

        if (changed.length === 0) {
            showNotification('No changes to apply.', 'info');
            return;
        }

        const formatValue = (value) => {
            if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
            if (typeof value === 'string') return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
            return value;
        };

        const restartRequiredKeys = ['server_backend', 'run_as_admin'];
        let restartNeeded = false;

        for (const change of changed) {
            const changeItem = document.createElement('div');
            changeItem.className = 'change-item';
            const keyName = change.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            changeItem.innerHTML = `
                <span class="change-key">${keyName}</span>
                <div class="change-values">
                    <span class="change-value-old">${formatValue(change.old)}</span>
                    <span class="change-arrow">→</span>
                    <span class="change-value-new">${formatValue(change.new)}</span>
                </div>`;
            changesList.appendChild(changeItem);

            if (restartRequiredKeys.includes(change.key)) {
                restartNeeded = true;
            }
        }

        if (restartNeeded) {
            restartMessage.textContent = 'One or more settings requires a restart.';
            restartMessage.className = 'restart-required-notice';
            restartMessage.style.display = 'block';
        } else {
            restartMessage.style.display = 'none';
        }

        confirmationModal.style.display = 'flex';
    }

    function hideConfirmationModal() {
        confirmationModal.style.display = 'none';
    }

    function applyBetaFeatures(enabled) {
        const autoTabWrapper = document.getElementById('autoTabWrapper');
        if (autoTabWrapper) {
            autoTabWrapper.style.display = enabled ? '' : 'none';
        }
        // This ensures the navigation bar correctly updates its layout
        if (window.updateNavVisibility) {
            window.updateNavVisibility();
        }
    }

    function applyUiDebugMode(enabled) {
        const body = document.body;
        const panelId = 'ui-debug-panel';
        let panel = document.getElementById(panelId);
        const boxModelOverlay = document.getElementById('ui-debug-box-model-overlay');

        if (enabled) {
            body.classList.add('ui-debug-mode-active');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = panelId;
                body.appendChild(panel);
            }
            panel.style.display = 'block';
            if (boxModelOverlay) boxModelOverlay.style.display = 'block';
            document.addEventListener('mouseover', handleUiDebugMouseover);
            document.addEventListener('click', handleUiDebugClick, true); // Use capture phase
        } else {
            body.classList.remove('ui-debug-mode-active');
            if (panel) panel.style.display = 'none';
            if (boxModelOverlay) boxModelOverlay.style.display = 'none';
            document.removeEventListener('mouseover', handleUiDebugMouseover);
            document.removeEventListener('click', handleUiDebugClick, true);
        }
    }

    function handleUiDebugClick(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            const target = e.target;
            if (target.id === 'ui-debug-panel' || target.closest('#ui-debug-panel')) return;
            
            console.log('--- UI Debug: Element Logged ---');
            console.dir(target);
            showNotification('Element logged to console.', 'info');
        }
    }

    function handleUiDebugMouseover(e) {
        const panel = document.getElementById('ui-debug-panel');
        const boxModelOverlay = document.getElementById('ui-debug-box-model-overlay');
        if (!panel || !boxModelOverlay) return;

        const target = e.target;
        if (target.id === 'ui-debug-panel' || panel.contains(target) || target.closest('#ui-debug-box-model-overlay')) {
            boxModelOverlay.style.display = 'none';
            return;
        }

        const style = window.getComputedStyle(target);

        // --- Update Box Model Visualization (only on Ctrl key) ---
        if (e.ctrlKey) {
            boxModelOverlay.style.display = 'block';
            const rect = target.getBoundingClientRect();
            
            const marginOverlay = boxModelOverlay.querySelector('.ui-debug-margin');
            const paddingOverlay = boxModelOverlay.querySelector('.ui-debug-padding');
            const contentOverlay = boxModelOverlay.querySelector('.ui-debug-content');
    
            const marginTop = parseFloat(style.marginTop);
            const marginLeft = parseFloat(style.marginLeft);
            const paddingTop = parseFloat(style.paddingTop);
            const paddingLeft = parseFloat(style.paddingLeft);
    
            marginOverlay.style.width = `${rect.width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)}px`;
            marginOverlay.style.height = `${rect.height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)}px`;
            marginOverlay.style.top = `${rect.top - marginTop}px`;
            marginOverlay.style.left = `${rect.left - marginLeft}px`;
    
            paddingOverlay.style.width = `${rect.width}px`;
            paddingOverlay.style.height = `${rect.height}px`;
            paddingOverlay.style.top = `${rect.top}px`;
            paddingOverlay.style.left = `${rect.left}px`;
    
            contentOverlay.style.width = `${rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`;
            contentOverlay.style.height = `${rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px`;
            contentOverlay.style.top = `${rect.top + paddingTop}px`;
            contentOverlay.style.left = `${rect.left + paddingLeft}px`;
        } else {
            boxModelOverlay.style.display = 'none';
        }

        // --- Update Inspector Panel ---
        const getParentInfo = (el) => {
            const view = el.closest('.view');
            const section = el.closest('.home-section, .settings-section, .misc-section, .bypass-section, .updater-container > div, .monitor-container, .history-container > div, .device-list-section, .auto-bypass-section');
            const modal = el.closest('.modal, .lookup-panel');

            if (modal) return `Modal: #${modal.id}`;
            if (view) return `View: #${view.id}`;
            if (section) return `Section: .${section.className.split(' ')[0]}`;
            return 'N/A';
        };

        const dataAttrs = Object.entries(target.dataset).map(([key, value]) => `<li><strong>data-${key}:</strong> ${value}</li>`).join('');
        
        let stateInfo = '';
        if (target.tagName === 'INPUT') {
            stateInfo += `<li><strong>Checked:</strong> ${target.checked}</li>`;
        }
        if (target.disabled !== undefined) {
            stateInfo += `<li><strong>Disabled:</strong> ${target.disabled}</li>`;
        }
        stateInfo += `<li><strong>Visible:</strong> ${style.display !== 'none' && style.visibility !== 'hidden'}</li>`;

        panel.innerHTML = `
            <div class="ui-debug-header">UI Inspector <span class="ui-debug-hint">(Ctrl+Click to log)</span></div>
            <ul>
                <li><strong>Element:</strong> &lt;${target.tagName.toLowerCase()}&gt;</li>
                <li><strong>ID:</strong> ${target.id || 'none'}</li>
                <li><strong>Classes:</strong> ${target.className || 'none'}</li>
                <li><strong>Parent:</strong> ${getParentInfo(target)}</li>
            </ul>
            <div class="ui-debug-group">
                <div class="ui-debug-subheader">State</div>
                <ul>${stateInfo}</ul>
            </div>
            <div class="ui-debug-group">
                <div class="ui-debug-subheader">Computed Style</div>
                <ul>
                    <li><strong>Font Size:</strong> ${style.fontSize}</li>
                    <li><strong>Color:</strong> ${style.color}</li>
                    <li><strong>Background:</strong> ${style.backgroundColor}</li>
                </ul>
            </div>
            ${dataAttrs ? `<div class="ui-debug-group"><div class="ui-debug-subheader">Data Attributes</div><ul>${dataAttrs}</ul></div>` : ''}
        `;
    }

    function applyNetworkDebugMode(enabled) {
        const panel = document.getElementById('network-debug-panel');
        if (!panel) return;

        if (enabled) {
            panel.style.display = 'block';
            let requestCount = 0;
            let errorCount = 0;
            let totalLatency = 0;
            let peakLatency = 0;

            panel.innerHTML = `
                <div class="network-debug-header">
                    <span class="nd-title">Network Debugger</span>
                    <button id="nd-clear-btn" class="nd-clear-btn">Clear</button>
                </div>
                <div class="network-debug-stats">
                    <div class="nd-stat"><span id="nd-req-count" class="nd-stat-value">0</span><span class="nd-stat-label">Total</span></div>
                    <div class="nd-stat"><span id="nd-err-count" class="nd-stat-value">0</span><span class="nd-stat-label">Errors</span></div>
                    <div class="nd-stat"><span id="nd-avg-latency" class="nd-stat-value">0ms</span><span class="nd-stat-label">Avg Latency</span></div>
                    <div class="nd-stat"><span id="nd-peak-latency" class="nd-stat-value">0ms</span><span class="nd-stat-label">Peak Latency</span></div>
                </div>
                <div id="network-debug-log" class="network-debug-log"></div>
            `;

            const logContainer = document.getElementById('network-debug-log');
            const reqCountEl = document.getElementById('nd-req-count');
            const errCountEl = document.getElementById('nd-err-count');
            const avgLatencyEl = document.getElementById('nd-avg-latency');
            const peakLatencyEl = document.getElementById('nd-peak-latency');
            const clearBtn = document.getElementById('nd-clear-btn');

            clearBtn.addEventListener('click', () => {
                logContainer.innerHTML = '';
                requestCount = 0;
                errorCount = 0;
                totalLatency = 0;
                peakLatency = 0;
                reqCountEl.textContent = '0';
                errCountEl.textContent = '0';
                avgLatencyEl.textContent = '0ms';
                peakLatencyEl.textContent = '0ms';
            });

            if (!originalFetch) {
                originalFetch = window.fetch;
            }

            window.fetch = async function(...args) {
                const startTime = performance.now();
                const [url, options] = args;
                const method = options?.method || 'GET';
                
                const response = await originalFetch(...args);
                
                const endTime = performance.now();
                const latency = Math.round(endTime - startTime);

                requestCount++;
                totalLatency += latency;
                if (latency > peakLatency) peakLatency = latency;
                if (!response.ok) errorCount++;

                reqCountEl.textContent = requestCount;
                errCountEl.textContent = errorCount;
                avgLatencyEl.textContent = `${Math.round(totalLatency / requestCount)}ms`;
                peakLatencyEl.textContent = `${peakLatency}ms`;

                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry';
                
                let statusClass = 'status-success';
                if (response.status >= 500) statusClass = 'status-server-error';
                else if (response.status >= 400) statusClass = 'status-client-error';

                logEntry.innerHTML = `
                    <span class="log-method">${method}</span>
                    <span class="log-url">${url}</span>
                    <span class="log-status ${statusClass}">${response.status}</span>
                    <span class="log-latency">${latency}ms</span>
                `;
                logContainer.prepend(logEntry);

                return response;
            };

        } else {
            panel.style.display = 'none';
            panel.innerHTML = '';
            if (originalFetch) {
                window.fetch = originalFetch;
                originalFetch = null;
            }
        }
    }

    function initializeTooltips() {
        const bypassModeInfo = document.getElementById('bypassModeInfo');
        const cpuThreads = currentSettings.cpu_thread_count || 'N/A';
        const parallelMultiplier = overrideMultiplierInput ? overrideMultiplierInput.value : (currentSettings.override_multiplier || 2);
    }

    const allSettingsControls = [
        hideWebsiteToggle, autoOpenToggle, autoUpdateToggle, debugModeDropdown, bypassModeDropdown,
        runAsAdminToggle, hardwareRngToggle, pbccToggle, acceleratedBypassingToggle,
        serverBackendDropdown, scanningMethodDropdown, parallelScansToggle,
        betaFeaturesToggle, overrideMultiplierInput, uiDebugModeToggle, networkDebugModeToggle
    ];

    allSettingsControls.forEach(control => {
        if (control) {
            control.addEventListener('change', handleSettingChange);
        } else {
            console.error('A control in allSettingsControls is null or undefined.');
        }
    });

    if (applySettingsBtn) {
        applySettingsBtn.addEventListener('click', showConfirmationModal);
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            saveSettings();
            hideConfirmationModal();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideConfirmationModal);
    }

    if (overrideMultiplierInput) {
        overrideMultiplierInput.addEventListener('input', updateMultiplierDescription);
    }

    if (betaFeaturesToggle) {
        betaFeaturesToggle.addEventListener('change', () => {
            applyBetaFeatures(betaFeaturesToggle.checked);
        });
    }

    // --- Tooltip Creation ---
    function createInfoTooltip(infoElementId, contentHtml) {
        if (window.createTooltip) {
            window.createTooltip(infoElementId, contentHtml);
        }
    }

    let tooltipsInitialized = false;
    function initializeTooltips() {
        if (tooltipsInitialized) return;
        tooltipsInitialized = true;

        // Tooltip for UI Debug Mode
        createInfoTooltip('uiDebugModeInfo', `
            <h3>UI Debug Mode</h3>
            <div class="tooltip-item">
                <p>Enables a suite of tools for inspecting the UI in real-time, including an inspector panel for element properties, a box model overlay, and click-to-log functionality in the console.</p>
            </div>
            <div class="tooltip-warning">
                Hold <strong>Ctrl</strong> and hover over an element to see its box model (margin, padding). <strong>Ctrl+Click</strong> an element to log it to the developer console.
            </div>
        `);

        // Tooltip for Network Debug Mode
        createInfoTooltip('networkDebugModeInfo', `
            <h3>Network Debugger</h3>
            <div class="tooltip-item">
                <p>Enables a real-time panel to monitor all client-server communication (API requests).</p>
            </div>
            <div class="tooltip-warning">
                The panel shows all outgoing 'fetch' requests, their HTTP status, and response time, along with server-side statistics.
            </div>
        `);

        // Tooltip for Bypass Mode
        createInfoTooltip('bypassModeInfo', `
            <h3>Bypass Mode Options</h3>
            <div class="tooltip-item">
                <h4>Registry Method</h4>
                <p>Modifies the Windows registry to change the MAC address. Doesn't require system restart in some cases.</p>
            </div>
            <div class="tooltip-item">
                <h4>CMD Method</h4>
                <p>Uses command line (netsh) to change the MAC address. Requires system restart.</p>
            </div>
            <div class="tooltip-warning">
                Note: Both methods will send a notification and require admin, registry allows more methods to be possible.
            </div>
        `);

        // Tooltip for PBCC
        createInfoTooltip('pbccInfo', `
            <h3>Post-Bypass Connectivity Check (PBCC)</h3>
            <div class="tooltip-item">
                <p>When enabled, the application will perform a quick check to verify internet connectivity immediately after a MAC address bypass is completed.</p>
            </div>
            <div class="tooltip-warning">
                Note: This can add a small delay to the bypass process but provides instant feedback on whether the bypass was successful.
            </div>
        `);

        // Tooltip for Scanning Method
        createInfoTooltip('scanningMethodInfo', `
            <h3>Scanning Method</h3>
            <div class="tooltip-item">
                <h4>Divide and Conquer</h4>
                <p>Prioritizes common device IPs (like .1 and .254) and then scans the rest of the network range. Generally faster.</p>
            </div>
            <div class="tooltip-item">
                <h4>Sequential</h4>
                <p>Scans all IP addresses in order from 1 to 254. More predictable but can be slower.</p>
            </div>
            <div class="tooltip-item">
                <h4>Hybrid/Adaptive</h4>
                <p>Uses a faster arp-based discovery to find online devices, then resolves details.</p>
            </div>
            <div class="tooltip-item">
                <h4>Smart</h4>
                <p>Single ARP sweep to discover hosts instantly, reuses MACs for vendor, and resolves hostnames on a tight budget.</p>
            </div>
        `);

        {
            const cpuThreads = currentSettings.cpu_thread_count || 'N/A';
            const parallelMultiplier = overrideMultiplierInput ? overrideMultiplierInput.value : (currentSettings.override_multiplier || 2);
            createInfoTooltip('parallelScansInfo', `
                <h3>Parallel Scans</h3>
                <div class="tooltip-item">
                    <p>Uses multithreading to scan multiple IPs at once, significantly speeding up discovery. This will increase CPU utilization proportionally.</p>
                </div>
                <div class="tooltip-warning">
                    Your system has <strong><span id="cpuThreadCountSpan">${cpuThreads}</span></strong> threads available. We will use <strong id="parallelScansMultiplier">${parallelMultiplier}</strong> times the amount for faster scanning.
                </div>
            `);
        }

        {
            const cpuThreads = currentSettings.cpu_thread_count || 'N/A';
            const multiplier = overrideMultiplierInput ? overrideMultiplierInput.value : (currentSettings.override_multiplier || 4);
            const totalText = (cpuThreads !== 'N/A') ? `${multiplier} x ${cpuThreads} threads = ${parseInt(multiplier,10) * parseInt(cpuThreads,10)} total threads` : 'N/A';
            createInfoTooltip('overrideMultiplierInfo', `
                <h3>Override Multiplier</h3>
                <div class="tooltip-item">
                    <p>This value is multiplied by your system's logical processor count to set the number of threads for parallel scanning.</p>
                </div>
                <div class="tooltip-warning">
                    Increasing this can speed up scans but will also increase CPU usage. The default value is ${currentSettings.override_multiplier || 4}.
                    <br><strong>Current total: <span id="multiplierCalculationSpan">${totalText}</span></strong>
                </div>
            `);
        }
        
        createInfoTooltip('acceleratedBypassingInfo', `
            <h3>Accelerated Bypassing</h3>
            <div class="tooltip-item">
                <p>When enabled, the application will automatically perform a soft restart of your network adapters after a successful bypass using a faster powershell command.</p>
            </div>
            <div class="tooltip-warning">
                While this can be faster for users it can also create more problems unless you know how to fix a unstable connection do not use.
            </div>
        `);
    }

    const settingsFab = document.getElementById('settings-fab');
    if (settingsFab) {
    }

    if (openWinHotspotSettingsBtn) {
        openWinHotspotSettingsBtn.addEventListener('click', () => {
            window.open('ms-settings:network-mobilehotspot', '_blank');
        });
    }

    // --- Initialization ---
    loadSettings();
});