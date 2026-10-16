/**
 * API Configuration & Dynamic URL Resolver
 *
 * Automatically detects whether the application is running in:
 * 1. Local / On-Premise Mode (Docker / Nginx reverse proxy on localhost or private LAN):
 *    - Uses current origin with port (e.g. 'http://localhost:8080/api') so requests never lose the port number.
 * 2. Cloud Mode (Vercel frontend + Render backend):
 *    - Defaults to 'https://land-management-api.onrender.com/api'.
 * 3. Explicit Override:
 *    - Honors VITE_API_URL if provided in environment variables.
 */

export const CLOUD_BACKEND_URL = 'https://land-management-api.onrender.com'

/**
 * Returns the current window origin including protocol, host, and port (e.g. http://localhost:8080).
 */
export function getLocalOrigin() {
  if (typeof window === 'undefined') return ''
  return window.location.origin || `${window.location.protocol}//${window.location.host}`
}

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

  // Local on-premise Docker / LAN -> explicitly use current origin + port + /api
  if (isLocalEnvironment()) {
    const origin = getLocalOrigin()
    return origin ? `${origin}/api` : '/api'
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
    const origin = getLocalOrigin()
    return origin ? `${origin}/api` : '/api'
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
    const origin = getLocalOrigin()
    return origin ? `${origin}${cleanPath}` : cleanPath
  }

  return `${CLOUD_BACKEND_URL}${cleanPath}`
}
