// Minimal fetch-based API client for the WorkHub backend.
const BASE = '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: {},
  }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      if (data.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  listSections: () => request('GET', '/sections'),
  createSection: (data) => request('POST', '/sections', data),
  updateSection: (id, data) => request('PATCH', `/sections/${id}`, data),
  deleteSection: (id) => request('DELETE', `/sections/${id}`),
  reorderSections: (ids) => request('PUT', '/sections/order', { ids }),

  listItems: (params = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    const q = qs.toString()
    return request('GET', `/items${q ? `?${q}` : ''}`)
  },
  createItem: (data) => request('POST', '/items', data),
  updateItem: (id, data) => request('PATCH', `/items/${id}`, data),
  deleteItem: (id) => request('DELETE', `/items/${id}`),
  recordCopy: (id) => request('POST', `/items/${id}/copy`),

  exportData: () => request('GET', '/export'),
  importData: (payload) => request('POST', '/import', payload),
}
