// Use CommonJS require syntax to match "type": "commonjs" in package.json
const { app, BrowserWindow, Menu } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os'); // Add this line
// Removed unused fs require
let pyProc = null;
let mainWindow = null;

// Enable fluent scrollbars - must be done before app ready
app.commandLine.appendSwitch('enable-features', 'FluentScrollbar,FluentOverlayScrollbar');

// Custom scrollbar CSS to make it more visible
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
  // Determine if we're running in development or production mode
  let serverPath;
  let serverArgs = [];
  
  if (app.isPackaged) {
    // Production - use the bundled server.exe
    serverPath = path.join(process.resourcesPath, 'app', 'server.exe');
    console.log('Running in production mode, server path:', serverPath);
    
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
    
    // Don't wait for this process when app exits
    pyProc.unref();
  } else {
    // Dev mode remains unchanged
    serverPath = 'python';
    serverArgs = [path.join(__dirname, '..', 'server.py')];
    console.log('Running in development mode, server path:', path.join(__dirname, '..', 'server.py'));
    
    pyProc = spawn(serverPath, serverArgs, {
      windowsHide: true,
      stdio: 'pipe',
      env: { ...process.env, RUNNING_IN_ELECTRON: '1' } // Set environment variable for Electron detection
    });
  }
  
  // Log any output from the server
  pyProc.stdout.on('data', (data) => {
    console.log(`Python server: ${data.toString()}`);
    
    // Check for server ready message
    if (data.toString().includes('Server running at')) {
      if (mainWindow) {
        // Load the URL once the server is ready
        mainWindow.loadURL('http://localhost:8080');
      }
    }
  });
  
  pyProc.stderr.on('data', (data) => {
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
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#181818', // Dark background color to match your app
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !app.isPackaged // Only enable DevTools in development
    },
    icon: path.join(__dirname, '..', 'favicon.ico'),
    // Remove the menu bar
    autoHideMenuBar: true,
    frame: true
  });

  // Remove the application menu completely
  Menu.setApplicationMenu(null);

  // Show a loading screen while the server starts
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

  // Start Python server
  startPythonServer();
  
  // Fallback: If the server ready message isn't detected, load after a delay
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.loadURL('http://localhost:8080')
    }
  }, 3000);

  // Inject custom scrollbar CSS after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(scrollbarCSS)
      .then(() => console.log('Custom scrollbar CSS injected'))
      .catch(err => console.error('Failed to inject scrollbar CSS:', err));
  });

  mainWindow.on('closed', function() {
    mainWindow = null;
  });
  
  // Open DevTools on start in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

// Create app window when Electron is ready
app.on('ready', createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // Kill Python server on app exit
  if (pyProc !== null) {
    // Fix the Content-Type error by adding proper headers and body
    fetch('http://localhost:8080/exit', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}) // Empty JSON object
    })
      .catch(() => {
        console.log('Could not send exit request to server');
      })
      .finally(() => {
        // Force kill all server.exe processes after a short delay
        setTimeout(() => {
          exec('taskkill /F /IM server.exe', (err) => {
            if (err) {
              console.log('Could not kill all server.exe processes:', err.message);
            } else {
              console.log('All server.exe processes killed.');
            }
            if (pyProc !== null) {
              pyProc.kill();
              pyProc = null;
            }
            app.quit();
          });
        }, 500);
      });
  } else {
    // Still try to kill any stray server.exe
    exec('taskkill /F /IM server.exe', () => app.quit());
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});