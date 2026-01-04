document.addEventListener('DOMContentLoaded', () => {
    // --- Nav Toggle Logic ---
    const navToggleBtn = document.getElementById('navToggleBtn');
    const mainHeader = document.querySelector('.main-header');
    const mainContainer = document.querySelector('.container');

    if (navToggleBtn && mainHeader && mainContainer) {
        const applyNavState = (isHidden) => {
            mainHeader.classList.toggle('hidden', isHidden);
            navToggleBtn.classList.toggle('hidden', isHidden);
        };

        navToggleBtn.addEventListener('click', () => {
            const isHidden = mainHeader.classList.toggle('hidden');
            applyNavState(isHidden);
            localStorage.setItem('navHidden', isHidden);
        });

        // Restore nav state on page load
        const savedNavHidden = localStorage.getItem('navHidden') === 'true';
        applyNavState(savedNavHidden);
    }

    // Add 'loaded' class to body to trigger animations for general content
    setTimeout(() => {
        document.body.classList.add('loaded');
    }, 100);

    const ANIMATION_PRESETS = {
        bouncy: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        smooth: 'ease-in-out',
        springy: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        linear: 'linear'
    };

    // --- View Switching Logic ---
    const showViewFromHash = () => {
        const hash = window.location.hash || '#home';
        const views = {
            '#home': 'homeView',
            '#scanner': 'scannerView',
            '#bypass': 'bypassView',
            '#history': 'historyView',
            '#updater': 'updaterView',
            '#monitor': 'monitorView',
            '#auto': 'autoView'
        };

        Object.values(views).forEach(viewId => {
            const viewElement = document.getElementById(viewId);
            if (viewElement) {
                viewElement.style.display = 'none';
                viewElement.classList.remove('visible');
            }
        });

        const viewId = views[hash];
        if (viewId) {
            const viewElement = document.getElementById(viewId);
            if (viewElement) {
                viewElement.style.display = 'block';
                setTimeout(() => viewElement.classList.add('visible'), 10);
            }

            if (viewId === 'homeView') {
                if (window.loadStatistics) window.loadStatistics();
                if (window.loadSystemInfo) window.loadSystemInfo();
            }
        }
    };

    const updateActiveNavLink = () => {
        const hash = window.location.hash || '#home';
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const activeLink = document.querySelector(`.pill-nav a[href="${hash}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            const glider = document.querySelector('.pill-nav .glider');
            if (glider) {
                console.log(`[Debug] updateActiveNavLink: Active link is ${activeLink.href}. Measured offsetWidth: ${activeLink.offsetWidth}px`);
                glider.style.width = `${activeLink.offsetWidth}px`;
                glider.style.left = `${activeLink.offsetLeft}px`;
            }
        }
    };

    window.updateActiveNavLink = updateActiveNavLink; // Make globally accessible

    window.addEventListener('hashchange', () => {
        showViewFromHash();
        updateActiveNavLink();
    });

    // Initial setup
    showViewFromHash();
    window.addEventListener('load', updateActiveNavLink);

    // --- Settings Panel Logic ---
    const settingsFab = document.getElementById('settings-fab');
    if (settingsFab) {
        const settingsPanelOverlay = document.getElementById('settings-panel');
        const settingsPanelContent = document.querySelector('.settings-panel-content');
        const closeSettingsBtn = document.getElementById('closeSettingsPanelBtn');
        const settingsPanelMain = document.getElementById('settings-panel-main');
        const settingsNavLinks = document.querySelectorAll('.settings-nav-link');
        const settingsSearchInput = document.getElementById('settingsSearchInput');
        
        const showSection = (targetId) => {
            const allSections = settingsPanelMain.querySelectorAll('.settings-section-content');
            const targetSection = document.getElementById(targetId);

            allSections.forEach(section => {
                if (section.id === targetId) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });

            settingsNavLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('href') === `#${targetId}`);
            });
        };

        // Open/Close Listeners
        settingsFab.addEventListener('click', () => {
            if (settingsPanelOverlay) {
                settingsPanelOverlay.style.display = 'flex';
                const activeLink = document.querySelector('.settings-nav-link.active');
                const initialSectionId = activeLink ? activeLink.getAttribute('href').substring(1) : 'settings-section-misc';
                showSection(initialSectionId);
            }
            document.body.style.overflow = 'hidden';
        });

        const closeSettingsPanel = () => {
            if (settingsPanelOverlay) {
                settingsPanelOverlay.style.display = 'none';
            }
            document.body.style.overflow = '';
        };

        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', closeSettingsPanel);
        }

        if (settingsPanelOverlay) {
            settingsPanelOverlay.addEventListener('click', (e) => {
                if (e.target === settingsPanelOverlay) {
                    closeSettingsPanel();
                }
            });
        }

        // Search Logic
        if (settingsSearchInput && settingsPanelMain) {
            settingsSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                const allSections = settingsPanelMain.querySelectorAll('.settings-section-content');

                if (searchTerm) {
                    // Show all sections to enable searching across them
                    allSections.forEach(section => section.style.display = 'block');
                } else {
                    // When search is cleared, revert to showing only the active section
                    const activeLink = document.querySelector('.settings-nav-link.active');
                    if (activeLink) {
                        showSection(activeLink.getAttribute('href').substring(1));
                    }
                    // Also reset all inline styles from the search
                    allSections.forEach(section => {
                        section.style.display = '';
                        section.querySelectorAll('.setting-item, .section-title').forEach(el => el.style.display = '');
                    });
                    return; // Exit after resetting to default view
                }

                allSections.forEach(section => {
                    let sectionHasVisibleContent = false;
                    const allSettings = section.querySelectorAll('.setting-item');
                    
                    allSettings.forEach(item => {
                        const terms = item.dataset.searchTerm || '';
                        const isVisible = terms.toLowerCase().includes(searchTerm);
                        item.style.display = isVisible ? '' : 'none';
                        if (isVisible) sectionHasVisibleContent = true;
                    });

                    section.querySelectorAll('.section-title').forEach(title => {
                        const grid = title.nextElementSibling;
                        if (grid && grid.classList.contains('settings-grid')) {
                            const hasVisibleItems = grid.querySelector('.setting-item:not([style*="display: none"])');
                            title.style.display = hasVisibleItems ? '' : 'none';
                        }
                    });

                    // Hide the main section title if no content matches
                    const mainTitle = section.querySelector('.settings-main-title');
                    if (mainTitle) {
                        mainTitle.style.display = sectionHasVisibleContent ? '' : 'none';
                    }
                });
            });
        }

        // Nav link click handling
        if (settingsNavLinks.length > 0) {
            settingsNavLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = link.getAttribute('href').substring(1);
                    showSection(targetId);
                    settingsSearchInput.value = ''; // Clear search on tab change
                });
            });
        }

        // --- Customization Logic ---
        const initCustomization = () => {
            const accentColorPicker = document.getElementById('accentColorPicker');
            const resetAccentColorBtn = document.getElementById('resetAccentColorBtn');
            const clockFormatToggle = document.getElementById('clockFormatToggle');
            const themeSelector = document.getElementById('themeSelector');
            const navTabDropdown = document.getElementById('navTabDropdown');
            const resetNavVisibilityBtn = document.getElementById('resetNavVisibilityBtn');
            const iconNavToggle = document.getElementById('iconNavToggle');
            const navAnimationSelector = document.getElementById('navAnimationSelector');

            // Guard against missing elements
            if (!accentColorPicker || !resetAccentColorBtn || !clockFormatToggle || !themeSelector || !navTabDropdown || !resetNavVisibilityBtn || !iconNavToggle || !navAnimationSelector) {
                console.error("One or more customization settings elements are missing from the DOM.");
                return;
            }
            
            const navTabDropdownOptions = navTabDropdown.querySelector('.custom-options');
            if (!navTabDropdownOptions) {
                console.error("Custom dropdown options container is missing.");
                return;
            }

            const TABS_TO_TOGGLE = {
                scannerTab: 'Scanner',
                monitorTab: 'Monitor',
                autoTab: 'Auto',
                historyTab: 'History',
                updaterTab: 'Updater'
            };

            const defaultSettings = {
                theme: 'dark',
                accentColor: '#0a84ff',
                use24HourClock: false,
                useIconNav: false,
                navAnimation: 'bouncy',
                navVisibility: {
                    scannerTab: true,
                    monitorTab: true,
                    autoTab: true,
                    historyTab: true,
                    updaterTab: true,
                }
            };

            const applyTheme = (themeName) => {
                document.documentElement.setAttribute('data-theme', themeName);
                themeSelector.value = themeName;
            };

            const applyAccentColor = (color) => {
                document.documentElement.style.setProperty('--accent', color);
                accentColorPicker.value = color;

                const isLightColor = (hex) => {
                    const rgb = parseInt(hex.slice(1), 16);
                    const r = (rgb >> 16) & 0xff;
                    const g = (rgb >> 8) & 0xff;
                    const b = rgb & 0xff;
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    return brightness > 200; 
                };

                const buttonTextColor = isLightColor(color) ? '#333333' : '#ffffff';
                document.documentElement.style.setProperty('--button-text-color', buttonTextColor);
            };

            const applyNavAnimation = (animationName) => {
                const timingFunction = ANIMATION_PRESETS[animationName] || ANIMATION_PRESETS.bouncy;
                document.documentElement.style.setProperty('--nav-glider-timing-function', timingFunction);
                navAnimationSelector.value = animationName;
            };

            const applyNavStyle = (useIcons) => {
                document.documentElement.dataset.navStyle = useIcons ? 'icons' : 'text';
                iconNavToggle.checked = useIcons;

                const pillNav = document.querySelector('.pill-nav');
                if (!pillNav) return;

                let glider = pillNav.querySelector('.glider');
                if (!glider) {
                    glider = document.createElement('div');
                    glider.className = 'glider';
                    glider.style.transition = 'none';
                    pillNav.insertBefore(glider, pillNav.firstChild);
                    // force a reflow
                    void glider.offsetWidth;
                    glider.style.transition = '';
                }

                const measureAndPosition = () => {
                    const hash = window.location.hash || '#home';
                    const activeLink = document.querySelector(`.pill-nav a[href="${hash}"]`);
                    if (activeLink && glider) {
                        requestAnimationFrame(() => {
                            glider.style.width = `${activeLink.offsetWidth}px`;
                            glider.style.left = `${activeLink.offsetLeft}px`;
                        });
                    }
                };

                requestAnimationFrame(() => requestAnimationFrame(measureAndPosition));

                if (!useIcons) {
                    const onEnd = (e) => {
                        if (!(e.target instanceof Element) || !e.target.closest('.pill-nav')) return;
                        pillNav.removeEventListener('transitionend', onEnd);
                        measureAndPosition();
                    };
                    pillNav.addEventListener('transitionend', onEnd, { once: true });

                    setTimeout(() => {
                        pillNav.removeEventListener('transitionend', onEnd);
                        measureAndPosition();
                    }, 450);
                }
            };

            const toggleNavElement = (tabId, shouldShow) => {
                const navLink = document.getElementById(tabId);
                const navItem = navLink ? navLink.closest('.nav-item-wrapper') : null;
                if (navItem) {
                    navItem.classList.toggle('nav-item-hidden', !shouldShow);
                }
            };

            const updateSeparators = () => {
                const sep1 = document.getElementById('nav-sep-1');
                const sep2 = document.getElementById('nav-sep-2');
                const coreTabs = ['bypassTab', 'scannerTab', 'monitorTab', 'autoTab'];
                const endTabs = ['historyTab', 'updaterTab'];
                
                const isCoreGroupVisible = coreTabs.some(id => {
                    const el = document.getElementById(id);
                    return el && !el.closest('.nav-item-wrapper')?.classList.contains('nav-item-hidden');
                });
                const isEndGroupVisible = endTabs.some(id => {
                    const el = document.getElementById(id);
                    return el && !el.closest('.nav-item-wrapper')?.classList.contains('nav-item-hidden');
                });

                const sep1Wrapper = sep1 ? sep1.closest('.nav-item-wrapper') : null;
                if (sep1Wrapper) {
                    sep1Wrapper.classList.toggle('nav-item-hidden', !isCoreGroupVisible);
                }
                
                const sep2Wrapper = sep2 ? sep2.closest('.nav-item-wrapper') : null;
                if (sep2Wrapper) {
                    sep2Wrapper.classList.toggle('nav-item-hidden', !(isCoreGroupVisible && isEndGroupVisible));
                }
                
                setTimeout(() => window.updateActiveNavLink && window.updateActiveNavLink(), 50);
            };

            const saveSettings = () => {
                const settings = {
                    theme: themeSelector.value,
                    accentColor: accentColorPicker.value,
                    use24HourClock: clockFormatToggle.checked,
                    useIconNav: iconNavToggle.checked,
                    navAnimation: navAnimationSelector.value,
                    navVisibility: {}
                };
                Object.keys(TABS_TO_TOGGLE).forEach(tabId => {
                    const checkbox = navTabDropdownOptions.querySelector(`input[data-tab-id="${tabId}"]`);
                    if (checkbox) {
                        settings.navVisibility[tabId] = checkbox.checked;
                    }
                });
                localStorage.setItem('uiCustomization', JSON.stringify(settings));
                localStorage.setItem('theme', settings.theme);
            };

            const loadSettings = () => {
                const saved = JSON.parse(localStorage.getItem('uiCustomization')) || {};
                const settings = { ...defaultSettings, ...saved, navVisibility: { ...defaultSettings.navVisibility, ...saved.navVisibility } };
                
                applyTheme(settings.theme || defaultSettings.theme);
                applyAccentColor(settings.accentColor || defaultSettings.accentColor);
                applyNavStyle(settings.useIconNav || defaultSettings.useIconNav);
                applyNavAnimation(settings.navAnimation || defaultSettings.navAnimation);
                
                clockFormatToggle.checked = settings.use24HourClock;
                document.dispatchEvent(new CustomEvent('clockFormatChanged', { detail: { use24HourClock: settings.use24HourClock } }));
                
                Object.keys(TABS_TO_TOGGLE).forEach((tabId) => {
                    const isVisible = settings.navVisibility[tabId] !== false;
                    const checkbox = navTabDropdownOptions.querySelector(`input[data-tab-id="${tabId}"]`);
                    if (checkbox) checkbox.checked = isVisible;
                    toggleNavElement(tabId, isVisible);
                });
                updateSeparators();
            };

            // Populate dropdown only once
            if (navTabDropdownOptions.children.length === 0) {
                Object.entries(TABS_TO_TOGGLE).forEach(([tabId, tabName]) => {
                    const option = document.createElement('label');
                    option.className = 'custom-option';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.dataset.tabId = tabId;
                    
                    option.appendChild(checkbox);
                    option.append(` ${tabName}`); // Add space for alignment
                    
                    checkbox.addEventListener('change', () => {
                        toggleNavElement(tabId, checkbox.checked);
                        updateSeparators();
                        saveSettings();
                    });
                    navTabDropdownOptions.appendChild(option);
                });
            }

            // Dropdown open/close logic
            const customSelect = navTabDropdown.querySelector('.custom-select');
            const trigger = navTabDropdown.querySelector('.custom-select-trigger');
            if (trigger && customSelect) {
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    customSelect.classList.toggle('open');
                });
            }
            window.addEventListener('click', (e) => {
                if (customSelect && !customSelect.contains(e.target)) {
                    customSelect.classList.remove('open');
                }
            });

            // Event listeners for settings controls
            themeSelector.addEventListener('change', () => { applyTheme(themeSelector.value); saveSettings(); });
            accentColorPicker.addEventListener('input', (e) => { applyAccentColor(e.target.value); saveSettings(); });
            resetAccentColorBtn.addEventListener('click', () => { applyAccentColor(defaultSettings.accentColor); saveSettings(); });
            clockFormatToggle.addEventListener('change', () => {
                document.dispatchEvent(new CustomEvent('clockFormatChanged', { detail: { use24HourClock: clockFormatToggle.checked } }));
                saveSettings();
            });
            iconNavToggle.addEventListener('change', () => {
                applyNavStyle(iconNavToggle.checked);
                saveSettings();
            });

            navAnimationSelector.addEventListener('change', () => {
                applyNavAnimation(navAnimationSelector.value);
                saveSettings();
            });

            resetNavVisibilityBtn.addEventListener('click', () => {
                Object.keys(TABS_TO_TOGGLE).forEach(tabId => {
                    const checkbox = navTabDropdownOptions.querySelector(`input[data-tab-id="${tabId}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        toggleNavElement(tabId, true); 
                    }
                });
                updateSeparators(); 
                saveSettings(); 
            });

            loadSettings();
        };

        initCustomization();
    }

    // --- Tooltip Logic for Info Icons ---
    const createTooltip = (iconId, content) => {
        const icon = document.getElementById(iconId);
        if (!icon) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.innerHTML = content;
        document.body.appendChild(tooltip);

        let hideTimeout;

        const positionTooltip = () => {
            const rect = icon.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const margin = 10;

            // Determine available space on both sides
            const spaceRight = window.innerWidth - rect.right - margin;
            const spaceLeft = rect.left - margin;

            // Decide position based on available space
            let position = 'right';
            if (spaceRight < tooltipRect.width && spaceLeft > spaceRight) {
                position = 'left';
            }

            // Set horizontal position
            if (position === 'left') {
                tooltip.style.left = `${rect.left - tooltipRect.width - margin}px`;
            } else {
                tooltip.style.left = `${rect.right + margin}px`;
            }

            // Set vertical position and clamp it to stay within the viewport
            let top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
            if (top < margin) {
                top = margin;
            } else if (top + tooltipRect.height > window.innerHeight - margin) {
                top = window.innerHeight - tooltipRect.height - margin;
            }
            tooltip.style.top = `${top}px`;
        };

        const show = () => {
            clearTimeout(hideTimeout);
            tooltip.classList.add('visible');
            positionTooltip();
        };

        const hide = () => {
            hideTimeout = setTimeout(() => {
                tooltip.classList.remove('visible');
            }, 200);
        };

        icon.addEventListener('mouseenter', show);
        icon.addEventListener('mouseleave', hide);
        tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
        tooltip.addEventListener('mouseleave', hide);
    };

    window.createTooltip = createTooltip; // Make it globally accessible

    // Initialize tooltips
    createTooltip(
        'bypassTabInfo',
        `<h3>Bypass Methods</h3>
         <p><strong>Standard:</strong> Sets a valid, non-random MAC address.</p>
         <p><strong>Tmac:</strong> Uses the format of the popular TMAC tool.</p>
         <p><strong>Randomized:</strong> Generates a fully random (Unicast LAA) MAC address.</p>
         <div class="tooltip-warning">Note: All methods require administrative privileges.</div>`
    );

    createTooltip(
        'scannerTabInfo',
        `<h3>Scan Types</h3>
         <p><strong>Basic Scan:</strong> Quickly discovers active devices on your network, showing their IP and MAC addresses.</p>
         <p><strong>Full Scan:</strong> A more thorough scan that also attempts to identify the device's hostname and manufacturer. This scan takes longer.</p>
         <div class="tooltip-warning">Note: Full scans require the OUI file (downloadable in settings) for vendor lookups.</div>`,
        'right'
    );

    createTooltip(
        'navAnimationInfo',
        `<h3>Animation Previews</h3>
         <p>Hover over an item to see a preview of the animation.</p>
         <div class="animation-preview-container">
            <div class="animation-preview-item">
                <span class="animation-preview-label">Bouncy</span>
                <div class="animation-preview-track">
                    <div class="animation-preview-dot"></div>
                    <div class="animation-preview-glider" style="transition-timing-function: ${ANIMATION_PRESETS.bouncy};"></div>
                    <div class="animation-preview-dot"></div>
                </div>
            </div>
            <div class="animation-preview-item">
                <span class="animation-preview-label">Smooth</span>
                <div class="animation-preview-track">
                    <div class="animation-preview-dot"></div>
                    <div class="animation-preview-glider" style="transition-timing-function: ${ANIMATION_PRESETS.smooth};"></div>
                    <div class="animation-preview-dot"></div>
                </div>
            </div>
            <div class="animation-preview-item">
                <span class="animation-preview-label">Springy</span>
                <div class="animation-preview-track">
                    <div class="animation-preview-dot"></div>
                    <div class="animation-preview-glider" style="transition-timing-function: ${ANIMATION_PRESETS.springy};"></div>
                    <div class="animation-preview-dot"></div>
                </div>
            </div>
            <div class="animation-preview-item">
                <span class="animation-preview-label">Linear</span>
                <div class="animation-preview-track">
                    <div class="animation-preview-dot"></div>
                    <div class="animation-preview-glider" style="transition-timing-function: ${ANIMATION_PRESETS.linear};"></div>
                    <div class="animation-preview-dot"></div>
                </div>
            </div>
         </div>`
    );

    createTooltip(
        'autoBypassInfo',
        `<h3>Auto Bypass Service</h3>
         <p>This runs a background script to monitor your internet. If it detects a disconnection, it automatically performs a bypass on the selected adapter.</p>
         <div class="tooltip-warning">Note: This feature is in development and might not work as intended.</div>`
    );

    createTooltip(
        'serverBackendInfo',
        `<h3>Server Backend</h3>
         <p><strong>None (Only Flask):</strong> The basic server included with Flask. Not recommended for regular use.</p>
         <p><strong>Waitress:</strong> A reliable and stable production server. This is the default option.</p>
         <p><strong>Hypercorn:</strong> A high-performance server that can be faster but may be less stable on some systems.</p>
         <div class="tooltip-warning">A restart is required for this change to take effect.</div>`
    );
});

// Network Debugging Panel Logic
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('networkDebugPanel');
    if (!panel) return;

    const togglePanel = () => {
        const isOpen = panel.classList.toggle('open');
        if (isOpen) {
            panel.style.display = 'block';
            setTimeout(() => panel.classList.add('visible'), 10);
        } else {
            panel.classList.remove('visible');
            setTimeout(() => { if (!panel.classList.contains('open')) panel.style.display = 'none'; }, 300);
        }
    };

    document.getElementById('networkDebugToggle')?.addEventListener('click', togglePanel);

    const logNetworkActivity = (data) => {
        if (!data || !data.timestamp) return;

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-time">${new Date(data.timestamp).toLocaleTimeString()}</span>
            <span class="log-message">${data.message}</span>
            <span class="log-latency">${data.latency}ms</span>
        `;

        const logContainer = panel.querySelector('.network-debug-log');
        if (logContainer) {
            logContainer.prepend(logEntry);
            // Keep the log from growing indefinitely
            const MAX_LOG_ENTRIES = 50;
            // Instead of removing DOM nodes (which causes entries to "fall off"),
            // hide the oldest visible entries so overflow/clip behavior keeps the UI unchanged.
            let visibleChildren = Array.from(logContainer.children).filter(c => getComputedStyle(c).display !== 'none');
            while (visibleChildren.length > MAX_LOG_ENTRIES) {
                // find the oldest visible (last) child and hide it
                const lastVisible = [...logContainer.children].reverse().find(c => getComputedStyle(c).display !== 'none');
                if (!lastVisible) break;
                lastVisible.classList.add('hidden-by-search'); // already defined in CSS
                lastVisible.setAttribute('aria-hidden', 'true');
                // recompute visible children and continue until within limit
                visibleChildren = Array.from(logContainer.children).filter(c => getComputedStyle(c).display !== 'none');
            }
        } else {
            // Fallback for the old structure, though this should now be corrected.
            panel.appendChild(logEntry);
        }
    };

    const clearNetworkLog = () => {
        const logContainer = panel.querySelector('.network-debug-log');
        if (logContainer) {
            logContainer.innerHTML = '';
        }
    };

    // Expose functions to the global scope for debugging
    window.logNetworkActivity = logNetworkActivity;
    window.clearNetworkLog = clearNetworkLog;
});