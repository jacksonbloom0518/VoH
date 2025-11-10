import axios from 'axios'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5001/api' : '/api'

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

  scrapeLocalGrants: async ({ limit = 2, location } = {}) => {
    const response = await api.post('/scrape-local-grants', { limit, location })
    return response.data
  },

  scrapeOVWGrants: async ({ limit = 20, location } = {}) => {
    const response = await api.post('/scrape-ovw', { limit, location })
    return response.data
  },

  scrapeACFGrants: async ({ limit = 20, location } = {}) => {
    const response = await api.post('/scrape-acf', { limit, location })
    return response.data
  },

  fetchGrantsForecasts: async (params = {}) => {
    const response = await api.post('/fetch-grants-forecasts', params)
    return response.data
  },

  fetchHUDGrants: async (params = {}) => {
    const response = await api.post('/fetch-hud-grants', params)
    return response.data
  },

  fetchSAMHSAGrants: async (params = {}) => {
    const response = await api.post('/fetch-samhsa-grants', params)
    return response.data
  },

  scrapeFloridaDCF: async ({ limit = 20, location } = {}) => {
    const response = await api.post('/scrape-florida-dcf', { limit, location })
    return response.data
  },

  scrapeJaxFoundation: async ({ limit = 10, location } = {}) => {
    const response = await api.post('/scrape-jax-foundation', { limit, location })
    return response.data
  },

  fetchUSASpending: async (params = {}) => {
    const response = await api.post('/fetch-usaspending', params)
    return response.data
  },

  fetchSAM: async (params = {}) => {
    const response = await api.post('/fetch-sam', params)
    return response.data
  },
  
  sendEmail: async ({ recipients = [], limit = 10 } = {}) => {
    const response = await api.post('/send-email', { recipients, limit })
    return response.data
  },
}

export default api

