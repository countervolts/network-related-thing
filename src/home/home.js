let statisticsTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    const homeTab = document.getElementById('homeTab');
    const homeView = document.getElementById('homeView');
    
    const bypassCounter = document.getElementById('bypassCount');
    const basicScanCounter = document.getElementById('basicScanCount');
    const fullScanCounter = document.getElementById('fullScanCount');
    
    initFAQ();
    
    homeTab.addEventListener('click', () => {
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });
        homeView.style.display = 'block';
        
        loadStatistics();
    });
    
    // Load statistics when the home tab is clicked
    document.getElementById('homeTab').addEventListener('click', () => {
        loadSystemInfo();
        if (window.loadStatistics) {
            window.loadStatistics();
        }
    });

    // Load system info when the page loads if we're on the home view
    if (document.getElementById('homeView').style.display === 'block') {
        loadSystemInfo();
    }

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
    
    async function loadStatistics() {
        try {
            const response = await fetch('/statistics');
            const data = await response.json();
            
            if (response.ok) {
                bypassCounter.textContent = data.bypass_count || 0;
                basicScanCounter.textContent = data.basic_scan_count || 0;
                fullScanCounter.textContent = data.full_scan_count || 0;
                
                animateCounters();
            } else {
                console.error('Failed to load statistics');
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }
    
    function animateCounters() {
        const counters = document.querySelectorAll('.stat-count');
        counters.forEach(counter => {
            const target = parseInt(counter.textContent);
            let count = 0;
            const increment = Math.max(1, Math.floor(target / 25));
            
            const animate = setInterval(() => {
                count += increment;
                if (count >= target) {
                    counter.textContent = target;
                    clearInterval(animate);
                } else {
                    counter.textContent = count;
                }
            }, 20);
        });
    }

    async function loadSystemInfo() {
        try {
            // Get system info from server with timeout for faster response
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
            
            const response = await fetch('/system/info', { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error('Failed to fetch system info');
            }
            
            const data = await response.json();
            
            // Update network info
            document.getElementById('internalIp').textContent = data.internal_ip || 'Unknown';
            
            // External IP is blurred by default
            const externalIpElement = document.getElementById('externalIp');
            externalIpElement.textContent = data.external_ip || 'Offline';
            externalIpElement.className = 'blurred-text';
            
            document.getElementById('macAddress').textContent = data.mac_address || 'Unknown';
            document.getElementById('ispName').textContent = data.isp || 'Offline';
            
            // Update hardware info
            document.getElementById('cpuInfo').textContent = data.cpu || 'Unknown';
            document.getElementById('gpuInfo').textContent = data.gpu || 'Unknown';
            document.getElementById('memoryInfo').textContent = data.memory || 'Unknown';
            document.getElementById('storageInfo').textContent = data.storage || 'Unknown';
        } catch (error) {
            console.error('Error loading system info:', error);
            // Update status in case of error
            document.getElementById('externalIp').textContent = 'Offline';
            document.getElementById('ispName').textContent = 'Offline';
        }
    }
});

// Register for history updates to refresh stats
document.addEventListener('historyUpdated', () => {
    if (document.getElementById('homeView').style.display === 'block') {
        loadStatistics();
    }
});

// Make this function available globally
window.loadStatistics = function() {
    // Clear any pending requests
    if (statisticsTimeout) {
        clearTimeout(statisticsTimeout);
    }
    
    // Set a new timeout to delay and coalesce multiple calls
    statisticsTimeout = setTimeout(() => {
        fetch('/statistics')
            .then(response => response.json())
            .then(data => {
                document.getElementById('bypassCount').textContent = data.bypass_count;
                document.getElementById('basicScanCount').textContent = data.basic_scan_count;
                document.getElementById('fullScanCount').textContent = data.full_scan_count;
            })
            .catch(error => console.error('Failed to load statistics:', error));
        
        statisticsTimeout = null;
    }, 100);
};

// Make loadSystemInfo available globally like loadStatistics
window.loadSystemInfo = async function() {
    try {
        // Get system info from server with timeout for faster response
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch('/system/info', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error('Failed to fetch system info');
        }
        
        const data = await response.json();
        
        // Update network info
        document.getElementById('internalIp').textContent = data.internal_ip || 'Unknown';
        
        // External IP is blurred by default
        const externalIpElement = document.getElementById('externalIp');
        externalIpElement.textContent = data.external_ip || 'Offline';
        externalIpElement.className = 'blurred-text';
        
        document.getElementById('macAddress').textContent = data.mac_address || 'Unknown';
        document.getElementById('ispName').textContent = data.isp || 'Offline';
        
        // Update hardware info
        document.getElementById('cpuInfo').textContent = data.cpu || 'Unknown';
        document.getElementById('gpuInfo').textContent = data.gpu || 'Unknown';
        document.getElementById('memoryInfo').textContent = data.memory || 'Unknown';
        document.getElementById('storageInfo').textContent = data.storage || 'Unknown';
    } catch (error) {
        console.error('Error loading system info:', error);
        // Update status in case of error
        document.getElementById('externalIp').textContent = 'Offline';
        document.getElementById('ispName').textContent = 'Offline';
    }
};