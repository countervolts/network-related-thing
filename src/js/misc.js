document.addEventListener('DOMContentLoaded', () => {
    const clearConsoleBtn = document.getElementById('clearConsoleBtn');
    const clearLocalStorageBtn = document.getElementById('clearLocalStorageBtn');
    const downloadOuiBtn = document.getElementById('downloadOuiBtn');
    const clearHistoryDropdown = document.getElementById('clearHistoryDropdown');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const openHistoryFolderBtn = document.getElementById('openHistoryFolderBtn');
    const notificationContainer = document.getElementById('notificationContainer');
    const restartAdaptersBtn = document.getElementById('restartAdaptersBtn');
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');

    if (clearConsoleBtn) {
        clearConsoleBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/clear-console', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                const data = await response.json();
                if (response.ok) {
                    window['showNotification'](data.message, 'success');  
                } else {
                    window['showNotification'](data.error || 'Failed to clear console.', 'error');  
                }
            } catch (error) {
                console.error('Error clearing console:', error);
                window['showNotification']('An error occurred while clearing the console.', 'error');  
            }
        });
    }

    if (clearLocalStorageBtn) {
        clearLocalStorageBtn.addEventListener('click', () => {
            // Clear all localStorage data
            localStorage.clear();

            // Notify the user
            window['showNotification']('Local storage cleared successfully!', 'success');

            // Dispatch a custom event to notify other parts of the app
            const event = new Event('localStorageCleared');
            document.dispatchEvent(event);

            // Optionally, reload the page to apply a clean state
            // location.reload();
        });
    }

    if (downloadOuiBtn) {
        downloadOuiBtn.addEventListener('click', async () => {
            const isUpdate = downloadOuiBtn.textContent.trim() === 'Update';
            let initialVendorCount = 0;

            // Get the current vendor count before updating
            if (isUpdate) {
                try {
                    const infoResponse = await fetch('/misc/oui-info');
                    if (infoResponse.ok) {
                        const infoData = await infoResponse.json();
                        if (infoData.exists) {
                            initialVendorCount = infoData.vendor_count;
                        }
                    }
                } catch (e) {
                    console.warn("Could not get initial OUI info, defaulting to 0.", e);
                }
            }

            window['showNotification'](isUpdate ? 'Updating OUI file...' : 'Downloading OUI file...', 'info');
        
            try {
                const downloadResponse = await fetch('/misc/download-oui', { method: 'GET' });
                if (!downloadResponse.ok) {
                    const errorData = await downloadResponse.json();
                    throw new Error(errorData.error || 'Failed to download OUI file.');
                }

                // After download, get the new info
                const newInfoResponse = await fetch('/misc/oui-info');
                if (!newInfoResponse.ok) {
                    throw new Error('Could not retrieve new OUI file information.');
                }
                const newInfoData = await newInfoResponse.json();
                const newVendorCount = newInfoData.vendor_count || 0;
                
                let notificationMessage = 'OUI file updated successfully.';
                if (isUpdate) {
                    const diff = newVendorCount - initialVendorCount;
                    if (diff > 0) {
                        notificationMessage = `OUI file updated. Added ${diff.toLocaleString()} new vendors.`;
                    } else if (diff < 0) {
                        notificationMessage = `OUI file updated. ${Math.abs(diff).toLocaleString()} vendors removed.`;
                    } else {
                        notificationMessage = 'OUI file is already up to date.';
                    }
                }
                
                window['showNotification'](notificationMessage, 'success');

                // Refresh the OUI info tooltip
                if (window.loadOuiFileInfo) {
                    window.loadOuiFileInfo();
                }

            } catch (error) {
                console.error('Error during OUI file update:', error);
                window['showNotification'](error.message, 'error');
            }
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async () => {
            const option = clearHistoryDropdown.value;
            const confirmed = await window['showConfirmation'](
                'Confirm History Deletion',
                `Are you sure you want to delete the ${option} history? This action cannot be undone.`,
                'Delete'
            );

            if (!confirmed) return;

            try {
                const response = await fetch('/misc/clear-history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ option }),
                });
                const data = await response.json();
                if (response.ok) {
                    window['showNotification'](data.message, 'success');
                    updateHistoryFileSizes(); // Refresh file sizes
                    // Dispatch event to update history views
                    document.dispatchEvent(new CustomEvent('historyUpdated'));
                } else {
                    window['showNotification'](data.error || 'Failed to clear history.', 'error');  
                }
            } catch (error) {
                console.error('Error clearing history:', error);
                window['showNotification']('An error occurred while clearing history.', 'error');  
            }
        });
    }

    if (openHistoryFolderBtn) {
        openHistoryFolderBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/misc/open-history-folder', { method: 'POST' });
                if (response.ok) {
                    window['showNotification']('Storage Folder opened in Finder.', 'success');
                } else {
                    window['showNotification']('Failed to open Storage Folder.', 'error');
                }
            } catch (error) {
                console.error('Error opening Storage Folder:', error);
                window['showNotification']('An error occurred while opening the Storage Folder.', 'error');
            }
        });
    }

    if (restartAdaptersBtn) {
        restartAdaptersBtn.addEventListener('click', async () => {
            const confirmed = await window['showConfirmation'](
                'Confirm Adapter Restart',
                'Are you sure you want to restart all network adapters? This will temporarily disconnect you from the network.',
                'Restart'
            );

            if (!confirmed) return;

            try {
                const response = await fetch('/network/restart-adapters', { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                });
                const data = await response.json();
                if (response.ok) {
                    window['showNotification'](data.message, 'success');
                } else {
                    window['showNotification'](data.error || 'Failed to restart adapters.', 'error');
                }
            } catch (error) {
                console.error('Error restarting network adapters:', error);
                window['showNotification']('An error occurred while restarting network adapters.', 'error');
            }
        });
    }

    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', async () => {
            const confirmed = await window['showConfirmation'](
                'Reset All Settings?',
                'Are you sure you want to reset all settings to their default values? This action cannot be undone and the application will reload.',
                'Reset and Reload',
                'Cancel'
            );

            if (!confirmed) return;

            try {
                const response = await fetch('/settings/reset', { method: 'POST' });
                const data = await response.json();

                if (response.ok) {
                    window['showNotification'](data.message, 'success');
                    // Reload the page to apply default settings everywhere
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    throw new Error(data.error || 'Failed to reset settings.');
                }
            } catch (error) {
                window['showNotification'](error.message, 'error');
            }
        });
    }
});