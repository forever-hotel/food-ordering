import type { NextConfig } from 'next';

// Phase 6 & CIT Multi-Tier Deployment Safeguard:
// 1. Production and Staging builds CANNOT be compiled with demo mode enabled.
// 2. Demonstration preview builds require explicit NEXT_PUBLIC_ALLOW_DEMO_PREVIEW=true opt-in.
const deploymentEnv = (
  process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ||
  process.env.DEPLOYMENT_ENV ||
  (process.env.NODE_ENV === 'production' ? 'production' : 'development')
).toLowerCase();

const isProdOrStaging =
  deploymentEnv === 'production' ||
  deploymentEnv === 'prod' ||
  deploymentEnv === 'staging' ||
  deploymentEnv === 'stage' ||
  (process.env.NODE_ENV === 'production' &&
    deploymentEnv !== 'preview' &&
    deploymentEnv !== 'demo-preview');

if (isProdOrStaging && process.env.NEXT_PUBLIC_DATA_MODE === 'demo') {
  throw new Error(
    `SECURITY VIOLATION: ${deploymentEnv.toUpperCase()} build cannot be compiled with NEXT_PUBLIC_DATA_MODE=demo. Set NEXT_PUBLIC_DATA_MODE=api.`,
  );
}

if (isProdOrStaging && process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION === 'true') {
  throw new Error(
    `SECURITY VIOLATION: ${deploymentEnv.toUpperCase()} build cannot be compiled with NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION=true.`,
  );
}

if (
  (deploymentEnv === 'preview' || deploymentEnv === 'demo-preview') &&
  process.env.NEXT_PUBLIC_DATA_MODE === 'demo' &&
  process.env.NEXT_PUBLIC_ALLOW_DEMO_PREVIEW !== 'true'
) {
  throw new Error(
    'SECURITY VIOLATION: Preview demo build requires explicit NEXT_PUBLIC_ALLOW_DEMO_PREVIEW=true configuration.',
  );
}

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
