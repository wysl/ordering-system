import axios from 'axios'

const api = axios.create({
  baseURL: '',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

export function setAdminToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`
  else delete api.defaults.headers.common.Authorization
}

export const getHomeState = () => api.get('/api/home-state')
export const submitOrder = (data) => api.post('/api/order', data)
export const getPersonnel = () => api.get('/api/personnel')
export const getMyOrder = (person) => api.get(`/api/order/mine?person=${encodeURIComponent(person)}`)

export const adminLogin = (password) => api.post('/api/admin/login', { password })
export const importMenu = (file, deadlineAt = '') => {
  const formData = new FormData()
  formData.append('file', file)
  if (deadlineAt) formData.append('deadline_at', deadlineAt)
  return api.post('/api/admin/menu/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const importPersonnel = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/api/admin/personnel/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const adminGetMenu = () => api.get('/api/admin/menu')
export const deleteMenuItem = (id) => api.delete(`/api/admin/menu/${id}`)
export const adminGetOrders = () => api.get('/api/admin/orders')
export const getParticipationStatus = () => api.get('/api/admin/participation-status')
export const endActiveRound = () => api.post('/api/admin/rounds/end')
export const getRounds = () => api.get('/api/admin/rounds')
export const getRoundDetail = (id) => api.get(`/api/admin/rounds/${id}/detail`)
export const exportRound = (id) => api.get(`/api/admin/rounds/${id}/export`, { responseType: 'blob' })
export const exportOrders = () => api.get('/api/admin/export', { responseType: 'blob' })
export const downloadTemplate = (type) => api.get(`/api/admin/template/${type}`, { responseType: 'blob' })

export const createVoteSession = (data) => api.post('/api/admin/vote', data)
export const deleteVoteSession = (id) => api.delete(`/api/admin/vote/${id}`)
export const getVoteSessions = () => api.get('/api/admin/votes')
export const lookupCurrentPerson = (person) => api.get(`/api/admin/lookup/person?person=${encodeURIComponent(person)}`)
export const castVote = (data) => api.post('/api/vote', data)

export default api
