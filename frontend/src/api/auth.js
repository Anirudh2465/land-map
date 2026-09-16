import client from './client'

export async function login(email, password) {
  const params = new URLSearchParams()
  params.append('username', email)
  params.append('password', password)
  const res = await client.post('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return res.data // { access_token, token_type }
}

export async function getMe() {
  const res = await client.get('/auth/me')
  return res.data
}
