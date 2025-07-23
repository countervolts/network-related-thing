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

    showViewFromHash();
    updateActiveNavLink();

    // --- Settings Panel Logic ---
    const settingsFab = document.getElementById('settings-fab');
    if (settingsFab) {
        const settingsPanelOverlay = document.getElementById('settings-panel');
        const settingsPanelContent = document.querySelector('.settings-panel-content');
        const closeSettingsBtn = document.getElementById('closeSettingsPanelBtn');
        const settingsPanelMain = document.getElementById('settings-panel-main');
        const settingsNavLinks = document.querySelectorAll('.settings-nav-link');
        const settingsSearchInput = document.getElementById('settingsSearchInput');
        
        // Open/Close Listeners
        settingsFab.addEventListener('click', () => {
            if (settingsPanelOverlay) {
                settingsPanelOverlay.style.display = 'flex';
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

                allSections.forEach(section => {
                    const allSettings = section.querySelectorAll('.setting-item');
                    
                    allSettings.forEach(item => {
                        const terms = item.dataset.searchTerm || '';
                        const isVisible = terms.toLowerCase().includes(searchTerm);
                        item.style.display = isVisible ? '' : 'none';
                    });

                    section.querySelectorAll('.section-title').forEach(title => {
                        const grid = title.nextElementSibling;
                        if (grid && grid.classList.contains('settings-grid')) {
                            const hasVisibleItems = grid.querySelector('.setting-item:not([style*="display: none"])');
                            title.style.display = hasVisibleItems ? '' : 'none';
                        } else {
                            title.style.display = searchTerm ? 'none' : '';
                        }
                    });

                    const hasVisibleContent = section.querySelector('.setting-item:not([style*="display: none"]), .section-title:not([style*="display: none"])');

                });
            });
        }

        // Nav link scrolling and active state
        if (settingsNavLinks.length > 0 && settingsPanelMain) {
            settingsNavLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = link.getAttribute('href').substring(1);
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        settingsPanelMain.scrollTo({
                            top: targetElement.offsetTop - 30,
                            behavior: 'smooth'
                        });
                    }
                });
            });

            settingsPanelMain.addEventListener('scroll', () => {
                let currentSectionId = '';
                const sections = Array.from(settingsNavLinks).map(link => document.getElementById(link.getAttribute('href').substring(1)));

                sections.forEach(section => {
                    if (section && section.offsetTop <= settingsPanelMain.scrollTop + 40) {
                        currentSectionId = `#${section.id}`;
                    }
                });

                settingsNavLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === currentSectionId);
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

            // Guard against missing elements
            if (!accentColorPicker || !resetAccentColorBtn || !clockFormatToggle || !themeSelector || !navTabDropdown || !resetNavVisibilityBtn) {
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
    const createTooltip = (iconId, content, position = 'right') => {
        const icon = document.getElementById(iconId);
        if (!icon) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.innerHTML = content;
        document.body.appendChild(tooltip);

        let hideTimeout;

        const show = () => {
            clearTimeout(hideTimeout);
            const rect = icon.getBoundingClientRect();
            tooltip.classList.add('visible');

            // Position tooltip based on the 'position' argument
            if (position === 'left') {
                tooltip.style.left = `${rect.left - tooltip.offsetWidth - 10}px`;
                tooltip.style.top = `${rect.top + (rect.height / 2) - (tooltip.offsetHeight / 2)}px`;
            } else { // Default to right
                tooltip.style.left = `${rect.right + 10}px`;
                tooltip.style.top = `${rect.top + (rect.height / 2) - (tooltip.offsetHeight / 2)}px`;
            }
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

    // Initialize tooltips
    createTooltip(
        'bypassTabInfo',
        `<h3>Bypass Methods</h3>
         <p><strong>Standard:</strong> Sets a valid, non-random MAC address.</p>
         <p><strong>Tmac:</strong> Uses the format of the popular TMAC tool.</p>
         <p><strong>Randomized:</strong> Generates a fully random (Unicast LAA) MAC address.</p>
         <div class="tooltip-warning">Note: All methods require administrative privileges.</div>`,
        'left'
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