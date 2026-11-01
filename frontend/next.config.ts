import type { NextConfig } from 'next';

// Phase 6 Production Safeguard:
// A production build cannot be deployed with demo mode enabled.
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DATA_MODE === 'demo') {
  throw new Error(
    'SECURITY VIOLATION: Production build cannot be compiled with NEXT_PUBLIC_DATA_MODE=demo. Set NEXT_PUBLIC_DATA_MODE=api.',
  );
}

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
