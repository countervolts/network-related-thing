let statisticsTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    const bypassCounter = document.getElementById('bypassCount');
    const basicScanCounter = document.getElementById('basicScanCount');
    const fullScanCounter = document.getElementById('fullScanCount');
    
    initFAQ();

    // Modified click handler for blurred text - toggle instead of just adding class
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('blurred-text')) {
            e.target.classList.toggle('revealed');
        }
    });

    function initFAQ() {
        const faqItems = document.querySelectorAll('.faq-question');
        faqItems.forEach(item => {
            item.addEventListener('click', () => {
                const parent = item.parentElement;
                parent.classList.toggle('active');
                
                const allFaqs = document.querySelectorAll('.faq-item');
                allFaqs.forEach(faq => {
                    if (faq !== parent && faq.classList.contains('active')) {
                        faq.classList.remove('active');
                    }
                });
            });
        });
    }
    
    function animateCounters() {
        const counters = [bypassCounter, basicScanCounter, fullScanCounter];
        counters.forEach(counter => {
            if (!counter) return;
            const target = +counter.textContent;
            counter.textContent = '0';
            const speed = 200; 
            const increment = target / speed;

            const updateCount = () => {
                const current = +counter.textContent;
                if (current < target) {
                    counter.textContent = Math.ceil(current + increment);
                    setTimeout(updateCount, 1);
                } else {
                    counter.textContent = target;
                }
            };
            updateCount();
        });
    }

    // Make this function available globally
    window.loadStatistics = function() {
        // Clear any pending requests
        if (statisticsTimeout) {
            clearTimeout(statisticsTimeout);
        }
        
        // Set a new timeout to delay and coalesce multiple calls
        statisticsTimeout = setTimeout(async () => {
            try {
                // Fetch all data sources in parallel
                const [statsRes, bypassHistoryRes, scanHistoryRes] = await Promise.all([
                    fetch('/statistics'),
                    fetch('/history/bypasses'),
                    fetch('/history/scans')
                ]);

                const statsData = statsRes.ok ? await statsRes.json() : { bypass_count: 0, basic_scan_count: 0, full_scan_count: 0 };
                const bypassHistory = bypassHistoryRes.ok ? await bypassHistoryRes.json() : [];
                const scanHistory = scanHistoryRes.ok ? await scanHistoryRes.json() : [];

                // Update counters from the main statistics endpoint
                if (bypassCounter) bypassCounter.textContent = statsData.bypass_count || 0;
                if (basicScanCounter) basicScanCounter.textContent = statsData.basic_scan_count || 0;
                if (fullScanCounter) fullScanCounter.textContent = statsData.full_scan_count || 0;
                
                animateCounters();

                // Combine all activities from history
                let allActivities = [];

                bypassHistory.forEach(item => {
                    allActivities.push({
                        type: 'bypass',
                        timestamp: item.time,
                        details: {
                            adapter: item.transport || 'an adapter'
                        }
                    });
                });

                scanHistory.forEach(item => {
                    allActivities.push({
                        type: 'scan',
                        timestamp: item.time,
                        details: {
                            scan_type: item.type,
                            device_count: item.deviceCount
                        }
                    });
                });

                // Deduplicate and sort activities by date, newest first
                const uniqueActivities = Array.from(new Map(allActivities.map(item => [item.timestamp + item.type, item])).values());
                uniqueActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                updateActivityFeed(uniqueActivities);

            } catch (error) {
                console.error('Error loading statistics and history:', error);
            }
            statisticsTimeout = null;
        }, 100);
    };

    function updateActivityFeed(activities) {
        const feedContainer = document.getElementById('activityFeed');
        if (!feedContainer) return;

        if (activities.length === 0) {
            feedContainer.innerHTML = '<div class="activity-item empty">No recent activity to show.</div>';
            return;
        }

        feedContainer.innerHTML = activities.map(activity => {
            const time = new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            let icon = '🔔';
            let message = '';

            switch (activity.type) {
                case 'bypass':
                    icon = '⚡️';
                    message = `Bypass successful for <strong>${activity.details.adapter}</strong>.`;
                    break;
                case 'scan':
                    icon = '🔍';
                    message = `${activity.details.scan_type} scan completed, found <strong>${activity.details.device_count}</strong> devices.`;
                    break;
                default:
                    message = `Unknown event: ${activity.type}`;
            }

            return `
                <div class="activity-item">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-message">${message}</div>
                    <div class="activity-time">${time}</div>
                </div>
            `;
        }).join('');
    }

    // Make loadSystemInfo available globally
    window.loadSystemInfo = async function() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch('/system/info', { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error('Failed to fetch system info');
            }
            
            const data = await response.json();
            
            document.getElementById('internalIp').textContent = data.internal_ip || 'Unknown';
            
            const externalIpElement = document.getElementById('externalIp');
            externalIpElement.textContent = data.external_ip || 'Offline';
            externalIpElement.className = 'blurred-text';
            
            document.getElementById('macAddress').textContent = data.mac_address || 'Unknown';
            document.getElementById('ispName').textContent = data.isp || 'Offline';
            
            document.getElementById('cpuInfo').textContent = data.cpu || 'Unknown';
            document.getElementById('gpuInfo').textContent = data.gpu || 'Unknown';
            document.getElementById('memoryInfo').textContent = data.memory || 'Unknown';
            document.getElementById('storageInfo').textContent = data.storage || 'Unknown';
        } catch (error) {
            console.error('Error loading system info:', error);
            // Update status in case of error
            document.getElementById('externalIp').textContent = 'Offline';
            document.getElementById('ispName').textContent = 'Offline';
        } finally {
        // Signal to the server that the client is loaded
        fetch('/api/client-loaded', { method: 'POST' }).catch(err => console.error('Could not signal client load:', err));
    }
    };
});

// Register for history updates to refresh stats
document.addEventListener('historyUpdated', () => {
    if (document.getElementById('homeView').style.display === 'block') {
        if (window.loadStatistics) {
            window.loadStatistics();
        }
    }
});