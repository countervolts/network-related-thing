document.addEventListener('DOMContentLoaded', () => {
    const currentVersionElement = document.getElementById('currentVersion');
    const latestVersionElement = document.getElementById('latestVersion');
    const updateStatusElement = document.getElementById('updateStatus');
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
    const updateProgressContainer = document.getElementById('updateProgressContainer');
    const updateProgressBar = document.getElementById('updateProgressBar');
    const updateProgressText = document.getElementById('updateProgressText');
    
    const versionSelect = document.getElementById('versionSelect');
    const downgradeBtn = document.getElementById('downgradeBtn');

    const versionDisplayElement = document.getElementById('version-display');
    let currentVersion = 'v1.0'; // fallback until loaded from server
    
    let latestVersion = '';
    let latestReleaseUrl = '';
    let downloadUrl = '';
    let allReleases = [];

    async function loadCurrentVersion() {
        try {
            // Fetch version from the dedicated plain text endpoint
            const resp = await fetch('/version.txt');
            if (!resp.ok) throw new Error('Failed to fetch version');
            const text = await resp.text();
            const val = text ? text.replace(/^v/, '') : null;
            if (val !== null) {
                currentVersion = `v${val}`;
                if (versionDisplayElement) versionDisplayElement.textContent = currentVersion;
                if (currentVersionElement) currentVersionElement.textContent = currentVersion.replace(/^v/, '');
            }
        } catch (err) {
            console.error('Failed to load current version from version.txt:', err);
            if (versionDisplayElement && !versionDisplayElement.textContent) {
                versionDisplayElement.textContent = 'v?.?';
            }
        }
    }

    // call early
    loadCurrentVersion();

    async function checkForUpdates() {
        updateStatusElement.textContent = 'Checking for updates...';
        updateStatusElement.className = 'update-status-box checking';
        // ensure currentVersionElement shows the settings version
        currentVersionElement.textContent = currentVersion.replace(/^v/, '');
        downloadUpdateBtn.disabled = true;
        
        try {
            // Add a timestamp to prevent caching
            const timestamp = new Date().getTime();
            const response = await fetch(`https://api.github.com/repos/countervolts/network-related-thing/releases/latest?t=${timestamp}`);
            const releaseData = await response.json();
            
            if (response.ok) {
                latestVersion = releaseData.tag_name;
                latestVersionElement.textContent = latestVersion.replace(/^v/, '');
                
                // Check if there's a new version available
                const isNewer = compareVersions(latestVersion, currentVersion);
                latestReleaseUrl = releaseData.html_url;
                
                // Find the server.exe download URL
                const serverExeAsset = releaseData.assets.find(asset => asset.name === 'server.exe');
                downloadUrl = serverExeAsset ? serverExeAsset.browser_download_url : '';
                
                if (isNewer) {
                    updateStatusElement.textContent = 'Update Available';
                    updateStatusElement.className = 'update-status-box update-available';
                    downloadUpdateBtn.disabled = false;
                } else {
                    const isDevBuild = compareVersions(currentVersion, latestVersion);
                    if (isDevBuild) {
                        updateStatusElement.textContent = 'Dev Build';
                        updateStatusElement.className = 'update-status-box dev-build';
                    } else {
                        updateStatusElement.textContent = 'Up to Date';
                        updateStatusElement.className = 'update-status-box up-to-date';
                    }
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
            updateStatusElement.className = 'update-status-box error';
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

    async function loadAllReleases() {
        try {
            const response = await fetch('/updater/releases');
            if (!response.ok) {
                throw new Error('Failed to fetch releases');
            }
            allReleases = await response.json();
            
            versionSelect.innerHTML = '';
            if (allReleases.length > 0) {
                allReleases.forEach(release => {
                    const option = document.createElement('option');
                    option.value = release.download_url;
                    
                    let releaseDate = '';
                    if (release.published_at) {
                        releaseDate = ` - ${new Date(release.published_at).toLocaleDateString()}`;
                    }

                    let label = release.version;
                    if (release.version === latestVersion) {
                        label += ' (Latest)';
                    }
                    if (release.version === currentVersion) {
                        // Avoid duplicating the label if current is also latest
                        if (currentVersion !== latestVersion) {
                            label += ' (Current)';
                        }
                    }
                    
                    // Disable both current and latest versions in the dropdown
                    if (release.version === currentVersion || release.version === latestVersion) {
                        option.disabled = true;
                    }

                    option.textContent = label + releaseDate;
                    versionSelect.appendChild(option);
                });
                versionSelect.disabled = false;
                downgradeBtn.disabled = false;
            } else {
                versionSelect.innerHTML = '<option>No versions found</option>';
            }
        } catch (error) {
            console.error('Error loading releases:', error);
            versionSelect.innerHTML = '<option>Error loading versions</option>';
            versionSelect.disabled = true;
            downgradeBtn.disabled = true;
        }
    }
    
    // Compare version strings (returns true if latest is newer than current)
    function compareVersions(latest, current) {
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
    
    async function downloadVersion(url, version) {
        if (!url) {
            showNotification('Download URL not available.', 'error');
            return;
        }
        
        updateProgressContainer.style.display = 'block';
        updateProgressBar.style.width = '0%';
        updateProgressText.textContent = `Starting download for ${version}...`;
        downloadUpdateBtn.disabled = true;
        downgradeBtn.disabled = true;
        
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
                    url: url,
                    version: version
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
            downgradeBtn.disabled = false;
        }
    }
    
    function showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        if (!container) {
            console.error('Notification container not found!');
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                if (container.contains(notification)) {
                    container.removeChild(notification);
                }
            }, 500);
        }, 5000);
    }
    
    // Event listeners
    checkUpdateBtn.addEventListener('click', () => {
        checkForUpdates();
        loadChangelog(); // Load changelog when checking for updates
    });
    downloadUpdateBtn.addEventListener('click', () => downloadVersion(downloadUrl, latestVersion));
    downgradeBtn.addEventListener('click', () => {
        const selectedUrl = versionSelect.value;
        const selectedVersion = versionSelect.options[versionSelect.selectedIndex].text.split(' ')[0];
        downloadVersion(selectedUrl, selectedVersion);
    });
    
    // Check for updates when the page loads
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.hash === '#updater') {
            setTimeout(checkForUpdates, 500);
            loadAllReleases();
        }
    });
    
    // Check when switching to the updater tab
    document.getElementById('updaterTab').addEventListener('click', () => {
        loadCurrentVersion();
        setTimeout(checkForUpdates, 500);
        loadAllReleases();
    });
});