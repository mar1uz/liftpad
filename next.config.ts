import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['@raydium-io/raydium-sdk-v2', '@solana/web3.js', '@solana/spl-token'],
  transpilePackages: ['@reown/appkit', '@reown/appkit-adapter-solana', '@reown/appkit-common', '@reown/appkit-controllers', '@reown/appkit-scaffold-ui', '@reown/appkit-ui', '@reown/appkit-utils', '@reown/appkit-wallet'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
    ] }];
  }
};
export default config;
