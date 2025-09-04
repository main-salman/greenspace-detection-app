/**
 * Utility functions for Electron integration
 */

// Check if we're running in Electron environment
export function isElectron(): boolean {
  return typeof window !== 'undefined' && 
         typeof (window as any).electronAPI !== 'undefined';
}

// Check if we're in the main process (Node.js side)
export function isElectronMain(): boolean {
  return typeof process !== 'undefined' && 
         process.versions && 
         process.versions.electron !== undefined &&
         process.type === 'main';
}

// Check if we're in the renderer process
export function isElectronRenderer(): boolean {
  return typeof process !== 'undefined' && 
         process.versions && 
         process.versions.electron !== undefined &&
         process.type === 'renderer';
}

// Execute Python script via Electron IPC (client-side)
export async function executePythonScript(scriptName: string, configPath: string): Promise<any> {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }
  
  try {
    const result = await (window as any).electronAPI.executePython(scriptName, configPath);
    return result;
  } catch (error) {
    console.error('Failed to execute Python script via Electron:', error);
    throw error;
  }
}

// Get platform information
export function getPlatform(): string {
  if (isElectron()) {
    return (window as any).electronAPI.platform;
  }
  return typeof navigator !== 'undefined' ? navigator.platform : 'unknown';
}
