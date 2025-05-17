document.addEventListener('DOMContentLoaded', () => {
    const currentVersionElement = document.getElementById('currentVersion');
    const latestVersionElement = document.getElementById('latestVersion');
    const updateStatusElement = document.getElementById('updateStatus');
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
    const updateProgressContainer = document.getElementById('updateProgressContainer');
    const updateProgressBar = document.getElementById('updateProgressBar');
    const updateProgressText = document.getElementById('updateProgressText');
    
    // Get the current version from the UI
    const versionElement = document.querySelector('.version');
    const currentVersion = versionElement ? versionElement.textContent.trim() : 'v1.0';
    
    let latestVersion = '';
    let latestReleaseUrl = '';
    let downloadUrl = '';
    
    async function checkForUpdates() {
        updateStatusElement.textContent = 'Checking for updates...';
        updateStatusElement.className = 'status checking';
        currentVersionElement.textContent = currentVersion;
        downloadUpdateBtn.disabled = true;
        
        try {
            // Add a timestamp to prevent caching
            const timestamp = new Date().getTime();
            const response = await fetch(`https://api.github.com/repos/countervolts/network-related-thing/releases/latest?t=${timestamp}`);
            const releaseData = await response.json();
            
            if (response.ok) {
                latestVersion = releaseData.tag_name;
                latestVersionElement.textContent = latestVersion;
                
                // Check if there's a new version available
                const isNewer = compareVersions(latestVersion, currentVersion);
                latestReleaseUrl = releaseData.html_url;
                
                // Find the server.exe download URL
                const serverExeAsset = releaseData.assets.find(asset => asset.name === 'server.exe');
                downloadUrl = serverExeAsset ? serverExeAsset.browser_download_url : '';
                
                if (isNewer) {
                    updateStatusElement.textContent = 'Update Available';
                    updateStatusElement.className = 'status update-available';
                    downloadUpdateBtn.disabled = false;
                } else {
                    updateStatusElement.textContent = 'Up to Date';
                    updateStatusElement.className = 'status up-to-date';
                    downloadUpdateBtn.disabled = true;
                }
                
                // Load and parse the changelog
                loadChangelog();
                
                return true;
            } else {
                throw new Error(`GitHub API Error: ${releaseData.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
            updateStatusElement.textContent = 'Update Check Failed';
            updateStatusElement.className = 'status error';
            return false;
        }
    }
    
    function loadChangelog(showLatestOnly = true) {
        const changelogContainer = document.getElementById('changelogContainer');
        changelogContainer.innerHTML = '<div class="loading">Loading changelog...</div>';
        
        fetch(`/updater/changelog?latest=${showLatestOnly}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load changelog');
                }
                return response.json();
            })
            .then(data => {
                if (!data || data.length === 0) {
                    changelogContainer.innerHTML = '<p>No changelog information available.</p>';
                    return;
                }
                
                let html = '';
                
                // Process each version
                data.forEach(version => {
                    let versionClass = version.isLatest ? 'changelog-version latest' : 'changelog-version';
                    html += `<div class="${versionClass}">
                                <h3>${version.version} <span class="changelog-date">${version.date}</span></h3>`;
                    
                    if (version.isLatest) {
                        html += `<div class="latest-badge">LATEST</div>`;
                    }
                    
                    // Process each section
                    version.sections.forEach(section => {
                        html += `<h4>${section.title}</h4>
                                 <ul>`;
                        
                        // Process each item, handling bold formatting
                        section.items.forEach(item => {
                            // Handle markdown bold format (**text**)
                            const formattedItem = item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                            html += `<li>${formattedItem}</li>`;
                        });
                        
                        html += `</ul>`;
                    });
                    
                    html += `</div>`;
                });
                
                changelogContainer.innerHTML = html;
                
            })
            .catch(error => {
                console.error('Error loading changelog:', error);
                changelogContainer.innerHTML = '<p class="error">Error loading changelog information.</p>';
            });
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        // Call this when the updater tab is shown or when checking for updates
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => {
                // Your existing update check code
                loadChangelog(true); // Load latest changelog when checking for updates
            });
        }
    });
    
    // Compare version strings (returns true if latest is newer than current)
    function compareVersions(latest, current) {
        // Remove the 'v' prefix if present
        const latestVer = latest.replace(/^v/, '');
        const currentVer = current.replace(/^v/, '');
        
        const latestParts = latestVer.split('.').map(Number);
        const currentParts = currentVer.split('.').map(Number);
        
        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
            const latestPart = i < latestParts.length ? latestParts[i] : 0;
            const currentPart = i < currentParts.length ? currentParts[i] : 0;
            
            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }
        
        return false; // Versions are equal
    }
    
    async function downloadUpdate() {
        if (!downloadUrl) {
            showNotification('Download URL not available.', 'error');
            return;
        }
        
        updateProgressContainer.style.display = 'block';
        updateProgressBar.style.width = '0%';
        updateProgressText.textContent = 'Starting download...';
        downloadUpdateBtn.disabled = true;
        
        try {
            // Simulate progress updates while downloading
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += 5;
                if (progress <= 90) {
                    updateProgressBar.style.width = `${progress}%`;
                    updateProgressText.textContent = `Downloading... ${progress}%`;
                }
            }, 200);
            
            // Send request to the server to handle the download
            const response = await fetch('/updater/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: downloadUrl,
                    version: latestVersion
                })
            });
            
            clearInterval(progressInterval);
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                updateProgressBar.style.width = '100%';
                updateProgressText.textContent = 'Download complete!';
                showNotification(`Update downloaded. Restart the application to apply the update.`, 'success');
                
                // Add restart button
                const restartBtn = document.createElement('button');
                restartBtn.className = 'update-btn check-btn';
                restartBtn.style.marginTop = '10px';
                restartBtn.textContent = 'Restart Now';
                restartBtn.addEventListener('click', async () => {
                    try {
                        updateProgressText.textContent = 'Restarting application...';
                        await fetch('/updater/restart', { method: 'POST' });
                        showNotification('Restarting application...', 'info');
                    } catch (error) {
                        console.error('Failed to restart application:', error);
                        showNotification('Failed to restart application', 'error');
                    }
                });
                
                updateProgressContainer.appendChild(restartBtn);
            } else {
                throw new Error(result.error || 'Download failed');
            }
        } catch (error) {
            console.error('Download error:', error);
            updateProgressText.textContent = 'Download failed. ' + error.message;
            updateProgressBar.style.width = '0%';
            updateProgressBar.className = 'progress-bar error';
            showNotification('Failed to download update. See console for details.', 'error');
            downloadUpdateBtn.disabled = false;
        }
    }
    
    function showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                container.removeChild(notification);
            }, 500);
        }, 5000);
    }
    
    // Event listeners
    checkUpdateBtn.addEventListener('click', () => {
        checkForUpdates();
        loadChangelog(); // Load changelog when checking for updates
    });
    downloadUpdateBtn.addEventListener('click', downloadUpdate);
    
    // Check for updates when the page loads
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.hash === '#updater') {
            setTimeout(checkForUpdates, 500);
        }
    });
    
    // Check when switching to the updater tab
    document.getElementById('updaterTab').addEventListener('click', () => {
        setTimeout(checkForUpdates, 500);
    });
});