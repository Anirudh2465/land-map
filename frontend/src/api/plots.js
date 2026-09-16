import client from './client'

export async function getPlots(districtId) {
  const res = await client.get('/plots', { params: { district_id: districtId } })
  return res.data
}

export async function getPlot(plotId) {
  const res = await client.get(`/plots/${plotId}`)
  return res.data
}

export async function createPlot(formData) {
  // formData must be a FormData object (multipart)
  const res = await client.post('/plots', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function deletePlot(plotId) {
  await client.delete(`/plots/${plotId}`)
}
