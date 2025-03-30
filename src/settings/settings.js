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

    // Check if all elements are properly selected
    if (!hideWebsiteToggle || !autoOpenToggle || !debugModeDropdown || !bypassModeDropdown || 
        !runAsAdminToggle || !applySettingsBtn || !confirmationModal || 
        !confirmBtn || !cancelBtn || !changesList) {
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
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    function showConfirmationModal() {
        changesList.innerHTML = ''; 
        const updatedSettings = {
            hide_website: hideWebsiteToggle.checked,
            auto_open_page: autoOpenToggle.checked,
            debug_mode: debugModeDropdown.value,
            bypass_mode: bypassModeDropdown.value,
            run_as_admin: runAsAdminToggle.checked,
        };

        for (const [key, value] of Object.entries(updatedSettings)) {
            if (currentSettings[key] !== value) {
                const listItem = document.createElement('li');
                listItem.textContent = `${key.replace(/_/g, ' ')}: ${currentSettings[key]} → ${value}`;
                changesList.appendChild(listItem);
            }
        }

        confirmationModal.style.display = 'flex';
    }

    function hideConfirmationModal() {
        confirmationModal.style.display = 'none';
    }

    async function saveSettings() {
        const updatedSettings = {
            hide_website: hideWebsiteToggle.checked,
            auto_open_page: autoOpenToggle.checked,
            debug_mode: debugModeDropdown.value,
            bypass_mode: bypassModeDropdown.value,
            run_as_admin: runAsAdminToggle.checked,
        };
    
        try {
            const response = await fetch('/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSettings),
            });
    
            if (response.ok) {
                showNotification('Settings applied successfully!', 'success');  
                currentSettings = updatedSettings; 
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
});