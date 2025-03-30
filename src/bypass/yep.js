// bypass but in javascript 
document.getElementById('bypassTab').addEventListener('click', async () => {
    try {
        const settingsResponse = await fetch('/settings');
        const settings = await settingsResponse.json();
        const bypassMode = settings.bypass_mode || 'registry';
        const adaptersResponse = await fetch('/bypass/adapters');
        const adapters = await adaptersResponse.json();

        const list = document.getElementById('adapterList');
        list.innerHTML = adapters.map(adapter => `
            <div class="adapter-item">
                <h3>${adapter.description} ${adapter.default ? '(Default)' : ''}</h3>
                <p>Transport Name: <code>${adapter.transport}</code></p>
                <button class="btn-bypass" 
                        onclick="changeMac('${adapter.transport}')">
                    Initiate Bypass (${bypassMode.toUpperCase()})
                </button>
            </div>
        `).join('');
    } catch (error) {
        showStatus(error.message, 'error');
    }
});

function changeMac(transport) {
    const status = document.getElementById('statusMessage');
    
    fetch('/bypass/change-mac', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ transport: transport })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        showStatus(`${data.message}: ${data.new_mac} - ${data.note}`, 'success');
    })
    .catch(error => showStatus(error.message, 'error'));
}

function showStatus(message, type) {
    const status = document.getElementById('statusMessage');
    status.textContent = message;
    status.className = `status-message status-${type}`;
    status.style.display = 'block';
}