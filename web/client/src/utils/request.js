import axios from 'axios'
import { useAppStore } from '@/stores/appStore'

const service = axios.create({
  baseURL: '/api',
  timeout: 10000
})

service.interceptors.request.use(
  config => {
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

service.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    const appStore = useAppStore()
    const message = error.response?.data?.message || error.message || 'Error'
    if (error.config && error.config.skipErrorToast) {
        return Promise.reject(error)
    }

    appStore.addToast(message, 'error')
    return Promise.reject(error)
  }
)

export default service
