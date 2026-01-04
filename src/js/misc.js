document.addEventListener('DOMContentLoaded', () => {
    const toggleConsoleBtn = document.getElementById('toggleConsoleBtn');
    const clearConsoleBtn = document.getElementById('clearConsoleBtn');
    const clearLocalStorageBtn = document.getElementById('clearLocalStorageBtn');
    const downloadOuiBtn = document.getElementById('downloadOuiBtn');
    const clearHistoryDropdown = document.getElementById('clearHistoryDropdown');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const openHistoryFolderBtn = document.getElementById('openHistoryFolderBtn');
    const notificationContainer = document.getElementById('notificationContainer');
    const restartAdaptersBtn = document.getElementById('restartAdaptersBtn');
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');
    const closeFab = document.getElementById('close-fab');

    async function updateConsoleButton() {
        if (!toggleConsoleBtn) return;
        try {
            const response = await fetch('/misc/console-status');
            const data = await response.json();
            if (response.ok) {
                toggleConsoleBtn.textContent = data.status === 'visible' ? 'Hide Console' : 'Show Console';
            }
        } catch (error) {
            console.error('Failed to get console status:', error);
        }
    }

    if (toggleConsoleBtn) {
        toggleConsoleBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/misc/toggle-console-visibility', { method: 'POST' });
                const data = await response.json();
                if (response.ok) {
                    window['showNotification'](data.message, 'success');
                    updateConsoleButton();
                } else {
                    window['showNotification'](data.error || 'Failed to toggle console.', 'error');
                }
            } catch (error) {
                console.error('Error toggling console visibility:', error);
                window['showNotification']('An error occurred while toggling console visibility.', 'error');
            }
        });
    }

    // Make showNotification available globally
    window['showNotification'] = function(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationContainer.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    };

    // Make a global confirmation modal available
    window['showConfirmation'] = function(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
        return new Promise((resolve) => {
            const modal = document.getElementById('genericConfirmModal');
            const titleEl = document.getElementById('genericConfirmTitle');
            const messageEl = document.getElementById('genericConfirmMessage');
            const confirmBtn = document.getElementById('genericConfirmBtn');
            const cancelBtn = document.getElementById('genericCancelBtn');

            if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
                console.error('Generic confirmation modal elements not found!');
                resolve(false); // Fallback to prevent blocking
                return;
            }

            titleEl.textContent = title;
            messageEl.textContent = message;
            confirmBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            modal.style.display = 'flex';

            const cleanup = () => {
                modal.style.display = 'none';
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
            };

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
        });
    };

    window['updateHistoryFileSizes'] = async function() {
        const clearHistoryDropdown = document.getElementById('clearHistoryDropdown');
        if (!clearHistoryDropdown) return; // Guard clause

        try {
            const response = await fetch('/misc/history-sizes');
            if (!response.ok) return;
            const sizes = await response.json();
            
            const formatBytes = (bytes) => {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
            };

            const scanOption = clearHistoryDropdown.querySelector('option[value="scan"]');
            const bypassOption = clearHistoryDropdown.querySelector('option[value="bypass"]');
            const allOption = clearHistoryDropdown.querySelector('option[value="all"]');

            if (scanOption && sizes.scan_size) {
                scanOption.textContent = `Scan History (${formatBytes(sizes.scan_size)})`;
            }
            if (bypassOption && sizes.bypass_size) {
                bypassOption.textContent = `Bypass History (${formatBytes(sizes.bypass_size)})`;
            }
            if (allOption && sizes.total_size) {
                allOption.textContent = `All History (${formatBytes(sizes.total_size)})`;
            }
        } catch (error) {
            console.error('Failed to fetch history file sizes:', error);
        }
    }

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
                    window['showNotification']('Storage Folder opened in Explorer.', 'success');
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

    // Close Application Button
    if (closeFab) {
        closeFab.addEventListener('click', async () => {
            const confirmed = await window['showConfirmation'](
                'Close Application',
                'Are you sure you want to close the application? All network devices will be restored to their original state.',
                'Close',
                'Cancel'
            );

            if (!confirmed) return;

            try {
                // Show a notification that the app is closing
                window['showNotification']('Closing application...', 'info');

                // Call the exit endpoint (don't wait for response as server will shut down)
                fetch('/exit', { 
                    method: 'POST',
                    keepalive: true // Ensure request completes even if page closes
                }).catch(() => {
                    // Ignore errors as server is shutting down
                });

                // Wait a brief moment for the server to process the request
                await new Promise(resolve => setTimeout(resolve, 800));

                // Show success message
                window['showNotification']('Application closed successfully.', 'success');

                // Wait a bit more, then attempt to close the window
                await new Promise(resolve => setTimeout(resolve, 500));

                if (window.close) {
                    window.close(); 
                }
                
                // If window.close() doesn't work (e.g., not in Electron), try these:
                if (typeof window.electronAPI !== 'undefined') {
                    // Electron-specific close
                    window.electronAPI.closeWindow();
                } else {
                    // Browser fallback - close tab if possible, otherwise redirect
                    try {
                        window.open('', '_self').close();
                    } catch (e) {
                        // If we can't close the tab, show a message
                        window['showNotification'](
                            'Server closed. You can now close this tab manually.', 
                            'success'
                        );
                        // Optionally redirect to a blank page
                        setTimeout(() => {
                            window.location.href = 'about:blank';
                        }, 2000);
                    }
                }

            } catch (error) {
                console.error('Error closing application:', error);
                window['showNotification']('An error occurred while closing the application.', 'error');
            }
        });
    }

    // This will be moved to ui.js
    // initCustomization();
    updateHistoryFileSizes();
    updateConsoleButton();

    const restartTutorialBtn = document.getElementById('restartTutorialBtn');
    if (restartTutorialBtn) {
        restartTutorialBtn.addEventListener('click', () => {
            if (window.restartTutorial) {
                window.restartTutorial();
                window['showNotification']('Tutorial restarted!', 'info');
            }
        });
    }
});