import client from './client'

export async function getCountries() {
  const res = await client.get('/geo/countries')
  return res.data
}

export async function getChildren(nodeId) {
  const res = await client.get(`/geo/${nodeId}/children`)
  return res.data
}

export async function getNodeByName(level, name) {
  const res = await client.get(`/geo/by-name/${level}/${name}`)
  return res.data
}

export async function getNode(nodeId) {
  const res = await client.get(`/geo/${nodeId}`)
  return res.data
}

// ── Village CRUD (admin only) ──────────────────────────────────────────────────

export async function createVillage(talukId, name) {
  const res = await client.post('/geo/villages', { taluk_id: talukId, name })
  return res.data
}

export async function renameVillage(villageId, name) {
  const res = await client.put(`/geo/villages/${villageId}`, { name })
  return res.data
}

export async function deleteVillage(villageId) {
  await client.delete(`/geo/villages/${villageId}`)
}
