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
