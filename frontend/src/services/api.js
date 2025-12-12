/**
 * API Service - Handles all backend API calls
 */

import axios from 'axios';

const API_BASE_URL = '/api';

// Create axios instance with token support
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  register: (email, password, fullName) =>
    api.post('/auth/register', { email, password, fullName }),

  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  setToken: (token) => {
    localStorage.setItem('authToken', token);
  },

  getToken: () => localStorage.getItem('authToken'),

  logout: () => {
    localStorage.removeItem('authToken');
  }
};

// AI Features API
export const aiAPI = {
  explain: (topic, detailLevel = 'short', includeQuiz = true) =>
    api.post('/ai/explain', { topic, detailLevel, includeQuiz }),

  rewrite: (text, tone = 'formal') =>
    api.post('/ai/rewrite', { text, tone }),

  roadmap: (goal, timeframeWeeks = 8, level = 'intermediate') =>
    api.post('/ai/roadmap', { goal, timeframeWeeks, level }),

  getRequest: (requestId) =>
    api.get(`/ai/request/${requestId}`)
};

// Error handler
export function handleAPIError(error) {
  const message = error.response?.data?.error || error.message || 'An error occurred';
  return message;
}

export default api;
