document.addEventListener('DOMContentLoaded', () => {
    const hideWebsiteToggle = document.getElementById('hideWebsiteToggle');
    const autoOpenToggle = document.getElementById('autoOpenToggle');
    const debugModeDropdown = document.getElementById('debugModeDropdown');
    const bypassModeDropdown = document.getElementById('bypassModeDropdown');
    const runAsAdminToggle = document.getElementById('runAsAdminToggle');
    const applySettingsBtn = document.getElementById('applySettingsBtn');
    const confirmationModal = document.getElementById('confirmationModal');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const changesList = document.getElementById('changesList');
    const preserveHotspotToggle = document.getElementById('preserveHotspotToggle');

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
        !confirmBtn || !cancelBtn || !changesList || !preserveHotspotToggle) {
        console.error('One or more elements are missing in the DOM.');
        return;
    }

    let currentSettings = {};

    async function loadSettings() {
        try {
            const response = await fetch('/settings');
            const settings = await response.json();
            currentSettings = settings;
            hideWebsiteToggle.checked = settings.hide_website;
            autoOpenToggle.checked = settings.auto_open_page;
            debugModeDropdown.value = settings.debug_mode || 'off';
            bypassModeDropdown.value = settings.bypass_mode || 'registry';
            runAsAdminToggle.checked = settings.run_as_admin || false;
            preserveHotspotToggle.checked = settings.preserve_hotspot || false;

            applyDebugMode(settings.debug_mode);
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    function applyDebugMode(debugMode) {
        if (debugMode === 'off') {
            console.log = console.warn = console.error = console.info = console.debug = () => {};
        } else if (debugMode === 'basic') {
            console.log = originalConsole.log;
            console.warn = originalConsole.warn;
            console.error = originalConsole.error;
            console.info = () => {}; 
            console.debug = () => {}; 
        } else if (debugMode === 'full') {
            console.log = originalConsole.log;
            console.warn = originalConsole.warn;
            console.error = originalConsole.error;
            console.info = originalConsole.info;
            console.debug = originalConsole.debug;
        }
    }

    function getUpdatedSettings() {
        return {
            hide_website: hideWebsiteToggle.checked,
            auto_open_page: autoOpenToggle.checked,
            debug_mode: debugModeDropdown.value,
            bypass_mode: bypassModeDropdown.value,
            run_as_admin: runAsAdminToggle.checked,
            preserve_hotspot: preserveHotspotToggle.checked,
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

    function showConfirmationModal() {
        changesList.innerHTML = '';
        const updatedSettings = getUpdatedSettings();
        const changed = getChangedSettings(updatedSettings);

        if (changed.length === 0) {
            showNotification('No changes to apply.', 'info');
            return;
        }

        for (const change of changed) {
            const listItem = document.createElement('li');
            listItem.textContent = `${change.key.replace(/_/g, ' ')}: ${change.old} → ${change.new}`;
            changesList.appendChild(listItem);
        }

        confirmationModal.style.display = 'flex';
    }

    function hideConfirmationModal() {
        confirmationModal.style.display = 'none';
    }

    async function saveSettings() {
        const updatedSettings = getUpdatedSettings();
        const changed = getChangedSettings(updatedSettings);

        if (changed.length === 0) {
            showNotification('No changes to apply.', 'info');
            return;
        }

        try {
            const response = await fetch('/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSettings),
            });

            if (response.ok) {
                showNotification('Settings applied successfully!', 'success');
                currentSettings = updatedSettings;

                // Apply debug mode settings dynamically
                applyDebugMode(updatedSettings.debug_mode);

                // Refresh bypass view if it's currently visible and bypass mode changed
                if (document.getElementById('bypassView').style.display === 'block' &&
                    currentSettings.bypass_mode !== updatedSettings.bypass_mode) {
                    document.getElementById('bypassTab').click();
                }
            } else {
                showNotification('Failed to apply settings.', 'error');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            showNotification('An error occurred while saving settings.', 'error');
        }
    }

    confirmBtn.addEventListener('click', () => {
        hideConfirmationModal();
        saveSettings();
    });

    cancelBtn.addEventListener('click', hideConfirmationModal);
    applySettingsBtn.addEventListener('click', showConfirmationModal);
    loadSettings();

    // Add tooltip for bypass mode info
    const bypassModeInfo = document.getElementById('bypassModeInfo');
    if (bypassModeInfo) {
        // First, ensure debug mode item has a very low z-index
        const debugModeItem = document.getElementById('debugModeDropdown').closest('.setting-item');
        if (debugModeItem) {
            debugModeItem.style.zIndex = '1'; // Very low z-index
        }
        
        // Remove any existing tooltip to avoid duplicates
        const existingTooltip = bypassModeInfo.querySelector('.tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        // Create the tooltip with a high z-index that will be appended to body
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.style.position = 'fixed'; // Use fixed instead of absolute
        tooltip.style.zIndex = '99999'; // Extremely high z-index
        tooltip.style.display = 'none'; // Hidden by default
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
        tooltip.style.transition = 'opacity 0.3s, visibility 0.3s';
        
        tooltip.innerHTML = `
            <h3>Bypass Mode Options</h3>
            
            <div class="tooltip-item">
                <h4>Registry Method</h4>
                <p>Modifies the Windows registry to change the MAC address. Doesn't require system restart in some cases.</p>
            </div>
            
            <div class="tooltip-item">
                <h4>CMD Method</h4>
                <p>Uses command line (netsh) to change the MAC address. Requires system restart.</p>
            </div>
            
            <div class="tooltip-warning" style="z-index: 99999;">
                Note: Both methods will send a notification and require admin, registry allows more methods to be possible.
            </div>
        `;
        
        document.body.appendChild(tooltip);
        
        let shouldHideTooltip = false;
        
        bypassModeInfo.addEventListener('mouseenter', () => {
            shouldHideTooltip = false;
            const rect = bypassModeInfo.getBoundingClientRect();
            tooltip.style.left = `${rect.right + 10}px`;
            tooltip.style.top = `${rect.top - 10}px`;
            tooltip.style.display = 'block';
            setTimeout(() => {
                tooltip.style.opacity = '1';
                tooltip.style.visibility = 'visible';
            }, 10);
        });
        
        bypassModeInfo.addEventListener('mouseleave', () => {
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
        });
        
        tooltip.addEventListener('mouseenter', () => {
            shouldHideTooltip = false;
        });
        
        tooltip.addEventListener('mouseleave', () => {
            shouldHideTooltip = true;
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
            setTimeout(() => {
                tooltip.style.display = 'none';
            }, 300);
        });
    }
});