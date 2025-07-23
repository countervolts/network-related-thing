document.addEventListener('DOMContentLoaded', () => {
    const hideWebsiteToggle = document.getElementById('hideWebsiteToggle');
    const autoOpenToggle = document.getElementById('autoOpenToggle');
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
        !parallelScansToggle || !overrideMultiplierInput || !betaFeaturesToggle || !openWinHotspotSettingsBtn) {
        console.error('One or more settings elements are missing in the DOM.');
        return;
    }

    let currentSettings = {};

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

    async function loadSettings() {
        try {
            const response = await fetch('/settings');
            const settings = await response.json();
            currentSettings = settings;

            // General Settings
            hideWebsiteToggle.checked = settings.hide_website || false;
            autoOpenToggle.checked = settings.auto_open_page !== false;
            runAsAdminToggle.checked = settings.run_as_admin || false;
            
            // Developer Settings
            debugModeDropdown.value = settings.debug_mode || 'off';
            serverBackendDropdown.value = settings.server_backend || 'waitress';

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
            updateMultiplierDescription();
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
            run_as_admin: runAsAdminToggle.checked,
            
            // Developer
            debug_mode: debugModeDropdown.value,
            server_backend: serverBackendDropdown.value,

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
            autoTabWrapper.style.display = enabled ? 'block' : 'none';
        }
    
        const navTabDropdownOptions = document.querySelector('#navTabDropdown .custom-options');
        if (navTabDropdownOptions) {
            const autoTabOption = navTabDropdownOptions.querySelector('label[for="nav-toggle-autoTab"]');
            if (autoTabOption) {
                autoTabOption.style.display = enabled ? 'block' : 'none';
                if (!enabled) {
                    const checkbox = autoTabOption.querySelector('input');
                    if (checkbox && checkbox.checked) {
                        checkbox.checked = false;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }
        }
    
        if (window.updateActiveNavLink) {
            window.updateActiveNavLink();
        }
    }

    const allSettingsControls = [
        hideWebsiteToggle, autoOpenToggle, debugModeDropdown, bypassModeDropdown,
        runAsAdminToggle, hardwareRngToggle, pbccToggle, acceleratedBypassingToggle,
        serverBackendDropdown, scanningMethodDropdown, parallelScansToggle,
        betaFeaturesToggle, overrideMultiplierInput
    ];

    allSettingsControls.forEach(control => {
        if (control) {
            control.addEventListener('change', handleSettingChange);
        } else {
            console.error('A control in allSettingsControls is null or undefined.');
        }
    });

    if (overrideMultiplierInput) {
        overrideMultiplierInput.addEventListener('input', updateMultiplierDescription);
    }

    if (betaFeaturesToggle) {
        betaFeaturesToggle.addEventListener('change', () => {
            applyBetaFeatures(betaFeaturesToggle.checked);
        });
    }

    applySettingsBtn.addEventListener('click', showConfirmationModal);
    confirmBtn.addEventListener('click', () => {
        hideConfirmationModal();
        saveSettings();
    });
    cancelBtn.addEventListener('click', hideConfirmationModal);

    // --- Tooltip Creation ---
    function createInfoTooltip(infoElementId, contentHtml) {
        const infoElement = document.getElementById(infoElementId);
        if (!infoElement) return;

        const tooltipId = `${infoElementId}-tooltip`;

        // Remove any existing tooltip to prevent duplicates
        const existingTooltip = document.getElementById(tooltipId);
        if (existingTooltip) {
            existingTooltip.remove();
        }

        const tooltip = document.createElement('div');
        tooltip.id = tooltipId;
        tooltip.className = 'tooltip';
        tooltip.style.position = 'fixed';
        tooltip.style.zIndex = '99999';
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
        tooltip.style.transition = 'opacity 0.3s, visibility 0.3s';
        tooltip.innerHTML = contentHtml;
        document.body.appendChild(tooltip);

        let shouldHideTooltip = false;

        const showTooltip = () => {
            shouldHideTooltip = false;
            const rect = infoElement.getBoundingClientRect();
            tooltip.style.left = `${rect.right + 10}px`;
            tooltip.style.top = `${rect.top - 10}px`;
            tooltip.style.display = 'block';
            setTimeout(() => {
                tooltip.style.opacity = '1';
                tooltip.style.visibility = 'visible';
            }, 10);
        };

        const hideTooltip = () => {
            shouldHideTooltip = true;
            setTimeout(() => {
                if (shouldHideTooltip) {
                    tooltip.style.opacity = '0';
                    tooltip.style.visibility = 'hidden';
                    setTimeout(() => {
                        tooltip.style.display = 'none';
                    }, 300);
                }
            }, 50);
        };

        infoElement.addEventListener('mouseenter', showTooltip);
        infoElement.addEventListener('mouseleave', hideTooltip);
        tooltip.addEventListener('mouseenter', () => { shouldHideTooltip = false; });
        tooltip.addEventListener('mouseleave', hideTooltip);
    }

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
    `);

    createInfoTooltip('parallelScansInfo', `
        <h3>Parallel Scans</h3>
        <div class="tooltip-item">
            <p>Uses multithreading to scan multiple IPs at once, significantly speeding up discovery, with that it will use more CPU utilization.</p>
        </div>
        <div class="tooltip-warning">
            Your system has <strong><span id="cpuThreadCountSpan">N/A</span></strong> threads available. We will use <strong id="parallelScansMultiplier">2</strong> times the amount for faster scanning.
        </div>
    `);

    // Tooltip for Override Multiplier
    createInfoTooltip('overrideMultiplierInfo', `
        <h3>Override Multiplier</h3>
        <div class="tooltip-item">
            <p>This value is multiplied by your system's logical processor count to set the number of threads for parallel scanning.</p>
        </div>
        <div class="tooltip-warning">
            Increasing this can speed up scans but will also increase CPU usage. The default value is 4.
            <br><strong>Current total: <span id="multiplierCalculationSpan">...</span></strong>
        </div>
    `);
    
    // Tooltip for Accelerated Bypassing
    createInfoTooltip('acceleratedBypassingInfo', `
        <h3>Accelerated Bypassing</h3>
        <div class="tooltip-item">
            <p>When enabled, the application will automatically perform a soft restart of your network adapters after a successful bypass using a faster PowerShell command. This is the recommended setting for most users.</p>
        </div>
        <div class="tooltip-warning">
            This method is generally faster than a full disable/enable cycle and reduces the time your network is unavailable. Disable this only if you prefer to restart the adapter manually.
        </div>
    `);

    if (openWinHotspotSettingsBtn) {
        openWinHotspotSettingsBtn.addEventListener('click', () => {
            window.open('ms-settings:network-mobilehotspot', '_blank');
        });
    }

    // --- Initialization ---
    loadSettings();
});