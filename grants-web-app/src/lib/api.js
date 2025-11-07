import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

export const opportunitiesAPI = {
  search: async (params) => {
    const response = await api.get('/opportunities', { params })
    return response.data
  },
  
  getById: async (id) => {
    const response = await api.get(`/opportunities/${id}`)
    return response.data
  },
  
  getStats: async () => {
    const response = await api.get('/stats')
    return response.data
  },
  
  getFilters: async () => {
    const response = await api.get('/filters')
    return response.data
  },
  
  triggerSync: async () => {
    const response = await api.post('/sync')
    return response.data
  },

  fetchGrantsGov: async (params = {}) => {
    const response = await api.post('/fetch-grants-gov', params)
    return response.data
  },

  scrapeLocalGrants: async () => {
    const response = await api.post('/scrape-local-grants')
    return response.data
  },
}

export default api

