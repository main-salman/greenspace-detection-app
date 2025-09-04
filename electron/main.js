const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { ensurePythonEnvironment } = require('./python-installer');

// Keep a global reference of the window object
let mainWindow;
let nextServer;
let serverPort = 3000;

// Check if port is available
function checkPort(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, () => {
      server.close();
      resolve(true);
    });
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Find available port starting from 3000
async function findAvailablePort() {
  let port = 3000;
  while (port < 3100) {
    if (await checkPort(port)) {
      return port;
    }
    port++;
  }
  throw new Error('No available port found');
}

// Start Next.js server
async function startNextServer() {
  return new Promise(async (resolve, reject) => {
    try {
      serverPort = await findAvailablePort();
      console.log(`Starting Next.js server on port ${serverPort}`);
      
      const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
      const nextDir = isDev ? process.cwd() : path.join(process.resourcesPath, 'app');
      
      console.log('Environment check:', { isDev, isPackaged: app.isPackaged, NODE_ENV: process.env.NODE_ENV });
      
      // In production, we need to serve the built Next.js app
      if (!isDev && fs.existsSync(path.join(nextDir, '.next'))) {
        // Start Next.js production server
        const { createServer } = require('http');
        const { parse } = require('url');
        const next = require('next');
        
        const nextApp = next({ 
          dev: false, 
          dir: nextDir
        });
        
        await nextApp.prepare();
        const handle = nextApp.getRequestHandler();
        
        const server = createServer((req, res) => {
          const parsedUrl = parse(req.url, true);
          handle(req, res, parsedUrl);
        });
        
        server.listen(serverPort, (err) => {
          if (err) {
            console.error('Error starting Next.js server:', err);
            reject(err);
          } else {
            console.log(`Next.js server running on port ${serverPort}`);
            nextServer = server;
            resolve();
          }
        });
      } else {
        // Development mode - start Next.js dev server
        const nextProcess = spawn('npm', ['run', 'dev'], {
          cwd: process.cwd(),
          stdio: 'pipe',
          env: { ...process.env, PORT: serverPort.toString() }
        });
        
        nextProcess.stdout.on('data', (data) => {
          console.log('Next.js:', data.toString());
          if (data.toString().includes('Ready')) {
            resolve();
          }
        });
        
        nextProcess.stderr.on('data', (data) => {
          console.error('Next.js Error:', data.toString());
        });
        
        nextProcess.on('error', (err) => {
          console.error('Failed to start Next.js server:', err);
          reject(err);
        });
        
        nextServer = nextProcess;
      }
    } catch (error) {
      console.error('Error in startNextServer:', error);
      reject(error);
    }
  });
}

// Get Python executable path (using bundled Python environment)
function getPythonExecutablePath(scriptName) {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    // Development mode - use local venv with Python scripts
    const platform = process.platform;
    if (platform === 'win32') {
      return {
        executable: path.join(process.cwd(), 'venv', 'Scripts', 'python.exe'),
        isStandalone: false
      };
    } else {
      return {
        executable: path.join(process.cwd(), 'venv', 'bin', 'python'),
        isStandalone: false
      };
    }
  } else {
    // Production mode - use bundled Python environment
    const platform = process.platform;
    
    if (platform === 'win32') {
      return {
        executable: path.join(process.resourcesPath, 'python_env', 'Scripts', 'python.exe'),
        isStandalone: false
      };
    } else {
      return {
        executable: path.join(process.resourcesPath, 'python_env', 'bin', 'python'),
        isStandalone: false
      };
    }
  }
}

// Get Python scripts path
function getPythonScriptsPath() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    return path.join(process.cwd(), 'python_scripts');
  } else {
    return path.join(process.resourcesPath, 'python_scripts');
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icons', 'icon.png'),
    titleBarStyle: 'default',
    show: false // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus on window
    if (process.platform === 'darwin') {
      app.focus();
    }
  });

  // Load the Next.js app
  const startURL = `http://localhost:${serverPort}`;
  mainWindow.loadURL(startURL);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(async () => {
  try {
    console.log('Starting Greenspace Detection App...');
    
    // Check Python environment on first run
    const pythonCheck = await ensurePythonEnvironment();
    if (!pythonCheck.success) {
      console.error('Python environment setup failed:', pythonCheck.error);
      app.quit();
      return;
    }
    
    // Start Next.js server first
    await startNextServer();
    
    // Wait a moment for server to be fully ready
    setTimeout(() => {
      createWindow();
    }, 2000);
    
  } catch (error) {
    console.error('Failed to start application:', error);
    dialog.showErrorBox('Startup Error', `Failed to start the application: ${error.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Clean up Next.js server
  if (nextServer) {
    if (typeof nextServer.kill === 'function') {
      nextServer.kill();
    } else if (typeof nextServer.close === 'function') {
      nextServer.close();
    }
  }
  
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle Python execution requests from renderer
ipcMain.handle('execute-python', async (event, scriptName, configPath) => {
  return new Promise((resolve, reject) => {
    const pythonInfo = getPythonExecutablePath(scriptName);
    const scriptsPath = getPythonScriptsPath();
    
    let executablePath;
    let args;
    let workingDir;
    
    if (pythonInfo.isStandalone) {
      // Use standalone executable
      executablePath = pythonInfo.executable;
      args = [configPath];
      workingDir = path.dirname(pythonInfo.executable);
    } else {
      // Use Python interpreter with script
      executablePath = pythonInfo.executable;
      const scriptPath = path.join(scriptsPath, scriptName);
      args = [scriptPath, configPath];
      workingDir = scriptsPath;
    }
    
    console.log('Executing Python script:', {
      executable: executablePath,
      args: args,
      workingDir: workingDir,
      config: configPath,
      standalone: pythonInfo.isStandalone
    });
    
    // Verify executable exists
    if (!fs.existsSync(executablePath)) {
      reject(new Error(`Python executable not found: ${executablePath}`));
      return;
    }
    
    // For non-standalone, verify script exists
    if (!pythonInfo.isStandalone) {
      const scriptPath = path.join(scriptsPath, scriptName);
      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Python script not found: ${scriptPath}`));
        return;
      }
    }
    
    const pythonProcess = spawn(executablePath, args, {
      cwd: workingDir,
      stdio: 'pipe',
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('Python stdout:', data.toString());
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('Python stderr:', data.toString());
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`Python script failed with code ${code}: ${stderr}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
});

// Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== `http://localhost:${serverPort}`) {
      navigationEvent.preventDefault();
    }
  });
});
