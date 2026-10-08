/**
 * IronPulse API Client
 * Centralized asynchronous HTTP requests with JWT injection and Toast notifications.
 */

const API_BASE = '/api';

/**
 * Show animated toast alert
 * @param {string} message 
 * @param {'success'|'error'|'warning'|'info'} type 
 */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <span style="font-weight: 800; font-size: 1.1rem;">${iconMap[type] || 'ℹ'}</span>
    <span style="flex: 1;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Universal API Fetch Wrapper
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('ironpulse_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Check for authentication expiration
    if (response.status === 401) {
      localStorage.removeItem('ironpulse_token');
      localStorage.removeItem('ironpulse_user');
      if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
        showToast('Session expired. Please log in again.', 'warning');
        setTimeout(() => {
          window.location.href = '/';
        }, 1200);
        return { success: false, message: 'Unauthorized' };
      }
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status} Error`);
    }

    return data;
  } catch (error) {
    console.error(`API Error on [${endpoint}]:`, error);
    throw error;
  }
}
