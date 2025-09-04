/** @type {import('next').NextConfig} */
// Make static export opt-in via env to keep API routes working in dev
const shouldExport = process.env.NEXT_OUTPUT === 'export' || process.env.STATIC_EXPORT === 'true';

const nextConfig = {
  // Only enable static export when explicitly requested
  ...(shouldExport ? { output: 'export' } : {}),
};

module.exports = nextConfig;