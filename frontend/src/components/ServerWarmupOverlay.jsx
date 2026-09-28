import { useState, useEffect, useRef, useCallback } from 'react'

const HEALTH_CHECK_TIMEOUT_MS = 12000 // 12s per ping attempt
const RETRY_INTERVAL_MS = 15000 // retry every 15s
const MAX_WAIT_TIME_MS = 120000 // 2 minutes (120 seconds)

export default function ServerWarmupOverlay({ children }) {
  const [isReady, setIsReady] = useState(() => {
    try {
      return sessionStorage.getItem('lpms_backend_ready') === 'true'
    } catch {
      return false
    }
  })
  const [status, setStatus] = useState('checking') // 'checking' | 'waiting' | 'failed'
  const [countdown, setCountdown] = useState(0)
  const startTimeRef = useRef(0)
  const timerRef = useRef(null)
  const countdownIntervalRef = useRef(null)

  const checkHealth = useCallback(async () => {
    const rawApi = import.meta.env.VITE_API_URL || ''
    // If VITE_API_URL is configured (e.g. "https://land-management-api.onrender.com/api" or "https://land-management-api.onrender.com"):
    // Root URL is "https://land-management-api.onrender.com/"
    const healthUrl = rawApi
      ? rawApi.replace(/\/api\/?$/, '').replace(/\/+$/, '') + '/'
      : '/api'

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)

    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data?.message === 'LPMS API Gateway is running' || res.status === 200) {
          try {
            sessionStorage.setItem('lpms_backend_ready', 'true')
          } catch {}
          setIsReady(true)
          return true
        }
      }
    } catch {
      clearTimeout(timeoutId)
    }

    return false
  }, [])

  const startPolling = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)

    const poll = async () => {
      const elapsed = Date.now() - startTimeRef.current
      if (elapsed >= MAX_WAIT_TIME_MS) {
        setStatus('failed')
        return
      }

      const ok = await checkHealth()
      if (ok) return

      // Not reachable yet, backend is warming up
      setStatus('waiting')

      const remainingTime = MAX_WAIT_TIME_MS - (Date.now() - startTimeRef.current)
      if (remainingTime <= 0) {
        setStatus('failed')
        return
      }

      const nextDelay = Math.min(RETRY_INTERVAL_MS, remainingTime)
      setCountdown(Math.ceil(nextDelay / 1000))

      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      timerRef.current = setTimeout(() => {
        poll()
      }, nextDelay)
    }

    poll()
  }, [checkHealth])

  useEffect(() => {
    if (isReady) return

    startTimeRef.current = Date.now()
    startPolling()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }
  }, [isReady, startPolling])

  const handleManualRetry = () => {
    startTimeRef.current = Date.now()
    setStatus('checking')
    startPolling()
  }

  if (isReady) {
    return children
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ marginBottom: '1.25rem' }}>
          <img
            src="/logo.png"
            alt="LPMS Logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
            style={{ height: '54px', width: 'auto', margin: '0 auto', display: 'block' }}
          />
        </div>

        {status === 'failed' ? (
          <div>
            <div style={{ fontSize: '32px', marginBottom: '0.75rem' }}>⚠️</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
              Connection Timeout
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Could not connect to backend server. Please contact developers.
            </p>
            <button onClick={handleManualRetry} style={retryButtonStyle}>
              Retry Connection
            </button>
          </div>
        ) : (
          <div>
            <div className="spinner" style={spinnerStyle} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', marginTop: '1.25rem', marginBottom: '0.4rem' }}>
              {status === 'checking' ? 'Connecting to server...' : 'Starting backend server...'}
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5, maxWidth: '320px', margin: '0 auto' }}>
              {status === 'checking'
                ? 'Verifying service availability...'
                : 'Waiting for the backend to start. This may take a minute.'}
            </p>
            {status === 'waiting' && countdown > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.85rem' }}>
                Next check in {countdown}s
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 999999,
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

const cardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  padding: '2rem 2.25rem',
  maxWidth: '400px',
  width: '100%',
  textAlign: 'center',
  border: '1px solid rgba(226, 232, 240, 0.8)',
}

const spinnerStyle = {
  width: '36px',
  height: '36px',
  margin: '0 auto',
}

const retryButtonStyle = {
  padding: '0.625rem 1.25rem',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
}
