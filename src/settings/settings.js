document.addEventListener('DOMContentLoaded', () => {
    const scannerTab = document.getElementById('scannerTab');
    const settingsTab = document.getElementById('settingsTab');
    const scannerView = document.getElementById('scannerView');
    const settingsView = document.getElementById('settingsView');

    // Check if the elements exist
    if (!scannerView || !settingsView) {
        console.error('Error: scannerView or settingsView is not found in the DOM.');
        return;
    }

    function switchView(view) {
        if (view === 'scanner') {
            scannerView.style.display = 'block';
            settingsView.style.display = 'none';
            window.location.hash = '#scanner';
        } else if (view === 'settings') {
            scannerView.style.display = 'none';
            settingsView.style.display = 'block';
            window.location.hash = '#settings';
        }
    }

    scannerTab.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('scanner');
    });

    settingsTab.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('settings');
    });

    // Automatically switch view based on the current URL hash
    const currentHash = window.location.hash;
    if (currentHash === '#settings') {
        switchView('settings');
    } else {
        switchView('scanner');
    }
});