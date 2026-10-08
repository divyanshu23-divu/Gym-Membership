/**
 * IronPulse Landing Page Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // If user is already logged in, show quick dashboard access
  const user = Auth.getUser();
  if (user) {
    const authActions = document.getElementById('nav-auth-actions');
    if (authActions) {
      authActions.innerHTML = `
        <a href="${user.role === 'admin' ? '/admin-dashboard.html' : '/member-dashboard.html'}" class="btn btn-primary">
          Go to ${user.role === 'admin' ? 'Admin Portal' : 'Member Dashboard'} →
        </a>
      `;
    }
  }

  // Load plans and trainers dynamically
  await loadPlans();
  await loadTrainers();
  setupEventListeners();
});

async function loadPlans() {
  const container = document.getElementById('pricing-grid');
  if (!container) return;

  try {
    const res = await apiRequest('/plans');
    if (res.success && res.data) {
      container.innerHTML = res.data.map(plan => `
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; position: relative;">
          ${plan.duration_days >= 365 ? '<div style="position: absolute; top: -12px; right: 20px; background: var(--accent-orange); color: #000; font-size: 0.75rem; font-weight: 800; padding: 2px 10px; border-radius: 99px;">BEST VALUE</div>' : ''}
          <div>
            <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">${plan.name}</div>
            <div style="font-size: 2.5rem; font-weight: 900; font-family: var(--font-heading); color: var(--accent-primary); line-height: 1;">$${plan.price}</div>
            <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 1.25rem;">for ${plan.duration_days} days</div>
            <p style="color: var(--text-muted); font-size: 0.92rem; margin-bottom: 1.5rem;">${plan.description || 'Full gym and cardio deck access.'}</p>
            <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.5rem; font-size: 0.88rem; color: var(--text-main);">
              <li>✓ Locker Room & Sauna Access</li>
              <li>✓ Personalized Workout Template</li>
              <li>✓ Attendance Streak Tracking</li>
              <li>✓ Body Recomposition Logging</li>
            </ul>
          </div>
          <button class="btn btn-secondary" onclick="openRegisterModal(${plan.id})" style="width: 100%;">Select ${plan.name}</button>
        </div>
      `).join('');

      // Also populate the register modal plan select dropdown
      const planSelect = document.getElementById('reg-plan');
      if (planSelect) {
        planSelect.innerHTML = res.data.map(p => `
          <option value="${p.id}">${p.name} ($${p.price} / ${p.duration_days} days)</option>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load plans:', err);
  }
}

async function loadTrainers() {
  const container = document.getElementById('trainers-grid');
  if (!container) return;

  try {
    const res = await apiRequest('/trainers');
    if (res.success && res.data) {
      container.innerHTML = res.data.map(t => `
        <div class="card" style="text-align: center;">
          <img src="${t.avatar_url}" alt="${t.name}" style="width: 110px; height: 110px; border-radius: 50%; object-fit: cover; margin: 0 auto 1rem; border: 3px solid var(--accent-primary); box-shadow: 0 0 16px var(--accent-primary-glow);">
          <h3 style="font-size: 1.2rem; margin-bottom: 0.25rem;">${t.name}</h3>
          <div style="color: var(--accent-cyan); font-size: 0.85rem; font-weight: 700; margin-bottom: 0.75rem;">${t.specialization}</div>
          <p style="color: var(--text-muted); font-size: 0.88rem; line-height: 1.4;">${t.bio}</p>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load trainers:', err);
  }
}

function setupEventListeners() {
  // Login Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const btn = loginForm.querySelector('button[type="submit"]');

      try {
        btn.disabled = true;
        btn.innerText = 'Authenticating...';
        const res = await Auth.login(email, password);
        if (res.success) {
          showToast(`Welcome back, ${res.user.name}!`, 'success');
          setTimeout(() => {
            if (res.user.role === 'admin') {
              window.location.href = '/admin-dashboard.html';
            } else {
              window.location.href = '/member-dashboard.html';
            }
          }, 800);
        }
      } catch (err) {
        showToast(err.message || 'Login failed. Please check credentials.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerText = 'Sign In';
      }
    });
  }

  // Register Form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('reg-name').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value,
        phone: document.getElementById('reg-phone').value,
        age: document.getElementById('reg-age').value,
        gender: document.getElementById('reg-gender').value,
        height_cm: document.getElementById('reg-height').value,
        weight_kg: document.getElementById('reg-weight').value,
        fitness_goal: document.getElementById('reg-goal').value,
        plan_id: document.getElementById('reg-plan').value
      };

      const btn = registerForm.querySelector('button[type="submit"]');
      try {
        btn.disabled = true;
        btn.innerText = 'Creating account...';
        const res = await Auth.register(payload);
        if (res.success) {
          showToast('Account created successfully! Redirecting...', 'success');
          setTimeout(() => {
            window.location.href = '/member-dashboard.html';
          }, 900);
        }
      } catch (err) {
        showToast(err.message || 'Registration failed.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerText = 'Create Account';
      }
    });
  }
}

// Modal Triggers
function openLoginModal() {
  document.getElementById('login-modal').classList.add('active');
}
function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('active');
}
function openRegisterModal(selectedPlanId = null) {
  document.getElementById('register-modal').classList.add('active');
  if (selectedPlanId) {
    const planSelect = document.getElementById('reg-plan');
    if (planSelect) planSelect.value = selectedPlanId;
  }
}
function closeRegisterModal() {
  document.getElementById('register-modal').classList.remove('active');
}

// Quick Demo Login Helper (College project testing)
function quickLogin(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
  document.getElementById('login-form').dispatchEvent(new Event('submit'));
}
