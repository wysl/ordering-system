import axios from 'axios'

const api = axios.create({
  baseURL: typeof window !== 'undefined' ? `http://${window.location.hostname}:8088` : 'http://127.0.0.1:8088',
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
export const getParticipationStatus = (mode = '') => api.get(`/api/admin/participation-status${mode ? `?mode=${mode}` : ''}`)
export const endActiveRound = (mode = '') => api.post(`/api/admin/rounds/end${mode ? `?mode=${mode}` : ''}`)
export const getRounds = (params = {}) => api.get('/api/admin/rounds', { params })
export const getRoundDetail = (id) => api.get(`/api/admin/rounds/${id}/detail`)
export const previewDeleteRound = (id) => api.delete(`/api/admin/rounds/${id}?preview=1`)
export const deleteRound = (id) => api.delete(`/api/admin/rounds/${id}`)
export const exportRound = (id) => api.get(`/api/admin/rounds/${id}/export`, { responseType: 'blob' })
export const exportOrders = (mode = 'order') => api.get(`/api/admin/export?mode=${mode}`, { responseType: 'blob' })
export const downloadTemplate = (type) => api.get(`/api/admin/template/${type}`, { responseType: 'blob' })

export const createVoteSession = (data) => api.post('/api/admin/vote', data)
export const deleteVoteSession = (id) => api.delete(`/api/admin/vote/${id}`)
export const getVoteSessions = () => api.get('/api/admin/votes')
export const lookupCurrentPerson = (person) => api.get(`/api/admin/lookup/person?person=${encodeURIComponent(person)}`)
export const bulkExcuse = (names, action, mode) => api.post('/api/admin/persons/bulk-excuse', { names, action, mode })
export const listExcused = (mode = '') => api.get(`/api/admin/persons/excused${mode ? `?mode=${mode}` : ''}`)
export const castVote = (data) => api.post('/api/vote', data)

export const getStats = () => api.get('/api/admin/stats')
export const getStatsMonthShops = (month) => api.get(`/api/admin/stats/${month}/shops`)
export const getStatsMonthDishes = (month) => api.get(`/api/admin/stats/${month}/dishes`)
export const backupDB = () => api.get('/api/admin/backup', { responseType: 'blob' })
export const restoreDB = (file, confirm = false) => {
	const formData = new FormData()
	formData.append('file', file)
	return api.post('/api/admin/restore', formData, {
		headers: { 'Content-Type': 'multipart/form-data', 'X-Restore-Confirm': String(confirm) },
	})
}
export const getActivityLogs = (params = {}) => api.get('/api/admin/logs', { params })
export const getTrashRounds = () => api.get('/api/admin/rounds/trash')
export const restoreRound = (id) => api.post(`/api/admin/rounds/${id}/restore`)
export const purgeRound = (id) => api.delete(`/api/admin/rounds/${id}/purge`)
export const emptyTrash = () => api.post('/api/admin/rounds/trash/empty')
export const exportRoundsBatch = (ids) => api.get(`/api/admin/rounds/export/batch.xlsx?ids=${encodeURIComponent(ids.join(','))}`, { responseType: 'blob' })

export default api
