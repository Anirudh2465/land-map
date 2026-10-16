import client from './client'
import { resolveBackendUrl } from './config'

export async function getDocumentUrl(docId, download = false) {
  const res = await client.get(`/documents/${docId}/url`, { params: { download } })
  if (res.data?.url) {
    res.data.url = resolveBackendUrl(res.data.url)
  }
  return res.data // { url, doc_type, filename, expires_in_seconds }
}

export async function deleteDocument(docId) {
  await client.delete(`/documents/${docId}`)
}
