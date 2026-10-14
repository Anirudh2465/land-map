import client from './client'

export async function getDocumentUrl(docId, download = false) {
  const res = await client.get(`/documents/${docId}/url`, { params: { download } })
  return res.data // { url, doc_type, filename, expires_in_seconds }
}

export async function deleteDocument(docId) {
  await client.delete(`/documents/${docId}`)
}
