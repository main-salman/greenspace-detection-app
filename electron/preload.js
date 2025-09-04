const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  executePython: (scriptName, configPath) => 
    ipcRenderer.invoke('execute-python', scriptName, configPath),
    
  platform: process.platform,
  
  // Add other APIs as needed
  openExternal: (url) => {
    require('electron').shell.openExternal(url);
  }
});
