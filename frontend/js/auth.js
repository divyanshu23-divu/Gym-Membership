/**
 * IronPulse Authentication & Session Manager
 */

const Auth = {
  getToken() {
    return localStorage.getItem('ironpulse_token');
  },

  getUser() {
    const raw = localStorage.getItem('ironpulse_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem('ironpulse_token', token);
    localStorage.setItem('ironpulse_user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('ironpulse_token');
    localStorage.removeItem('ironpulse_user');
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'admin';
  },

  isMember() {
    const user = this.getUser();
    return user && user.role === 'member';
  },

  async login(email, password) {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.success && res.token) {
      this.setSession(res.token, res.user);
    }
    return res;
  },

  async register(formData) {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    if (res.success && res.token) {
      this.setSession(res.token, res.user);
    }
    return res;
  },

  logout() {
    this.clearSession();
    showToast('Logged out successfully.', 'info');
    setTimeout(() => {
      window.location.href = '/';
    }, 500);
  },

  /**
   * Protects route based on role
   * @param {'admin'|'member'} requiredRole 
   */
  protectRoute(requiredRole) {
    const token = this.getToken();
    const user = this.getUser();

    if (!token || !user) {
      window.location.href = '/';
      return false;
    }

    if (requiredRole && user.role !== requiredRole) {
      if (user.role === 'admin') {
        window.location.href = '/admin-dashboard.html';
      } else {
        window.location.href = '/member-dashboard.html';
      }
      return false;
    }

    return true;
  },

  /**
   * Initialize dark / light mode from saved preference
   */
  initTheme() {
    const savedTheme = localStorage.getItem('ironpulse_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.innerHTML = savedTheme === 'dark' ? '☀️' : '🌙';
      btn.title = savedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    });
  },

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('ironpulse_theme', nextTheme);

    const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.innerHTML = nextTheme === 'dark' ? '☀️' : '🌙';
      btn.title = nextTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    });
  }
};

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
  Auth.initTheme();
});
