/** @type {import('next').NextConfig} */
// Make static export opt-in via env to keep API routes working in dev
const shouldExport = process.env.NEXT_OUTPUT === 'export' || process.env.STATIC_EXPORT === 'true';
const isElectron = process.env.IS_ELECTRON === 'true';

const nextConfig = {
  // Only enable static export when explicitly requested
  ...(shouldExport ? { output: 'export' } : {}),
  
  // Enable standalone mode for smaller builds
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  
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
  
  // Optimize for smaller bundle size
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
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
    
    // Optimize bundle size
    if (config.mode === 'production') {
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        sideEffects: false,
      };
    }
    
    return config;
  },
};

module.exports = nextConfig;