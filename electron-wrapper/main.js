// Use CommonJS require syntax to match "type": "commonjs" in package.json
const { app, BrowserWindow, Menu } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
let pyProc = null;
let mainWindow = null;
let serverPort = null;

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
    
    pyProc.unref();
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
    const match = output.match(/Starting server on localhost:(\d+)/);
    if (match && match[1]) {
      if (!serverPort) { 
        serverPort = match[1];
        console.log(`Detected Python server on port: ${serverPort}`);
        if (mainWindow) {
          mainWindow.loadURL(`http://localhost:${serverPort}`);
        }
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
  
  // devtools in dev mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

app.on('ready', createWindow);

app.on('will-quit', (event) => {
  if (pyProc !== null && serverPort) { 
    event.preventDefault(); 

    fetch(`http://localhost:${serverPort}/exit`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    .catch(() => console.log('Could not send graceful exit request to server. Forcing shutdown.'))
    .finally(() => {
      // Force kill the process after a short delay to ensure cleanup
      setTimeout(() => {
        if (os.platform() === 'win32') {
          exec(`taskkill /F /IM server.exe /T`, (err) => {
            if (err) {
              console.error('Failed to kill server.exe process:', err.message);
            } else {
              console.log('Server process killed.');
            }
            pyProc = null;
            app.quit(); 
          });
        }
      }, 500);
    });
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});