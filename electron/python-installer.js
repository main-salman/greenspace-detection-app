const { dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if Python and dependencies are available
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    // Check if python3 is available
    const pythonProcess = spawn('python3', ['--version'], { stdio: 'pipe' });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // Python is available, check if dependencies are installed
        checkPythonDependencies().then(resolve);
      } else {
        resolve({ available: false, reason: 'Python 3 not installed' });
      }
    });
    
    pythonProcess.on('error', () => {
      resolve({ available: false, reason: 'Python 3 not found' });
    });
  });
}

// Check if required Python packages are installed
async function checkPythonDependencies() {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python3', ['-c', 'import rasterio, numpy, shapely, cv2; print("OK")'], { stdio: 'pipe' });
    
    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0 && output.includes('OK')) {
        resolve({ available: true });
      } else {
        resolve({ available: false, reason: 'Python dependencies not installed' });
      }
    });
    
    pythonProcess.on('error', () => {
      resolve({ available: false, reason: 'Failed to check Python dependencies' });
    });
  });
}

// Install Python dependencies
async function installPythonDependencies() {
  return new Promise((resolve, reject) => {
    const requirementsPath = path.join(__dirname, '..', 'python_scripts', 'requirements.txt');
    
    if (!fs.existsSync(requirementsPath)) {
      reject(new Error('Requirements file not found'));
      return;
    }
    
    console.log('Installing Python dependencies...');
    const pipProcess = spawn('pip3', ['install', '-r', requirementsPath], { 
      stdio: 'pipe'
    });
    
    let output = '';
    let error = '';
    
    pipProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log('pip:', data.toString());
    });
    
    pipProcess.stderr.on('data', (data) => {
      error += data.toString();
      console.error('pip error:', data.toString());
    });
    
    pipProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Python dependencies installed successfully');
        resolve({ success: true });
      } else {
        reject(new Error(`Failed to install dependencies: ${error}`));
      }
    });
    
    pipProcess.on('error', (err) => {
      reject(new Error(`Failed to start pip: ${err.message}`));
    });
  });
}

// Show setup dialog to user
async function showSetupDialog() {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'First Time Setup',
    message: 'Greenspace Detection Setup Required',
    detail: 'This app requires Python 3 and some dependencies to process satellite imagery. Would you like to install them now?\n\nThis is a one-time setup that may take a few minutes.',
    buttons: ['Install Dependencies', 'Cancel', 'I already have Python setup'],
    defaultId: 0,
    cancelId: 1
  });
  
  return result.response;
}

// Main setup function
async function ensurePythonEnvironment() {
  try {
    console.log('Checking Python environment...');
    const check = await checkPythonEnvironment();
    
    if (check.available) {
      console.log('Python environment is ready');
      return { success: true };
    }
    
    console.log('Python environment not ready:', check.reason);
    
    // Show setup dialog
    const userChoice = await showSetupDialog();
    
    if (userChoice === 0) {
      // Install dependencies
      try {
        await installPythonDependencies();
        return { success: true };
      } catch (error) {
        console.error('Failed to install dependencies:', error);
        await dialog.showErrorBox('Setup Failed', `Failed to install Python dependencies: ${error.message}\n\nPlease install Python 3 and run: pip3 install -r python_scripts/requirements.txt`);
        return { success: false, error: error.message };
      }
    } else if (userChoice === 2) {
      // User claims to have Python setup - let them proceed
      return { success: true };
    } else {
      // User cancelled
      return { success: false, error: 'Setup cancelled by user' };
    }
    
  } catch (error) {
    console.error('Error in Python environment check:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  checkPythonEnvironment,
  installPythonDependencies,
  ensurePythonEnvironment
};
