import client from './client'
import { resolveBackendUrl } from './config'

export async function getPlots(districtId) {
  const res = await client.get('/plots', { params: { district_id: districtId } })
  return res.data
}

export async function getPlot(id) {
  const { data } = await client.get(`/plots/${id}`)
  return data
}

export async function extractKml(file) {
  const fd = new FormData()
  fd.append('kml_file', file)
  const { data } = await client.post('/plots/extract-kml', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}

export async function createPlot(formData, onUploadProgress) {
  // formData must be a FormData object (multipart)
  const res = await client.post('/plots', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onUploadProgress
  })
  return res.data
}

export async function updatePlot(plotId, formData, onUploadProgress) {
  // formData must be a FormData object (multipart)
  const res = await client.put(`/plots/${plotId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onUploadProgress,
  })
  return res.data
}

export async function getPlotKmlUrl(plotId) {
  const { data } = await client.get(`/plots/${plotId}/kml-url`)
  if (data?.url) {
    data.url = resolveBackendUrl(data.url)
  }
  return data
}

export async function deletePlot(plotId) {
  await client.delete(`/plots/${plotId}`)
}
