import client from './client'

export async function triggerOcr(docId) {
  const { data } = await client.post(`/ai/ocr/${docId}`)
  return data
}

export async function translateDocument(docId, targetLang = 'en') {
  const { data } = await client.post(`/ai/translate/${docId}?to=${targetLang}`)
  return data
}

export async function getAiSummary(plotId, forceRefresh = false) {
  const { data } = await client.get(`/ai/summary/${plotId}`, {
    params: { force_refresh: forceRefresh }
  })
  return data
}
