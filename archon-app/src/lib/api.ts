import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
    baseURL: API_BASE_URL,
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('archon_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const getStats = async () => {
    const { data } = await api.get('/dashboard/stats');
    return data;
};

export const createCheckoutSession = async (planId: string, orgId: string) => {
    const { data } = await api.post('/billing/checkout', { planId, orgId });
    return data.url;
};

export default api;
