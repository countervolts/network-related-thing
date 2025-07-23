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
                const response = await fetch('/statistics');
                const data = await response.json();
                
                if (response.ok) {
                    if (bypassCounter) bypassCounter.textContent = data.bypass_count || 0;
                    if (basicScanCounter) basicScanCounter.textContent = data.basic_scan_count || 0;
                    if (fullScanCounter) fullScanCounter.textContent = data.full_scan_count || 0;
                    
                    animateCounters();
                } else {
                    console.error('Failed to load statistics');
                }
            } catch (error) {
                console.error('Error loading statistics:', error);
            }
            statisticsTimeout = null;
        }, 100);
    };

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