import axios from 'axios'
import { getApiBaseUrl } from './config'

const client = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request and ensure dynamic baseURL
client.interceptors.request.use((config) => {
  if (!config.baseURL) {
    config.baseURL = getApiBaseUrl()
  }
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
