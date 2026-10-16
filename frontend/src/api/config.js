/**
 * API Configuration & Dynamic URL Resolver
 *
 * Automatically detects whether the application is running in:
 * 1. Local / On-Premise Mode (Docker / Nginx reverse proxy on localhost or private LAN):
 *    - Uses relative '/api' so all requests stay unified on the local port (e.g. :8080).
 * 2. Cloud Mode (Vercel frontend + Render backend):
 *    - Defaults to 'https://land-management-api.onrender.com/api'.
 * 3. Explicit Override:
 *    - Honors VITE_API_URL if provided in environment variables.
 */

export const CLOUD_BACKEND_URL = 'https://land-management-api.onrender.com'

/**
 * Checks if the current browser environment is running locally or on a private LAN.
 */
export function isLocalEnvironment() {
  if (typeof window === 'undefined') return true
  const hostname = window.location.hostname
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  )
}

/**
 * Returns the base API URL (ending in /api) for Axios requests.
 */
export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const clean = envUrl.trim().replace(/\/+$/, '')
    return clean.endsWith('/api') ? clean : `${clean}/api`
  }

  // Local on-premise Docker / LAN -> use relative /api
  if (isLocalEnvironment()) {
    return '/api'
  }

  // Cloud deployment (Vercel / public web) -> direct to Render backend
  return `${CLOUD_BACKEND_URL}/api`
}

/**
 * Returns the root health check URL for ServerWarmupOverlay.
 */
export function getApiRootUrl() {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/api\/?$/, '').replace(/\/+$/, '') + '/'
  }

  if (isLocalEnvironment()) {
    return '/api'
  }

  return `${CLOUD_BACKEND_URL}/`
}

/**
 * Resolves a relative or absolute URL (e.g. for streaming file downloads).
 */
export function resolveBackendUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) {
    return url
  }
  const cleanPath = url.startsWith('/') ? url : `/${url}`

  if (isLocalEnvironment()) {
    return cleanPath
  }

  return `${CLOUD_BACKEND_URL}${cleanPath}`
}
