document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/tutorial/status');
        const data = await response.json();
        
        if (!data.completed) {
            // Wait for initial animations to complete before starting tutorial
            setTimeout(() => {
                showWelcomeScreen();
            }, 800);
        }
    } catch (error) {
        console.error('Failed to check tutorial status:', error);
    }
});

function showWelcomeScreen() {
    welcomeBox = document.createElement('div');
    welcomeBox.id = 'tutorial-welcome-box';
    welcomeBox.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    const welcomeContent = document.createElement('div');
    welcomeContent.style.cssText = `
        background: var(--bg-primary);
        border: 2px solid var(--accent);
        border-radius: 16px;
        padding: 40px;
        max-width: 500px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        transform: scale(0.9);
        transition: transform 0.3s ease;
    `;
    
    welcomeContent.innerHTML = `
        <h2 style="margin: 0 0 20px 0; color: var(--accent); font-size: 2rem;">Welcome! 👋</h2>
        <p style="margin: 0 0 30px 0; color: var(--text-primary); line-height: 1.6; font-size: 1.1rem;">
            Hey! Thanks for trying out Network Related Thing. We're glad you're here.
        </p>
        <p style="margin: 0 0 30px 0; color: var(--text-secondary); line-height: 1.5;">
            Want a quick tour? We'll show you around the app and how everything works. It'll only take a minute or two.
        </p>
        <div style="display: flex; gap: 15px; justify-content: center;">
            <button id="welcome-skip" class="btn btn-secondary" style="padding: 12px 24px; font-size: 1rem;">Skip Tour</button>
            <button id="welcome-continue" class="btn btn-primary" style="padding: 12px 24px; font-size: 1rem;">Let's Go</button>
        </div>
    `;
    
    welcomeBox.appendChild(welcomeContent);
    document.body.appendChild(welcomeBox);
    
    // Trigger animations
    setTimeout(() => {
        welcomeBox.style.opacity = '1';
        welcomeContent.style.transform = 'scale(1)';
    }, 50);
    
    // Event listeners
    document.getElementById('welcome-skip').addEventListener('click', () => {
        closeWelcomeScreen();
        completeTutorial();
    });
    
    document.getElementById('welcome-continue').addEventListener('click', () => {
        closeWelcomeScreen();
        setTimeout(() => startTutorial(), 300);
    });
}

function closeWelcomeScreen() {
    if (welcomeBox) {
        welcomeBox.style.opacity = '0';
        setTimeout(() => welcomeBox.remove(), 300);
    }
}

const tutorialSteps = [
    {
        target: '#bypassTab',
        title: 'MAC address bypass',
        description: 'Click here to get started with the bypass feature. This is where you can change your network adapter\'s MAC address to get around network restrictions.',
        position: 'bottom',
        nextAction: 'click',
        waitForElement: false,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.scan-controls .control-group',
        title: 'Showing ignored adapters',
        description: 'Toggle this switch to show or hide virtual adapters (like VPN connections and VM adapters). Most people only need to see their real network adapters, so we hide these by default.',
        position: 'bottom',
        nextAction: 'waitForToggle',
        highlightMultiple: true,
        waitForElement: true,
        waitForView: '#bypassView',
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.adapter-card:not(.ignored)',
        title: 'Your real adapter',
        description: 'This is your actual network adapter — like your ethernet port or wifi card. These are what you\'ll typically want to bypass with, unlike those virtual adapters we mentioned earlier.',
        position: 'right',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.bypass-mode-dropdown',
        title: 'How we generate MACs',
        description: 'Pick how you want your new MAC address generated:\n• Standard: safe default that works everywhere\n• Tmac: matches the popular tmac tool format\n• Randomized: completely random LAA MAC\n• Manual: enter your own if you know what you\'re doing',
        position: 'top',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.btn-bypass',
        title: 'Running the bypass',
        description: 'Hit this button when you\'re ready to change your MAC address. We\'ll need admin permissions to make it happen.\n\nNote: We\'ve disabled this during the tutorial so you don\'t accidentally change anything while learning.',
        position: 'top',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '#scannerTab',
        title: 'Network scanner',
        description: 'Click here to check out the scanner. We built this to help you find all the devices connected to your network.',
        position: 'bottom',
        nextAction: 'click',
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '#basicScanBtn',
        title: 'Running a basic scan',
        description: 'Go ahead and click this to scan your network. We\'ll find all the connected devices and show you their IP and MAC addresses.',
        position: 'bottom',
        nextAction: 'waitForScan',
        waitForElement: true,
        waitForView: '#scannerView',
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '#resultsContainer',
        title: 'What we found',
        description: 'These are all the devices we discovered on your network. Click on any device to see more detailed info about it.',
        position: 'right',
        nextAction: 'waitForDeviceClick',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
        // Removed preventScroll flag - we'll handle scrolling differently
    },
    {
        target: '#deviceDetailsPanel',
        title: 'Device details',
        description: 'Here\'s where we show you everything about the device you selected — hostname, manufacturer, MAC address, open ports, and more.',
        position: 'left',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '#fullScanBtn',
        title: 'Full scan vs basic scan',
        description: 'There\'s also a full scan option. Basic scans are faster and show IP/MAC addresses. Full scans take longer but give you hostnames, vendors, and more detailed info about each device.',
        position: 'bottom',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '#monitorTab',
        title: 'Connection monitor',
        description: 'Click here to see what\'s happening with your network right now. We\'ll show you all active connections and which programs are using them.',
        position: 'bottom',
        nextAction: 'click',
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.monitor-container',
        title: 'Live connections',
        description: 'This is your live connection feed. You can see which programs are talking to the internet, what IPs they\'re connecting to, and which ports they\'re using.',
        position: 'top',
        nextAction: 'manual',
        waitForElement: true,
        waitForView: '#monitorView',
        offsetX: 0,
        offsetY: 0,
        skipZIndex: true,
        dynamicResize: true
    },
    {
        target: '#historyTab',
        title: 'Your history',
        description: 'Click here to see a log of everything you\'ve done — past bypasses and scans are all saved here.',
        position: 'bottom',
        nextAction: 'click',
        offsetX: 0,
        offsetY: 0,
        createHistoryEntry: true
    },
    {
        target: '.history-card.tutorial-entry',
        title: 'History entries',
        description: 'Each card here shows something you did in the past. If you ever need to revert a MAC address change, just click the "Revert" button and we\'ll restore your original MAC.',
        position: 'right',
        nextAction: 'manual',
        waitForElement: true,
        waitForView: '#historyView',
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.history-card.tutorial-entry .btn-revert',
        title: 'Reverting changes',
        description: 'Go ahead and click this button to see how reverting works.',
        position: 'top',
        nextAction: 'waitForRevertClick',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0,
        disableRevertButton: false
    },
    {
        target: '.modal-content',
        title: 'Confirming the revert',
        description: 'This window shows you what MAC you have now and what we\'ll change it back to. The revert button is disabled during the tutorial to keep things safe. Click "Next" to keep going.',
        position: 'top',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0,
        highlightModal: true
    },
    {
        target: '#updaterTab',
        title: 'Managing updates',
        description: 'Click here to check for new versions and manage your installation.',
        position: 'bottom',
        nextAction: 'click',
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.settings-section',
        title: 'Version info',
        description: 'This shows what version you\'re running and if there\'s anything newer available. We automatically check when you open this tab.',
        position: 'bottom',
        nextAction: 'manual',
        waitForElement: true,
        waitForView: '#updaterView',
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '#checkUpdateBtn',
        title: 'Manual update check',
        description: 'Hit this if you want to check for updates right now. You can also enable automatic checking in the settings if you want.',
        position: 'bottom',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.settings-section:has(.downgrade-controls)',
        title: 'Rolling back versions',
        description: 'If something breaks after an update, you can use this to go back to an older version. Just pick one from the dropdown and hit "Downgrade".',
        position: 'top',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    },
    {
        target: '.settings-section:has(#changelogContainer)',
        title: 'What changed',
        description: 'Here\'s the changelog for the latest version we\'ve released. You can see what features we added, bugs we fixed, and improvements we made. Click "Check for Updates" to see the full changelog for all versions.',
        position: 'left',
        nextAction: 'manual',
        waitForElement: true,
        offsetX: 0,
        offsetY: 0
    }
];

let currentStep = 0;
let tutorialActive = false;
let overlay = null;
let tooltip = null;
let spotlight = null;
let welcomeBox = null;
let tutorialHistoryEntry = null;
let savedZIndexes = new Map();
let resizeObserver = null;

function createTutorialElements() {
    // Create overlay with pointer events disabled so clicks pass through
    overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 99998;
        pointer-events: none;
        transition: opacity 0.3s ease;
    `;
    document.body.appendChild(overlay);
    
    // Create spotlight (cutout effect) - this also blocks clicks except on the target
    spotlight = document.createElement('div');
    spotlight.id = 'tutorial-spotlight';
    spotlight.style.cssText = `
        position: fixed;
        border: 3px solid var(--accent);
        border-radius: 8px;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 20px var(--accent);
        z-index: 99999;
        pointer-events: none;
        transition: all 0.4s ease;
        background: rgba(255, 255, 255, 0.05);
    `;
    document.body.appendChild(spotlight);
    
    // Create tooltip
    tooltip = document.createElement('div');
    tooltip.id = 'tutorial-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        background: var(--bg-primary);
        border: 2px solid var(--accent);
        border-radius: 12px;
        padding: 20px;
        max-width: 350px;
        z-index: 100001;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        transition: all 0.3s ease;
        pointer-events: auto;
    `;
    
    tooltip.innerHTML = `
        <div class="tutorial-content">
            <h3 class="tutorial-title" style="margin: 0 0 10px 0; color: var(--accent); font-size: 1.2rem;"></h3>
            <p class="tutorial-description" style="margin: 0 0 20px 0; color: var(--text-primary); white-space: pre-line; line-height: 1.5;"></p>
            <div class="tutorial-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="tutorial-skip" class="btn btn-secondary" style="padding: 8px 16px;">Skip Tutorial</button>
                <button id="tutorial-next" class="btn btn-primary" style="padding: 8px 16px;">Next</button>
            </div>
            <div class="tutorial-progress" style="margin-top: 15px; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
                <span id="tutorial-step-count"></span>
            </div>
        </div>
    `;
    
    document.body.appendChild(tooltip);
    
    // Add click blocker to prevent clicks outside the highlighted area
    const clickBlocker = (e) => {
        const target = document.querySelector(tutorialSteps[currentStep]?.target);
        if (!target || !tutorialActive) return;
        
        const confirmModal = document.getElementById('genericConfirmModal');
        const revertModal = document.getElementById('revertMacModal');

        // Allow clicks on the target, tooltip, confirmation modal, revert modal, or their children
        if (target.contains(e.target) || 
            tooltip.contains(e.target) || 
            (confirmModal && confirmModal.contains(e.target)) ||
            (revertModal && revertModal.contains(e.target))) {
            return;
        }
        
        // Block all other clicks
        e.preventDefault();
        e.stopPropagation();
    };
    
    document.addEventListener('click', clickBlocker, true);
    document.addEventListener('mousedown', clickBlocker, true);
    
    // Store the blocker so we can remove it later
    overlay.clickBlocker = clickBlocker;
    
    // Event listeners
    document.getElementById('tutorial-skip').addEventListener('click', skipTutorial);
    document.getElementById('tutorial-next').addEventListener('click', () => nextStep());
}

function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkElement = () => {
            const element = document.querySelector(selector);
            if (element) {
                const rect = element.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 && 
                                 window.getComputedStyle(element).display !== 'none' &&
                                 window.getComputedStyle(element).visibility !== 'hidden';
                
                if (isVisible) {
                    resolve(element);
                    return;
                }
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error(`Element ${selector} not found or not visible within ${timeout}ms`));
            } else {
                requestAnimationFrame(checkElement);
            }
        };
        
        checkElement();
    });
}

function waitForViewVisible(viewSelector, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkView = () => {
            const view = document.querySelector(viewSelector);
            if (view) {
                const isVisible = view.classList.contains('visible') || 
                                 window.getComputedStyle(view).display !== 'none';
                if (isVisible) {
                    resolve(view);
                    return;
                }
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error(`View ${viewSelector} not visible within ${timeout}ms`));
            } else {
                requestAnimationFrame(checkView);
            }
        };
        
        checkView();
    });
}

async function createTutorialHistoryEntry() {
    const entry = {
        time: new Date().toISOString(),
        previousMac: 'AA:BB:CC:DD:EE:FF',
        newMac: '00:11:22:33:44:55',
        method: 'registry',
        transport: '{TUTORIAL-EXAMPLE}',
        mac_mode: 'standard',
        isTutorial: true
    };
    
    tutorialHistoryEntry = entry;
    
    // Add to UI directly
    const bypassList = document.getElementById('bypassHistoryList');
    if (bypassList) {
        const entryHtml = `
        <div class="history-card tutorial-entry" data-tutorial="true">
            <div class="history-card-header">
                <h4>Bypass Event (Tutorial Example)</h4>
                <span class="history-card-time">${new Date(entry.time).toLocaleString()}</span>
            </div>
            <div class="history-card-body">
                <div class="detail-row">
                    <span class="detail-label">Method:</span>
                    <span class="detail-value">Registry</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Mode:</span>
                    <span class="detail-value">Standard</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Old MAC:</span>
                    <span class="detail-value">AA:BB:CC:DD:EE:FF</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">New MAC:</span>
                    <span class="detail-value">00:11:22:33:44:55</span>
                </div>
            </div>
            <div class="history-card-footer">
                <button class="btn btn-revert" onclick="showTutorialRevertModal()">Revert</button>
            </div>
        </div>`;
        bypassList.insertAdjacentHTML('afterbegin', entryHtml);
    }
}

function removeTutorialHistoryEntry() {
    const tutorialEntries = document.querySelectorAll('.history-card.tutorial-entry');
    tutorialEntries.forEach(entry => entry.remove());
    tutorialHistoryEntry = null;
}

function disableBypassButtons() {
    // Disable all bypass buttons
    document.querySelectorAll('.btn-bypass').forEach(btn => {
        btn.disabled = true;
        btn.setAttribute('data-tutorial-disabled', 'true');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'none'; // Prevent any clicks
    });
}

function enableBypassButtons() {
    // Re-enable all bypass buttons
    document.querySelectorAll('.btn-bypass[data-tutorial-disabled]').forEach(btn => {
        btn.disabled = false;
        btn.removeAttribute('data-tutorial-disabled');
        btn.style.opacity = '';
        btn.style.cursor = '';
        btn.style.pointerEvents = ''; // Re-enable clicks
    });
}

window.showTutorialRevertModal = function() {
    const modal = document.getElementById('revertMacModal');
    if (modal) {
        const currentMacSpan = document.getElementById('revertCurrentMac');
        const revertToMacSpan = document.getElementById('revertToMac');
        const confirmBtn = document.getElementById('confirmRevertBtn');
        
        if (currentMacSpan) currentMacSpan.textContent = '00:11:22:33:44:55';
        if (revertToMacSpan) revertToMacSpan.textContent = 'AA:BB:CC:DD:EE:FF';
        
        // Disable the confirm button during tutorial
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
            confirmBtn.style.cursor = 'not-allowed';
            confirmBtn.setAttribute('data-tutorial-disabled', 'true');
        }
        
        modal.style.display = 'flex';
        modal.style.zIndex = '100000';
        
        // Wait a moment for the modal to render, then trigger step 15 (modal step)
        setTimeout(() => {
            if (tutorialActive && currentStep === 14) {
                nextStep();
            }
        }, 300);
    }
};

window.showTutorialRevertMessage = function() {
    if (window.showNotification) {
        window.showNotification('This is a tutorial example. The revert would happen here in a real scenario.', 'info');
    }
};

function pauseMonitorUpdates() {
    // Stop the monitor auto-refresh if it exists
    if (window.stopMonitorUpdates && typeof window.stopMonitorUpdates === 'function') {
        window.stopMonitorUpdates();
    }
    
    // Clear any intervals that might be running
    const highestId = window.setTimeout(() => {}, 0);
    for (let i = 0; i < highestId; i++) {
        const intervalElement = document.querySelector(`[data-interval-id="${i}"]`);
        if (intervalElement) {
            window.clearInterval(i);
        }
    }
}

function resumeMonitorUpdates() {
    // Resume the monitor auto-refresh if it exists
    if (window.startMonitorUpdates && typeof window.startMonitorUpdates === 'function') {
        window.startMonitorUpdates();
    }
}

function setupDynamicResize(target, step) {
    // Clean up existing observer
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    
    // Create new ResizeObserver for dynamic sizing
    resizeObserver = new ResizeObserver(() => {
        if (!tutorialActive || !target) return;
        
        const rect = target.getBoundingClientRect();
        const offsetX = step.offsetX || 0;
        const offsetY = step.offsetY || 0;
        
        spotlight.style.left = `${rect.left - 5 + offsetX}px`;
        spotlight.style.top = `${rect.top - 5 + offsetY}px`;
        spotlight.style.width = `${rect.width + 10}px`;
        spotlight.style.height = `${rect.height + 10}px`;
        
        // Also update tooltip position if needed
        positionTooltip(rect, step.position, offsetX, offsetY);
    });
    
    resizeObserver.observe(target);
}

function setupScrollListener(target, step) {
    // Clean up any existing scroll listeners first
    cleanupScrollListeners();

    const scrollContainers = new Set();

    // Find scrollable parents by traversing up from the target
    let parent = target.parentElement;
    while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            scrollContainers.add(parent);
        }
        parent = parent.parentElement;
    }

    // Add the window object as a fallback for top-level scrolling
    scrollContainers.add(window);

    if (scrollContainers.size === 0) {
        console.warn('Tutorial: No scrollable container found for', step.target);
        return;
    }

    const updatePosition = () => {
        if (!tutorialActive || !target) return;
        
        const rect = target.getBoundingClientRect();
        const offsetX = step.offsetX || 0;
        const offsetY = step.offsetY || 0;
        
        spotlight.style.left = `${rect.left - 5 + offsetX}px`;
        spotlight.style.top = `${rect.top - 5 + offsetY}px`;
        spotlight.style.width = `${rect.width + 10}px`;
        spotlight.style.height = `${rect.height + 10}px`;
        
        positionTooltip(rect, step.position, offsetX, offsetY);
    };

    // Initialize the scroll listeners array if it doesn't exist
    if (!window.tutorialScrollListeners) {
        window.tutorialScrollListeners = [];
    }

    // Add listeners to all found containers
    scrollContainers.forEach(container => {
        container.addEventListener('scroll', updatePosition, { passive: true });
        // Store reference to clean up later
        window.tutorialScrollListeners.push({ container, handler: updatePosition });
    });

    // Also add a resize listener to handle window resizing
    window.addEventListener('resize', updatePosition, { passive: true });
    window.tutorialScrollListeners.push({ container: window, handler: updatePosition, isResize: true });
}

function cleanupScrollListeners() {
    if (window.tutorialScrollListeners) {
        window.tutorialScrollListeners.forEach(({ container, handler, isResize }) => {
            if (isResize) {
                window.removeEventListener('resize', handler);
            } else {
                container.removeEventListener('scroll', handler);
            }
        });
        window.tutorialScrollListeners = [];
    }
}

function positionTooltip(rect, position, offsetX = 0, offsetY = 0) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 20;
    let left, top;
    
    switch (position) {
        case 'top':
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2) + offsetX;
            top = rect.top - tooltipRect.height - padding + offsetY;
            break;
        case 'bottom':
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2) + offsetX;
            top = rect.bottom + padding + offsetY;
            break;
        case 'left':
            left = rect.left - tooltipRect.width - padding + offsetX;
            top = rect.top + (rect.height / 2) - (tooltipRect.height / 2) + offsetY;
            break;
        case 'right':
            left = rect.right + padding + offsetX;
            top = rect.top + (rect.height / 2) - (tooltipRect.height / 2) + offsetY;
            break;
        default:
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2) + offsetX;
            top = rect.bottom + padding + offsetY;
    }
    
    // Keep tooltip within viewport bounds
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < 10) left = 10;
    if (left + tooltipRect.width > viewportWidth - 10) {
        left = viewportWidth - tooltipRect.width - 10;
    }
    if (top < 10) top = 10;
    if (top + tooltipRect.height > viewportHeight - 10) {
        top = viewportHeight - tooltipRect.height - 10;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function startTutorial() {
    if (tutorialActive) return;
    
    tutorialActive = true;
    createTutorialElements();
    disableBypassButtons(); // Disable bypass buttons at start
    showStep(0);
}

function showStep(stepIndex) {
    if (stepIndex >= tutorialSteps.length) {
        completeTutorial();
        return;
    }
    
    currentStep = stepIndex;
    const step = tutorialSteps[stepIndex];
    
    // Clean up resize observer from previous step
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    
    // Update overlay opacity based on step
    if (step.dimOverlay === false) {
        overlay.style.background = 'rgba(0, 0, 0, 0.3)';
    } else {
        overlay.style.background = 'rgba(0, 0, 0, 0.5)';
    }
    
    // Special handling for monitor tab - pause updates
    if (step.target === '#monitorTab' || step.target === '.monitor-container') {
        pauseMonitorUpdates();
    }
    
    // Special handling for history step - create tutorial entry AFTER clicking
    if (step.createHistoryEntry) {
        const clickHandler = () => {
            document.getElementById('historyTab').removeEventListener('click', clickHandler);
            setTimeout(async () => {
                await createTutorialHistoryEntry();
                // Wait for the history card to appear, then DON'T auto-advance
                // Let showStepContent handle showing step 13 (was 12)
            }, 600);
        };
        document.getElementById('historyTab').addEventListener('click', clickHandler);
        showStepContent(stepIndex);
        return;
    }
    
    // Handle navigation first
    if (step.target === '#bypassTab' && window.location.hash !== '#bypass') {
        showStepContent(stepIndex);
    } else if (step.target === '#scannerTab' && window.location.hash !== '#scanner') {
        showStepContent(stepIndex);
    } else if (step.target === '#monitorTab' && window.location.hash !== '#monitor') {
        showStepContent(stepIndex);
    } else if (step.target === '#historyTab' && window.location.hash !== '#history') {
        showStepContent(stepIndex);
    } else if (step.target === '#updaterTab' && window.location.hash !== '#updater') {
        showStepContent(stepIndex);
    } else if (stepIndex > 0 && stepIndex < 5 && window.location.hash !== '#bypass') {
        window.location.hash = '#bypass';
        
        if (step.waitForView) {
            waitForViewVisible(step.waitForView, 2000)
                .then(() => {
                    if (step.waitForElement) {
                        return waitForElement(step.target, 3000);
                    }
                    return Promise.resolve();
                })
                .then(() => {
                    disableBypassButtons(); // Ensure buttons are disabled after view loads
                    showStepContent(stepIndex);
                })
                .catch((error) => {
                    console.warn(`Tutorial: ${error.message}, skipping to next step`);
                    nextStep();
                });
        } else if (step.waitForElement) {
            waitForElement(step.target, 3000)
                .then(() => {
                    disableBypassButtons(); // Ensure buttons are disabled
                    showStepContent(stepIndex);
                })
                .catch((error) => {
                    console.warn(`Tutorial: ${error.message}, skipping to next step`);
                    nextStep();
                });
        } else {
            setTimeout(() => {
                disableBypassButtons(); // Ensure buttons are disabled
                showStepContent(stepIndex);
            }, 400);
        }
        return;
    } else {
        if (step.waitForElement) {
            waitForElement(step.target, 3000)
                .then(() => showStepContent(stepIndex))
                .catch((error) => {
                    console.warn(`Tutorial: ${error.message}, skipping to next step`);
                    nextStep();
                });
        } else {
            showStepContent(stepIndex);
        }
    }
}

function showStepContent(stepIndex) {
    const step = tutorialSteps[stepIndex];
    let target = document.querySelector(step.target);
    
    if (!target) {
        console.warn(`Tutorial target not found: ${step.target}`);
        
        // Special handling for modal content - wait for modal to appear
        if (step.highlightModal || step.target === '.modal-content') {
            waitForElement(step.target, 2000)
                .then(() => showStepContent(stepIndex))
                .catch((error) => {
                    console.warn(`Tutorial: ${error.message}, skipping to next step`);
                    nextStep();
                });
            return;
        }
        
        nextStep();
        return;
    }
    
    // Force tutorial elements to be on top
    overlay.style.zIndex = '99998';
    spotlight.style.zIndex = '99999';
    tooltip.style.zIndex = '100001';
    
    // Update spotlight position
    const rect = target.getBoundingClientRect();
    const offsetX = step.offsetX || 0;
    const offsetY = step.offsetY || 0;
    
    spotlight.style.left = `${rect.left - 5 + offsetX}px`;
    spotlight.style.top = `${rect.top - 5 + offsetY}px`;
    spotlight.style.width = `${rect.width + 10}px`;
    spotlight.style.height = `${rect.height + 10}px`;
    
    // Set up dynamic resizing if needed - DISABLE for resultsContainer
    if (step.dynamicResize && step.target !== '#resultsContainer') {
        setupDynamicResize(target, step);
    }
    
    // Set up scroll listener for resultsContainer to keep spotlight aligned
    if (step.target === '#resultsContainer') {
        setupScrollListener(target, step);
    }
    
    // Update tooltip content
    tooltip.querySelector('.tutorial-title').textContent = step.title;
    tooltip.querySelector('.tutorial-description').textContent = step.description;
    document.getElementById('tutorial-step-count').textContent = `Step ${stepIndex + 1} of ${tutorialSteps.length}`;
    
    // Position tooltip
    positionTooltip(rect, step.position, offsetX, offsetY);
    
    // Enable pointer events on target and set high z-index to ensure it's clickable
    target.style.pointerEvents = 'auto';
    target.style.position = 'relative';
    target.style.zIndex = '100000'; // Higher than overlay (99998) but lower than tooltip (100001)
    
    // For modal highlighting, set the modal's z-index appropriately
    if (step.highlightModal) {
        const modal = target.closest('.modal');
        if (modal) {
            modal.style.zIndex = '100000';
        }
    }
    
    // Re-disable bypass buttons on each step to ensure they stay disabled
    disableBypassButtons();
    
    // Handle different next actions
    if (step.nextAction === 'click') {
        const clickHandler = () => {
            target.removeEventListener('click', clickHandler);
            setTimeout(() => nextStep(), 600);
        };
        target.addEventListener('click', clickHandler);
        document.getElementById('tutorial-next').style.display = 'none';
    } else if (step.nextAction === 'waitForToggle') {
        const toggleSwitch = document.querySelector('#showIgnoreListToggle');
        if (toggleSwitch) {
            const toggleHandler = async () => {
                if (toggleSwitch.checked) {
                    setTimeout(async () => {
                        // Fetch ignored adapters from server
                        try {
                            const response = await fetch('/bypass/ignored-adapters');
                            const data = await response.json();
                            const ignoredList = data.ignored_adapters || [];
                            
                            // Wait a bit for adapters to render
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            const ignoredAdapters = document.querySelectorAll('.adapter-card.ignored');
                            if (ignoredAdapters.length > 0) {
                                ignoredAdapters.forEach(card => {
                                    card.style.boxShadow = '0 0 20px var(--warning)';
                                    card.style.opacity = '1';
                                });
                                
                                tooltip.querySelector('.tutorial-title').textContent = 'Ignored adapters';
                                tooltip.querySelector('.tutorial-description').textContent = 'These are virtual or system adapters like VPNs and virtual machines. We usually ignore these since you won\'t need them for bypassing. Click "Next" when you\'re ready.';
                                
                                const firstIgnored = ignoredAdapters[0];
                                const ignoredRect = firstIgnored.getBoundingClientRect();
                                spotlight.style.left = `${ignoredRect.left - 5}px`;
                                spotlight.style.top = `${ignoredRect.top - 5}px`;
                                spotlight.style.width = `${ignoredRect.width + 10}px`;
                                spotlight.style.height = `${ignoredRect.height + 10}px`;
                                positionTooltip(ignoredRect, 'right');
                            } else {
                                tooltip.querySelector('.tutorial-description').textContent = 'Looks like you don\'t have any ignored adapters on this system. They\'re usually things like VPN connections. Click "Next" to continue.';
                            }
                        } catch (error) {
                            console.error('Failed to fetch ignored adapters:', error);
                            tooltip.querySelector('.tutorial-description').textContent = 'Looks like you don\'t have any ignored adapters on this system. They\'re usually things like VPN connections. Click "Next" to continue.';
                        }
                        
                        document.getElementById('tutorial-next').style.display = 'inline-block';
                    }, 500);
                }
                toggleSwitch.removeEventListener('change', toggleHandler);
            };
            toggleSwitch.addEventListener('change', toggleHandler);
            document.getElementById('tutorial-next').style.display = 'none';
        } else {
            document.getElementById('tutorial-next').style.display = 'inline-block';
        }
    } else if (step.nextAction === 'waitForScan') {
        const scanBtn = document.querySelector('#basicScanBtn');
        if (scanBtn) {
            const scanHandler = () => {
                scanBtn.removeEventListener('click', scanHandler);
                
                // Wait for scan to complete
                const scanCompleteHandler = () => {
                    document.removeEventListener('scanCompleted', scanCompleteHandler);
                    setTimeout(() => nextStep(), 1000);
                };
                document.addEventListener('scanCompleted', scanCompleteHandler);
                document.getElementById('tutorial-next').style.display = 'none';
            };
            scanBtn.addEventListener('click', scanHandler);
            document.getElementById('tutorial-next').style.display = 'none';
        } else {
            document.getElementById('tutorial-next').style.display = 'inline-block';
        }
    } else if (step.nextAction === 'waitForDeviceClick') {
        // Wait for user to click on a device in the discovered devices section
        const deviceClickHandler = (e) => {
            const deviceItem = e.target.closest('.device-item');
            if (deviceItem && document.querySelector('#resultsBody').contains(deviceItem)) {
                document.removeEventListener('click', deviceClickHandler);
                setTimeout(() => nextStep(), 800);
            }
        };
        document.addEventListener('click', deviceClickHandler);
        document.getElementById('tutorial-next').style.display = 'none';
    } else if (step.nextAction === 'waitForRevertClick') {
        // Wait for user to click the revert button
        const revertBtn = document.querySelector('.history-card.tutorial-entry .btn-revert');
        if (revertBtn) {
            const revertClickHandler = () => {
                revertBtn.removeEventListener('click', revertClickHandler);
                // The modal will trigger step 15 automatically
            };
            revertBtn.addEventListener('click', revertClickHandler);
            document.getElementById('tutorial-next').style.display = 'none';
        } else {
            document.getElementById('tutorial-next').style.display = 'inline-block';
        }
    } else {
        document.getElementById('tutorial-next').style.display = 'inline-block';
    }
}

function nextStep() {
    // Clean up current step
    const step = tutorialSteps[currentStep];
    const target = document.querySelector(step.target);
    if (target) {
        target.style.pointerEvents = '';
        target.style.position = '';
        target.style.zIndex = '';
    }
    
    // Clean up modal z-index if it was a modal step
    if (step.highlightModal && target) {
        const modal = target.closest('.modal');
        if (modal) {
            modal.style.zIndex = '';
        }
    }
    
    // Reset overlay clip-path
    if (overlay) {
        overlay.style.clipPath = 'none';
    }
    
    // Clean up resize observer
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    
    // Clean up scroll listeners
    cleanupScrollListeners();
    
    // Remove glow from ignored adapters
    document.querySelectorAll('.adapter-card.ignored').forEach(card => {
        card.style.boxShadow = '';
        card.style.opacity = '';
    });
    
    // Resume monitor updates if leaving monitor view
    if (step.target === '.monitor-container' || step.target === '#monitorTab') {
        resumeMonitorUpdates();
    }
    
    // Close revert modal if moving past the modal step (step 15, index 15)
    const revertModal = document.getElementById('revertMacModal');
    if (revertModal && revertModal.style.display === 'flex' && currentStep === 15) {
        revertModal.style.display = 'none';
        // Re-enable the confirm button
        const confirmBtn = document.getElementById('confirmRevertBtn');
        if (confirmBtn && confirmBtn.getAttribute('data-tutorial-disabled')) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '';
            confirmBtn.style.cursor = '';
            confirmBtn.removeAttribute('data-tutorial-disabled');
        }
    }
    
    currentStep++;
    
    if (currentStep < tutorialSteps.length) {
        showStep(currentStep);
    } else {
        completeTutorial();
    }
}

async function completeTutorial() {
    tutorialActive = false;
    
    // Resume monitor updates
    resumeMonitorUpdates();
    
    // Re-enable bypass buttons
    enableBypassButtons();
    
    // Clean up resize observer
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    
    // Clean up scroll listeners
    cleanupScrollListeners();
    
    // Remove tutorial history entry
    removeTutorialHistoryEntry();
    
    // Remove click blocker
    if (overlay && overlay.clickBlocker) {
        document.removeEventListener('click', overlay.clickBlocker, true);
        document.removeEventListener('mousedown', overlay.clickBlocker, true);
    }
    
    // Close any open modals
    const revertModal = document.getElementById('revertMacModal');
    if (revertModal) {
        revertModal.style.display = 'none';
        // Re-enable the confirm button
        const confirmBtn = document.getElementById('confirmRevertBtn');
        if (confirmBtn && confirmBtn.getAttribute('data-tutorial-disabled')) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '';
            confirmBtn.style.cursor = '';
            confirmBtn.removeAttribute('data-tutorial-disabled');
        }
    }
    
    // Restore all saved z-indexes
    savedZIndexes.forEach((value, element) => {
        if (element && element.style) {
            element.style.zIndex = value;
        }
    });
    savedZIndexes.clear();
    
    // Animate out
    if (overlay) overlay.style.opacity = '0';
    if (spotlight) spotlight.style.opacity = '0';
    if (tooltip) tooltip.style.opacity = '0';
    
    setTimeout(() => {
        if (overlay) overlay.remove();
        if (spotlight) spotlight.remove();
        if (tooltip) tooltip.remove();
    }, 300);
    
    // Mark as completed
    try {
        await fetch('/tutorial/complete', { method: 'POST' });
        if (window.showNotification) {
            window.showNotification('Tutorial complete! You\'re all set to use the app.', 'success');
        }
    } catch (error) {
        console.error('Failed to mark tutorial as completed:', error);
    }
}

async function skipTutorial() {
    if (!tutorialActive) return;
    
    // Temporarily increase z-index for confirmation modal
    const confirmModal = document.getElementById('genericConfirmModal');
    if (confirmModal) {
        confirmModal.style.zIndex = '100002';
    }
    
    let confirmed = false;
    try {
        confirmed = window.showConfirmation ? 
            await window.showConfirmation(
                'Skip the tutorial?',
                'You can always restart it later from Settings > Miscellaneous > Restart Tutorial if you change your mind.',
                'Skip',
                'Keep Going'
            ) : confirm('Skip tutorial?');
    } finally {
        // Reset z-index after the modal closes
        if (confirmModal) {
            confirmModal.style.zIndex = '';
        }
    }
    
    if (confirmed) {
        // Clean up before completing
        const step = tutorialSteps[currentStep];
        const target = document.querySelector(step?.target);
        if (target) {
            target.style.pointerEvents = '';
            target.style.position = '';
            target.style.zIndex = '';
        }
        
        completeTutorial();
    }
}

// Export for manual restart with reset functionality
window.restartTutorial = function() {
    // Close settings panel if it's open
    const settingsOverlay = document.querySelector('.settings-panel-overlay');
    if (settingsOverlay && settingsOverlay.style.display === 'flex') {
        settingsOverlay.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // Navigate to home tab
    window.location.hash = '#home';
    
    // Reset show ignored adapters toggle to off
    const showIgnoredToggle = document.getElementById('showIgnoreListToggle');
    if (showIgnoredToggle) {
        showIgnoredToggle.checked = false;
        localStorage.setItem('showIgnoredAdapters', 'false');
    }
    
    // Wait a moment for navigation, then start tutorial
    setTimeout(() => {
        startTutorial();
    }, 300);
};