/** @type {import('next').NextConfig} */
// Make static export opt-in via env to keep API routes working in dev
const shouldExport = process.env.NEXT_OUTPUT === 'export' || process.env.STATIC_EXPORT === 'true';
const isElectron = process.env.IS_ELECTRON === 'true';

const nextConfig = {
  // Only enable static export when explicitly requested
  ...(shouldExport ? { output: 'export' } : {}),
  
  // Electron-specific configuration
  ...(isElectron ? {
    assetPrefix: './',
    trailingSlash: true,
    images: {
      unoptimized: true
    }
  } : {}),
  
  // Ensure API routes work in standalone mode
  experimental: {
    outputFileTracingRoot: process.cwd(),
  },
  
  // Disable TypeScript checking during build for testing
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Configure for Electron packaging
  webpack: (config, { isServer }) => {
    if (isElectron && !isServer) {
      config.target = 'electron-renderer';
    }
    
    // Handle node modules for Electron
    if (isElectron) {
      config.externals = config.externals || {};
      config.externals['electron'] = 'commonjs electron';
    }
    
    return config;
  },
};

module.exports = nextConfig;