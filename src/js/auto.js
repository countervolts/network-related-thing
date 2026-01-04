document.addEventListener('DOMContentLoaded', () => {
    const autoTab = document.getElementById('autoTab');
    const autoBypassToggle = document.getElementById('autoBypassToggle');
    const autoBypassAdapter = document.getElementById('autoBypassAdapter');
    const autoBypassInterval = document.getElementById('autoBypassInterval');
    const applyAutoBypassSettings = document.getElementById('applyAutoBypassSettings');
    
    // New elements for detailed status
    const autoBypassStatus = document.getElementById('autoBypassStatus');
    const autoBypassPid = document.getElementById('autoBypassPid');
    const autoBypassUptime = document.getElementById('autoBypassUptime');
    const autoBypassStartTime = document.getElementById('autoBypassStartTime');
    const toggleAutoBypassTaskBtn = document.getElementById('toggleAutoBypassTaskBtn');
    const killAutoBypassBtn = document.getElementById('killAutoBypassBtn');

    let uptimeInterval = null;

    const loadAdapters = async () => {
        try {
            const response = await fetch('/bypass/adapters?show_ignored=false');
            const adapters = await response.json();

            if (!response.ok) throw new Error(adapters.error || 'Failed to load adapters');

            autoBypassAdapter.innerHTML = '<option value="">-- Select an Adapter --</option>';
            adapters.forEach(adapter => {
                if (!adapter.ignored) {
                    const option = document.createElement('option');
                    option.value = adapter.transport;
                    option.textContent = adapter.description;
                    autoBypassAdapter.appendChild(option);
                }
            });
        } catch (error) {
            autoBypassAdapter.innerHTML = `<option value="">Error loading</option>`;
            showNotification(error.message, 'error');
        }
    };

    const loadAutoBypassStatus = async () => {
        try {
            const response = await fetch('/auto/status');
            const data = await response.json();

            if (response.ok) {
                autoBypassToggle.checked = data.config_enabled;
                autoBypassAdapter.value = data.transport_id || '';
                autoBypassInterval.value = data.interval || 60;
                
                // Update detailed status UI
                autoBypassStatus.textContent = data.task_status || 'Unknown';
                autoBypassPid.textContent = data.pid || 'N/A';

                if (data.pid) {
                    killAutoBypassBtn.disabled = false;
                } else {
                    killAutoBypassBtn.disabled = true;
                }

                if (data.task_status && data.task_status !== 'Not installed') {
                    toggleAutoBypassTaskBtn.disabled = false;
                    toggleAutoBypassTaskBtn.textContent = data.task_enabled ? 'Pause Task' : 'Resume Task';
                } else {
                    toggleAutoBypassTaskBtn.disabled = true;
                }

                // Handle uptime calculation
                if (uptimeInterval) clearInterval(uptimeInterval);
                if (data.start_time) {
                    autoBypassStartTime.textContent = new Date(data.start_time).toLocaleString();
                    const startTime = new Date(data.start_time);
                    uptimeInterval = setInterval(() => {
                        const now = new Date();
                        const diff = now - startTime;
                        const seconds = Math.floor((diff / 1000) % 60);
                        const minutes = Math.floor((diff / (1000 * 60)) % 60);
                        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                        
                        let uptimeString = '';
                        if (days > 0) uptimeString += `${days}d `;
                        if (hours > 0) uptimeString += `${hours}h `;
                        if (minutes > 0) uptimeString += `${minutes}m `;
                        uptimeString += `${seconds}s`;

                        autoBypassUptime.textContent = uptimeString;
                    }, 1000);
                } else {
                    autoBypassUptime.textContent = 'N/A';
                    autoBypassStartTime.textContent = 'N/A';
                }

            } else {
                showNotification(data.error || 'Failed to load auto bypass status.', 'error');
            }
        } catch (error) {
            console.error('Error loading auto bypass status:', error);
            showNotification('Could not connect to server to get auto bypass status.', 'error');
        }
    };

    const applySettings = async () => {
        const enabled = autoBypassToggle.checked;
        const interval = parseInt(autoBypassInterval.value, 10);
        const transportId = autoBypassAdapter.value;

        if (enabled && !transportId) {
            showNotification('Please select a target adapter before enabling.', 'error');
            return;
        }

        if (interval < 30) {
            showNotification('Interval must be at least 30 seconds.', 'error');
            return;
        }

        showNotification('Applying settings... This may require admin rights.', 'info');

        try {
            const response = await fetch('/auto/configure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled, interval, transport_id: transportId }),
            });

            const data = await response.json();

            if (response.ok) {
                showNotification(data.message, 'success');
            } else {
                throw new Error(data.error || 'Failed to apply settings');
            }
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            loadAutoBypassStatus(); 
        }
    };

    const killProcess = async () => {
        if (!confirm('Are you sure you want to terminate the auto-bypass service? It will be restarted by the Task Scheduler if it is enabled.')) return;
        try {
            const response = await fetch('/auto/kill', { method: 'POST' });
            const data = await response.json();
            showNotification(data.message || data.error, data.success ? 'success' : 'error');
            loadAutoBypassStatus();
        } catch (error) {
            showNotification('Failed to send kill command.', 'error');
        }
    };

    const toggleTask = async () => {
        try {
            const response = await fetch('/auto/toggle-task', { method: 'POST' });
            const data = await response.json();
            showNotification(data.message || data.error, data.success ? 'success' : 'error');
            loadAutoBypassStatus();
        } catch (error) {
            showNotification('Failed to toggle task status.', 'error');
        }
    };

    if (autoTab) {
        autoTab.addEventListener('click', () => {
            loadAdapters();
            loadAutoBypassStatus();
        });
    }

    if (applyAutoBypassSettings) {
        applyAutoBypassSettings.addEventListener('click', applySettings);
    }
    if (killAutoBypassBtn) {
        killAutoBypassBtn.addEventListener('click', killProcess);
    }
    if (toggleAutoBypassTaskBtn) {
        toggleAutoBypassTaskBtn.addEventListener('click', toggleTask);
    }
});