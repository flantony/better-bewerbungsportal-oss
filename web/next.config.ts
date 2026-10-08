import type { NextConfig } from 'next';
import { sicherheitsKonfiguration } from './src/config/sicherheits-header';

const nextConfig: NextConfig = {
  devIndicators: false,
  ...sicherheitsKonfiguration,
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  transpilePackages: ['geist'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  }
};

export default nextConfig;
