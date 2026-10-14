import client from './client'

export async function getDocumentUrl(docId) {
  const res = await client.get(`/documents/${docId}/url`)
  return res.data // { url, doc_type, expires_in_seconds }
}

export async function deleteDocument(docId) {
  await client.delete(`/documents/${docId}`)
}
