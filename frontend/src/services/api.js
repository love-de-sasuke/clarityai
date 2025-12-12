/**
 * API Service - Handles all backend API calls
 */

import axios from 'axios';

// Backend URL configuration
// Set VITE_API_BASE_URL environment variable:
// - For local development: http://localhost:5000 (or your local backend port)
// - For production: https://your-backend-url.com (your actual backend URL)
// Backend routes are prefixed with /api, so we append /api to the base URL
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL;

if (!BACKEND_URL) {
  console.warn('VITE_API_BASE_URL is not set. Please configure it in your environment variables.');
}

// Construct API base URL - if BACKEND_URL is set, use it; otherwise default to relative /api for same-origin
const API_BASE_URL = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

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

// Handle response errors (especially 401 - unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired
      localStorage.removeItem('authToken');
      // Redirect to login if not already there
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

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
