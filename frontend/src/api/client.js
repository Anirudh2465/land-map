import axios from 'axios'

const rawBaseURL = import.meta.env.VITE_API_URL
const baseURL = rawBaseURL ? rawBaseURL.replace(/\/+$/, '') : '/api'

const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('lpms_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, clear token and redirect to login
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('lpms_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
