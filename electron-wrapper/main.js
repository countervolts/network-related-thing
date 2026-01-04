import { app, BrowserWindow, Menu } from 'electron';
import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pyProc = null;
let mainWindow = null;
let serverPort = null;

// --- Logger Setup ---
const LOG_DIR = path.join(app.getPath('appData'), 'ayosbypasser');
const LOG_FILE = path.join(LOG_DIR, 'latest.log');

// Ensure log directory exists and clear old log file on start
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
if (fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, ''); // Clear the log file for a fresh session
}

function logToFile(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} [Electron] ${message}`;
  console.log(formattedMessage); // Also log to console for live view during development
  try {
    fs.appendFileSync(LOG_FILE, formattedMessage + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

function logInitialDebugInfo() {
  logToFile('--- Electron App Initializing ---');
  logToFile(`Start Time: ${new Date().toLocaleString()}`);
  logToFile(`Launch Args: ${process.argv.join(' ')}`);

  let isAdmin = false;
  if (os.platform() === 'win32') {
    try {
      // Use a more reliable command to check for admin privileges.
      // 'fsutil dirty query' requires elevation and doesn't depend on the Server service.
      execSync('fsutil dirty query %systemdrive%', { stdio: 'ignore' });
      isAdmin = true;
    } catch (e) {
      isAdmin = false;
    }
  } else {
    // For Linux/macOS, check if UID is 0 (root)
    isAdmin = process.getuid && process.getuid() === 0;
  }
  logToFile(`Was Ran As Admin?: ${isAdmin}`);
  
  logToFile(`CPU Threads: ${os.cpus().length}`);
  
  logToFile('Core Libs Loaded:');
  for (const [lib, version] of Object.entries(process.versions)) {
    logToFile(`  - ${lib}: ${version}`);
  }
  logToFile('---------------------------------');
}

app.commandLine.appendSwitch('enable-features', 'FluentScrollbar,FluentOverlayScrollbar');

// scrollbar css
const scrollbarCSS = `
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 5px;
}
::-webkit-scrollbar-thumb {
  background: rgba(115, 115, 115, 0.8);
  border-radius: 5px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(130, 130, 130, 1);
}
`;

function startPythonServer() {
  // dev or prod?
  let serverPath;
  let serverArgs = [];
  
  if (app.isPackaged) {
    // Production - use the bundled server.exe
    serverPath = path.join(process.resourcesPath, 'app', 'server.exe');
    logToFile(`Running in production mode, server path: ${serverPath}`);
    
    // Log if server.exe exists
    logToFile(`Core aspect server.exe loaded: ${fs.existsSync(serverPath) ? 'Y' : 'N'}`);
    
    const CREATE_NO_WINDOW = 0x08000000;
    const options = {
      windowsHide: true, 
      detached: false,    
      stdio: 'pipe',   
      cwd: path.dirname(serverPath), 
      env: { ...process.env, RUNNING_IN_ELECTRON: '1' } 
    };

    // Only add creationFlags on Windows
    if (os.platform() === 'win32') {
      options.creationFlags = CREATE_NO_WINDOW;
    }

    console.log(`Starting server: ${serverPath}`);
    console.log(`Server working directory: ${options.cwd}`);
    
    pyProc = spawn(serverPath, ['--electron-wrapper'], options);

  } else {
    // dev mode 
    serverPath = 'python';
    serverArgs = [path.join(__dirname, '..', 'server.py')];
    console.log('Running in development mode, server path:', path.join(__dirname, '..', 'server.py'));
    
    pyProc = spawn(serverPath, serverArgs, {
      windowsHide: true,
      stdio: 'pipe',
      env: { ...process.env, RUNNING_IN_ELECTRON: '1' } 
    });
  }
  
  pyProc.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`Python server: ${output}`);
    const match = output.match(/Server running at http:\/\/[\d\.]+?:(\d+)/) || output.match(/Starting with .* server on localhost:(\d+)/);
    if (match && match[1]) {
      if (!serverPort) { 
        serverPort = match[1];
        logToFile(`Python server is running on port: ${serverPort}`);
        console.log(`Detected Python server on port: ${serverPort}`);
        if (mainWindow) {
          mainWindow.loadURL(`http://localhost:${serverPort}`);
        }
      }
    }
  });
  
  pyProc.stderr.on('data', (data) => {
    logToFile(`Python server error: ${data.toString()}`);
    console.error(`Python server error: ${data.toString()}`);
  });
  
  pyProc.on('close', (code) => {
    pyProc = null;
    if (code !== 0) {
      console.error(`Python server exited with code ${code}`);
    }
  });
  
  pyProc.on('error', (err) => {
    console.error('Failed to start Python server:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#181818',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !app.isPackaged
    },
    icon: path.join(__dirname, '..', 'favicon.ico'),
    autoHideMenuBar: true,
    frame: true
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          background-color: #181818;
          color: #e0e0e0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
        }
        .loader {
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top: 4px solid #2196F3;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        h2 {
          margin-bottom: 8px;
        }
        p {
          margin-top: 0;
          color: #aaaaaa;
        }
      </style>
    </head>
    <body>
      <div class="loader"></div>
      <h2>Starting Network Related Thing</h2>
      <p>Loading application...</p>
    </body>
    </html>
  `);

  startPythonServer();

  // Injecting scrollbar css
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(scrollbarCSS)
      .then(() => console.log('Custom scrollbar CSS injected'))
      .catch(err => console.error('Failed to inject scrollbar CSS:', err));
  });

  mainWindow.on('closed', function() {
    mainWindow = null;
  });
  
  // Open devtools in dev mode OR if the -d/--debug flag is passed to the executable
  const openDevTools = !app.isPackaged || process.argv.includes('-d') || process.argv.includes('--debug');
  if (openDevTools) {
    mainWindow.webContents.openDevTools();
  }
}

app.on('ready', () => {
  logInitialDebugInfo();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  if (pyProc) {
    console.log(`Killing Python server process tree (PID: ${pyProc.pid})...`);
    if (os.platform() === 'win32') {
      try {
        // holy shit this was so fucking annoying to fix
        execSync(`taskkill /pid ${pyProc.pid} /T /F`);
        console.log('Python server process tree terminated.');
      } catch (err) {
        console.error('Failed to kill Python server process tree:', err.message);
      }
    } else {
      pyProc.kill();
    }
    pyProc = null;
  }
});

async function loadSettings() {
        try {
            const response = await fetch('/settings');
            const settings = await response.json();
            currentSettings = settings;
            window.IS_ELECTRON = settings.is_electron || false;

            // General Settings
            hideWebsiteToggle.checked = settings.hide_website || false;
            autoOpenToggle.checked = settings.auto_open_page !== false;
            autoUpdateToggle.checked = settings.auto_update !== false;
            runAsAdminToggle.checked = settings.run_as_admin || false;
            
            // Developer Settings
            debugModeToggle.checked = settings.debug_mode || false;
            uiDebugModeToggle.checked = settings.ui_debug_mode || false;
            enableExperimentalFeaturesToggle.checked = settings.enable_experimental_features || false;
            fullScanMethodDropdown.value = settings.full_scan_method || 'divide_and_conquer';
            toggleSeparateScanMethods(settings.separate_scan_methods || false);

            // Misc Settings
            betaFeaturesToggle.checked = settings.beta_features || false;

            // Disable settings that don't work in Electron
            if (window.IS_ELECTRON) {
                const settingsToDisable = {
                    'autoOpenToggle': 'This is not applicable in the desktop app.',
                    'runAsAdminToggle': 'Run the application as an administrator to grant elevated privileges.'
                };

                for (const [toggleId, reason] of Object.entries(settingsToDisable)) {
                    const toggle = document.getElementById(toggleId);
                    if (toggle) {
                        toggle.checked = false;
                        toggle.disabled = true;
                        const parentItem = toggle.closest('.setting-item');
                        if (parentItem) {
                            parentItem.classList.add('disabled');
                            const description = parentItem.querySelector('.setting-description');
                            if (description) {
                                description.textContent = reason;
                            }
                        }
                    }
                }

                // Disable Debug Level dropdown
                if (debugModeDropdown) {
                    debugModeDropdown.value = 'full';
                    debugModeDropdown.disabled = true;
                    const parentItem = debugModeDropdown.closest('.setting-item');
                    if (parentItem) {
                        parentItem.classList.add('disabled');
                        const description = parentItem.querySelector('.setting-description');
                        if (description) {
                            description.textContent = 'Debug level is forced to "Full" in the desktop app.';
                        }
                    }
                }
            }

            applyDebugMode(settings.debug_mode);
            applyUiDebugMode(settings.ui_debug_mode);
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

document.addEventListener('DOMContentLoaded', () => {
    const toggleConsoleBtn = document.getElementById('toggleConsoleBtn');
    const restartAdaptersBtn = document.getElementById('restartAdaptersBtn');
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');
    const closeFab = document.getElementById('close-fab');

    // Disable settings that don't work in Electron
    if (window.IS_ELECTRON) {
        const settingsToDisable = {
            'toggleConsoleBtn': 'Console is managed by the application window.',
            'clearConsoleBtn': 'Console is managed by the application window.'
        };

        for (const [btnId, reason] of Object.entries(settingsToDisable)) {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = true;
                const parentItem = btn.closest('.setting-item');
                if (parentItem) {
                    parentItem.classList.add('disabled');
                    const description = parentItem.querySelector('.setting-description');
                    if (description) {
                        description.textContent = reason;
                    }
                }
            }
        }
    }

    async function updateConsoleButton() {
        if (!toggleConsoleBtn || window.IS_ELECTRON) return;
        try {
            const response = await fetch('/misc/console-status');
            const data = await response.json();
            const isConsoleOpen = data.console_open;

            toggleConsoleBtn.textContent = isConsoleOpen ? 'Hide Console' : 'Show Console';
            toggleConsoleBtn.classList.toggle('active', isConsoleOpen);
        } catch (error) {
            console.error('Error updating console button:', error);
        }
    }

    toggleConsoleBtn?.addEventListener('click', async () => {
        if (window.IS_ELECTRON) return;
        try {
            const response = await fetch('/misc/toggle-console', { method: 'POST' });
            if (response.ok) {
                updateConsoleButton();
            } else {
                console.error('Failed to toggle console:', response.statusText);
            }
        } catch (error) {
            console.error('Error toggling console:', error);
        }
    });

    restartAdaptersBtn?.addEventListener('click', async () => {
        restartAdaptersBtn.disabled = true;
        try {
            const response = await fetch('/adapters/restart', { method: 'POST' });
            if (response.ok) {
                const result = await response.json();
                console.log('Adapters restarted:', result);
                alert('Adapters restarted successfully.');
            } else {
                console.error('Failed to restart adapters:', response.statusText);
                alert('Failed to restart adapters. Please try again later.');
            }
        } catch (error) {
            console.error('Error restarting adapters:', error);
            alert('Error restarting adapters. Please try again later.');
        } finally {
            restartAdaptersBtn.disabled = false;
        }
    });

    resetSettingsBtn?.addEventListener('click', async () => {
        const confirmReset = confirm('Are you sure you want to reset all settings to default?');
        if (!confirmReset) return;

        resetSettingsBtn.disabled = true;
        try {
            const response = await fetch('/settings/reset', { method: 'POST' });
            if (response.ok) {
                const result = await response.json();
                console.log('Settings reset:', result);
                alert('Settings reset to default successfully. Please restart the app for changes to take effect.');
            } else {
                console.error('Failed to reset settings:', response.statusText);
                alert('Failed to reset settings. Please try again later.');
            }
        } catch (error) {
            console.error('Error resetting settings:', error);
            alert('Error resetting settings. Please try again later.');
        } finally {
            resetSettingsBtn.disabled = false;
        }
    });

    closeFab?.addEventListener('click', () => {
        window.close();
    });

    // Initial console button text update
    updateConsoleButton();
});