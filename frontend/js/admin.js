/**
 * IronPulse Admin Dashboard Controller
 */

let memberGrowthChart = null;
let revenueChart = null;
let planDistChart = null;
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  // Enforce admin authentication
  if (!Auth.protectRoute('admin')) return;

  setupAdminNavigation();
  setupAdminForms();
  await refreshAdminDashboard();
});

function setupAdminNavigation() {
  // Theme toggle
  const themeBtn = document.getElementById('admin-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => Auth.toggleTheme());
  }

  // Logout
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Auth.logout());
  }

  // Sidebar navigation tabs
  const navItems = document.querySelectorAll('.admin-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabTarget = item.getAttribute('data-tab');
      switchTab(tabTarget);
    });
  });

  // Member search input
  const searchInput = document.getElementById('member-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => loadMembersTable(), 300));
  }
}

function switchTab(tabId) {
  // Update sidebar active class
  document.querySelectorAll('.admin-nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
  });

  // Switch content panels
  document.querySelectorAll('.admin-tab-panel').forEach(panel => {
    panel.style.display = panel.id === `panel-${tabId}` ? 'block' : 'none';
  });

  // Trigger relevant data load
  if (tabId === 'members') loadMembersTable();
  if (tabId === 'attendance') loadAttendanceTab();
  if (tabId === 'renewals') loadRenewalsTab();
  if (tabId === 'workouts') loadWorkoutsTab();
  if (tabId === 'trainers') loadTrainersTab();
  if (tabId === 'plans') loadPlansTab();
  if (tabId === 'feedback') loadFeedbackTab();
}

/**
 * Refresh full overview metrics and charts
 */
async function refreshAdminDashboard() {
  await loadStats();
  await loadAnalyticsCharts();
  await loadMembersTable();
  await loadRenewalsBadge();
  await loadTrainersDropdowns();
  await loadPlansDropdowns();
}

/**
 * KPI Stat Cards
 */
async function loadStats() {
  try {
    const res = await apiRequest('/admin/stats');
    if (res.success && res.data) {
      const s = res.data;
      document.getElementById('stat-total-members').innerText = s.totalMembers;
      document.getElementById('stat-active-members').innerText = s.activeMembers;
      document.getElementById('stat-expiring-soon').innerText = s.expiringSoon;
      document.getElementById('stat-expired-members').innerText = s.expiredMembers;
      document.getElementById('stat-today-checkins').innerText = s.todayCheckins;
      document.getElementById('stat-monthly-revenue').innerText = `$${s.monthlyRevenue}`;

      // Update renewals badge in sidebar
      const badge = document.getElementById('pending-renewals-badge');
      if (badge) {
        badge.innerText = s.pendingRenewals;
        badge.style.display = s.pendingRenewals > 0 ? 'inline-block' : 'none';
      }
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

async function loadRenewalsBadge() {
  try {
    const res = await apiRequest('/renewals?status=pending');
    if (res.success && res.data) {
      const badge = document.getElementById('pending-renewals-badge');
      if (badge) {
        badge.innerText = res.data.length;
        badge.style.display = res.data.length > 0 ? 'inline-block' : 'none';
      }
    }
  } catch (err) {
    console.error('Renewals badge error:', err);
  }
}

/**
 * Chart.js Visualizations
 */
async function loadAnalyticsCharts() {
  try {
    const res = await apiRequest('/admin/analytics');
    if (!res.success || !res.data) return;

    const { memberGrowth, revenueTrend, planDistribution } = res.data;

    // 1. Member Growth Bar Chart
    const growthCanvas = document.getElementById('chartMemberGrowth');
    if (growthCanvas && window.Chart) {
      if (memberGrowthChart) memberGrowthChart.destroy();
      memberGrowthChart = new Chart(growthCanvas, {
        type: 'bar',
        data: {
          labels: memberGrowth.labels,
          datasets: [{
            label: 'New Members',
            data: memberGrowth.data,
            backgroundColor: '#00e676',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#273142' }, ticks: { color: '#9ca3af' } },
            y: { grid: { color: '#273142' }, ticks: { color: '#9ca3af', stepSize: 1 } }
          }
        }
      });
    }

    // 2. Revenue Trend Line Chart
    const revenueCanvas = document.getElementById('chartRevenueTrend');
    if (revenueCanvas && window.Chart) {
      if (revenueChart) revenueChart.destroy();
      revenueChart = new Chart(revenueCanvas, {
        type: 'line',
        data: {
          labels: revenueTrend.labels,
          datasets: [{
            label: 'Revenue ($)',
            data: revenueTrend.data,
            borderColor: '#ff7a00',
            backgroundColor: 'rgba(255, 122, 0, 0.1)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#ff7a00'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#273142' }, ticks: { color: '#9ca3af' } },
            y: { grid: { color: '#273142' }, ticks: { color: '#9ca3af' } }
          }
        }
      });
    }

    // 3. Plan Distribution Doughnut Chart
    const planCanvas = document.getElementById('chartPlanDist');
    if (planCanvas && window.Chart) {
      if (planDistChart) planDistChart.destroy();
      planDistChart = new Chart(planCanvas, {
        type: 'doughnut',
        data: {
          labels: planDistribution.labels,
          datasets: [{
            data: planDistribution.data,
            backgroundColor: ['#00e676', '#00e5ff', '#ff7a00', '#ff334b']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#9ca3af' } }
          }
        }
      });
    }

  } catch (err) {
    console.error('Analytics charts error:', err);
  }
}

/**
 * Filter Members Table
 */
function setMemberFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-pills .pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-filter') === filter);
  });
  loadMembersTable();
}

/**
 * Member Management Table
 */
async function loadMembersTable() {
  const tbody = document.getElementById('members-table-body');
  if (!tbody) return;

  const search = document.getElementById('member-search-input')?.value || '';

  try {
    const res = await apiRequest(`/admin/members?search=${encodeURIComponent(search)}&filter=${currentFilter}`);
    if (!res.success || !res.data) return;

    if (res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">No members matching criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(m => `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${m.name}</div>
          <div style="font-size: 0.78rem; color: var(--text-dim);">${m.email} | ${m.phone || 'No phone'}</div>
        </td>
        <td>
          <span style="font-weight: 600;">${m.plan_name}</span>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Exp: ${m.end_date || 'N/A'}</div>
        </td>
        <td>
          <div style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 800; color: var(--${m.color === 'green' ? 'accent-primary' : (m.color === 'orange' ? 'accent-orange' : (m.color === 'red' ? 'accent-red' : 'text-dim'))});">
            ${m.daysLeft} d
          </div>
        </td>
        <td>
          <span class="badge ${m.badgeClass}">${m.badge}</span>
        </td>
        <td>
          <span style="font-size: 0.85rem; color: var(--text-muted);">${m.trainer_name}</span>
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="openEditMemberModal(${m.id})" title="Edit Member">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="sendExpiryReminder(${m.id})" title="Send Reminder Alert">🔔</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteMember(${m.id}, '${m.name}')" title="Delete Member">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Members table error:', err);
  }
}

/**
 * Attendance Management Tab
 */
async function loadAttendanceTab() {
  const tbody = document.getElementById('today-attendance-body');
  if (!tbody) return;

  try {
    const res = await apiRequest('/attendance/today');
    if (res.success && res.data) {
      document.getElementById('today-checkin-count-badge').innerText = `${res.count} Check-ins today`;
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 2rem;">No check-ins recorded yet today.</td></tr>';
        return;
      }
      tbody.innerHTML = res.data.map(a => `
        <tr>
          <td><strong style="color: var(--accent-primary);">${a.check_in_time}</strong></td>
          <td><strong>${a.member_name}</strong></td>
          <td>${a.plan_name || 'Standard'}</td>
          <td>${a.fitness_goal || 'General Fitness'}</td>
          <td><span class="badge badge-green">Verified</span></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Attendance load error:', err);
  }
}

/**
 * Admin check-in action (with instant duplicate warning)
 */
async function handleAdminCheckin() {
  const select = document.getElementById('admin-checkin-member-select');
  const memberId = select ? select.value : null;

  if (!memberId) {
    showToast('Please select a member to check in.', 'warning');
    return;
  }

  try {
    const res = await apiRequest('/attendance/checkin', {
      method: 'POST',
      body: JSON.stringify({ member_id: parseInt(memberId, 10) })
    });
    if (res.success) {
      showToast(res.message, 'success');
      await loadAttendanceTab();
      await loadStats();
    }
  } catch (err) {
    // Shows the exact duplicate warning constraint from backend!
    showToast(err.message, 'error');
  }
}

/**
 * Renewal Queue Tab
 */
async function loadRenewalsTab() {
  const tbody = document.getElementById('renewals-table-body');
  if (!tbody) return;

  try {
    const res = await apiRequest('/renewals?status=pending');
    if (res.success && res.data) {
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">No pending renewal requests.</td></tr>';
        return;
      }
      tbody.innerHTML = res.data.map(r => `
        <tr>
          <td>
            <strong>${r.member_name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${r.member_email}</div>
          </td>
          <td>${r.current_plan_name || 'Standard'}</td>
          <td>
            <strong style="color: var(--accent-primary);">${r.requested_plan_name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">$${r.requested_price} / ${r.requested_duration} days</div>
          </td>
          <td>
            <div>Current End: <code>${r.current_end_date || 'N/A'}</code></div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${r.notes || 'No notes'}</div>
          </td>
          <td>${r.request_date}</td>
          <td>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-primary btn-sm" onclick="approveRenewal(${r.id})">✓ Approve & Extend</button>
              <button class="btn btn-danger btn-sm" onclick="rejectRenewal(${r.id})">✕ Reject</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Renewals load error:', err);
  }
}

async function approveRenewal(requestId) {
  try {
    const res = await apiRequest(`/renewals/${requestId}/approve`, { method: 'POST' });
    if (res.success) {
      showToast(res.message, 'success');
      await loadRenewalsTab();
      await loadRenewalsBadge();
      await loadStats();
      await loadMembersTable();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function rejectRenewal(requestId) {
  const reason = prompt('Please enter the reason for rejection:', 'Not approved at this time');
  if (!reason) return;

  try {
    const res = await apiRequest(`/renewals/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    if (res.success) {
      showToast(res.message, 'info');
      await loadRenewalsTab();
      await loadRenewalsBadge();
      await loadStats();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Workouts Assignment Tab
 */
async function loadWorkoutsTab() {
  const container = document.getElementById('workout-templates-grid');
  if (!container) return;

  try {
    const res = await apiRequest('/workouts/templates');
    if (res.success && res.data) {
      container.innerHTML = res.data.map(tpl => `
        <div class="card">
          <div class="card-header">
            <div>
              <h4 style="font-size: 1.1rem;">${tpl.title}</h4>
              <span class="badge badge-green">${tpl.category}</span>
            </div>
          </div>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1rem;">${tpl.description}</p>
          <div style="max-height: 180px; overflow-y: auto; margin-bottom: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
            ${tpl.exercises.map(ex => `
              <div style="font-size: 0.8rem; display: flex; justify-content: space-between; padding: 0.25rem 0;">
                <span><strong>${ex.day_of_week.slice(0, 3)}:</strong> ${ex.exercise_name}</span>
                <span style="color: var(--accent-cyan);">${ex.sets}x${ex.reps}</span>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="openAssignWorkoutModal(${tpl.id}, '${tpl.title}')">
            Assign to Member
          </button>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Workouts tab error:', err);
  }
}

/**
 * Trainers Management Tab
 */
async function loadTrainersTab() {
  const container = document.getElementById('admin-trainers-grid');
  if (!container) return;

  try {
    const res = await apiRequest('/trainers');
    if (res.success && res.data) {
      container.innerHTML = res.data.map(t => `
        <div class="card" style="display: flex; gap: 1rem; align-items: center;">
          <img src="${t.avatar_url}" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-primary);">
          <div style="flex: 1;">
            <h4 style="font-size: 1.1rem; margin-bottom: 0.2rem;">${t.name}</h4>
            <div style="font-size: 0.82rem; color: var(--accent-cyan); font-weight: 700;">${t.specialization}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${t.email || ''} | ${t.phone || ''}</div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--accent-primary); margin-top: 0.35rem;">
              👥 ${t.assigned_members_count} Assigned Members
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Trainers tab error:', err);
  }
}

/**
 * Membership Plans Management Tab
 */
async function loadPlansTab() {
  const container = document.getElementById('admin-plans-grid');
  if (!container) return;

  try {
    const res = await apiRequest('/plans');
    if (res.success && res.data) {
      container.innerHTML = res.data.map(p => `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h4 style="font-size: 1.15rem;">${p.name}</h4>
            <span class="badge ${p.is_active ? 'badge-green' : 'badge-grey'}">${p.is_active ? 'Active' : 'Disabled'}</span>
          </div>
          <div style="font-size: 2rem; font-weight: 900; font-family: var(--font-heading); color: var(--accent-primary); margin-bottom: 0.25rem;">
            $${p.price}
          </div>
          <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 0.75rem;">${p.duration_days} Days validity</div>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem;">${p.description}</p>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Plans tab error:', err);
  }
}

/**
 * Feedback Tab
 */
async function loadFeedbackTab() {
  const tbody = document.getElementById('feedback-table-body');
  if (!tbody) return;

  try {
    const res = await apiRequest('/feedback');
    if (res.success && res.data) {
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 2rem;">No feedback submitted yet.</td></tr>';
        return;
      }
      tbody.innerHTML = res.data.map(f => `
        <tr>
          <td><strong>${f.member_name}</strong></td>
          <td>${f.trainer_name ? `Coach ${f.trainer_name}` : 'General Gym'}</td>
          <td>${'⭐'.repeat(f.rating)}</td>
          <td>${f.comment}</td>
          <td>${f.created_at}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Feedback tab error:', err);
  }
}

/**
 * Populate dynamic dropdowns across modals and panels
 */
async function loadTrainersDropdowns() {
  try {
    const res = await apiRequest('/trainers');
    if (res.success && res.data) {
      const options = '<option value="">None / Unassigned</option>' + res.data.map(t => `<option value="${t.id}">${t.name} (${t.specialization})</option>`).join('');
      const addSelect = document.getElementById('add-trainer-id');
      const editSelect = document.getElementById('edit-trainer-id');
      if (addSelect) addSelect.innerHTML = options;
      if (editSelect) editSelect.innerHTML = options;
    }
  } catch (err) {
    console.error('Trainers dropdown error:', err);
  }
}

async function loadPlansDropdowns() {
  try {
    const res = await apiRequest('/plans');
    if (res.success && res.data) {
      const options = res.data.map(p => `<option value="${p.id}">${p.name} ($${p.price} / ${p.duration_days}d)</option>`).join('');
      const addSelect = document.getElementById('add-plan-id');
      const editSelect = document.getElementById('edit-plan-id');
      if (addSelect) addSelect.innerHTML = options;
      if (editSelect) editSelect.innerHTML = options;

      // Also populate the check-in members dropdown
      const mRes = await apiRequest('/admin/members?filter=all');
      if (mRes.success && mRes.data) {
        const checkinSelect = document.getElementById('admin-checkin-member-select');
        const assignMemberSelect = document.getElementById('assign-workout-member-select');
        const mOptions = mRes.data.map(m => `<option value="${m.id}">${m.name} (${m.email})</option>`).join('');
        if (checkinSelect) checkinSelect.innerHTML = '<option value="">Select Member to Check-in...</option>' + mOptions;
        if (assignMemberSelect) assignMemberSelect.innerHTML = mOptions;
      }
    }
  } catch (err) {
    console.error('Plans dropdown error:', err);
  }
}

/**
 * Setup forms
 */
function setupAdminForms() {
  // Add Member Form
  const addMemberForm = document.getElementById('add-member-form');
  if (addMemberForm) {
    addMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('add-name').value,
        email: document.getElementById('add-email').value,
        phone: document.getElementById('add-phone').value,
        age: document.getElementById('add-age').value,
        gender: document.getElementById('add-gender').value,
        weight_kg: document.getElementById('add-weight').value,
        fitness_goal: document.getElementById('add-goal').value,
        trainer_id: document.getElementById('add-trainer-id').value || null,
        plan_id: document.getElementById('add-plan-id').value
      };

      try {
        const res = await apiRequest('/admin/members', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.success) {
          showToast(res.message, 'success');
          closeAddMemberModal();
          await refreshAdminDashboard();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Edit Member Form
  const editMemberForm = document.getElementById('edit-member-form');
  if (editMemberForm) {
    editMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberId = document.getElementById('edit-member-id').value;
      const payload = {
        name: document.getElementById('edit-name').value,
        phone: document.getElementById('edit-phone').value,
        fitness_goal: document.getElementById('edit-goal').value,
        trainer_id: document.getElementById('edit-trainer-id').value || null,
        end_date: document.getElementById('edit-end-date').value
      };

      try {
        const res = await apiRequest(`/admin/members/${memberId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        if (res.success) {
          showToast(res.message, 'success');
          closeEditMemberModal();
          await refreshAdminDashboard();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Post Announcement Form
  const postNoticeForm = document.getElementById('post-announcement-form');
  if (postNoticeForm) {
    postNoticeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('notice-title').value,
        content: document.getElementById('notice-content').value,
        priority: document.getElementById('notice-priority').value
      };

      try {
        const res = await apiRequest('/admin/announcements', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.success) {
          showToast(res.message, 'success');
          document.getElementById('notice-title').value = '';
          document.getElementById('notice-content').value = '';
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Add Trainer Form
  const addTrainerForm = document.getElementById('add-trainer-form');
  if (addTrainerForm) {
    addTrainerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('trainer-name').value,
        email: document.getElementById('trainer-email').value,
        phone: document.getElementById('trainer-phone').value,
        specialization: document.getElementById('trainer-spec').value,
        bio: document.getElementById('trainer-bio').value
      };

      try {
        const res = await apiRequest('/trainers', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.success) {
          showToast(res.message, 'success');
          closeAddTrainerModal();
          await loadTrainersTab();
          await loadTrainersDropdowns();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Assign Workout Template Form
  const assignWkForm = document.getElementById('assign-workout-form');
  if (assignWkForm) {
    assignWkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberId = document.getElementById('assign-workout-member-select').value;
      const templateId = document.getElementById('assign-workout-template-id').value;

      try {
        const res = await apiRequest('/workouts/assign', {
          method: 'POST',
          body: JSON.stringify({ member_id: parseInt(memberId, 10), template_id: parseInt(templateId, 10) })
        });
        if (res.success) {
          showToast(res.message, 'success');
          closeAssignWorkoutModal();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

/**
 * Send Expiry Reminder
 */
async function sendExpiryReminder(memberId) {
  try {
    const res = await apiRequest(`/admin/remind/${memberId}`, { method: 'POST' });
    if (res.success) {
      showToast(res.message, 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Delete Member with confirmation
 */
async function confirmDeleteMember(memberId, memberName) {
  if (!confirm(`Are you sure you want to permanently delete member "${memberName}"? All associated attendance and records will be deleted.`)) {
    return;
  }

  try {
    const res = await apiRequest(`/admin/members/${memberId}`, { method: 'DELETE' });
    if (res.success) {
      showToast(res.message, 'info');
      await refreshAdminDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Modal helpers
 */
function openAddMemberModal() {
  document.getElementById('add-member-modal').classList.add('active');
}
function closeAddMemberModal() {
  document.getElementById('add-member-modal').classList.remove('active');
}
function openEditMemberModal(id) {
  document.getElementById('edit-member-id').value = id;
  // Fetch member data to fill inputs
  apiRequest(`/admin/members?search=&filter=all`).then(res => {
    const m = res.data.find(x => x.id === id);
    if (m) {
      document.getElementById('edit-name').value = m.name;
      document.getElementById('edit-phone').value = m.phone || '';
      document.getElementById('edit-goal').value = m.fitness_goal || 'General Fitness';
      document.getElementById('edit-end-date').value = m.end_date || '';
      document.getElementById('edit-trainer-id').value = m.trainer_id || '';
    }
  });
  document.getElementById('edit-member-modal').classList.add('active');
}
function closeEditMemberModal() {
  document.getElementById('edit-member-modal').classList.remove('active');
}
function openAddTrainerModal() {
  document.getElementById('add-trainer-modal').classList.add('active');
}
function closeAddTrainerModal() {
  document.getElementById('add-trainer-modal').classList.remove('active');
}
function openAssignWorkoutModal(templateId, templateTitle) {
  document.getElementById('assign-workout-template-id').value = templateId;
  document.getElementById('assign-workout-template-title').innerText = templateTitle;
  document.getElementById('assign-workout-modal').classList.add('active');
}
function closeAssignWorkoutModal() {
  document.getElementById('assign-workout-modal').classList.remove('active');
}

/**
 * CSV Downloads
 */
function downloadCSV(type) {
  const token = Auth.getToken();
  const url = `/api/admin/export/${type}?token=${token}`;
  window.open(url, '_blank');
}

/**
 * Simple debounce helper
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
