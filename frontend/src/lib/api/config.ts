/**
 * Base API URL for FOSS client requests.
 *
 * Supported environments:
 * 1. Direct local backend development:
 *    NEXT_PUBLIC_API_URL=http://localhost:4300
 *
 * 2. Gateway integration (standard hotel deployment):
 *    NEXT_PUBLIC_API_URL=http://localhost:8080/foss
 *
 * Fallback defaults to local backend port 4300 matching backend/src/main.ts.
 */
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4300';

export default API_URL;
