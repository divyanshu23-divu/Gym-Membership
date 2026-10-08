/**
 * IronPulse Member Dashboard Logic
 */

let currentMemberData = null;
let progressChartInstance = null;
let currentCalendarDate = new Date();

document.addEventListener('DOMContentLoaded', async () => {
  // Enforce member authentication
  if (!Auth.protectRoute('member')) return;

  setupMemberEvents();
  await refreshDashboard();
});

function setupMemberEvents() {
  // Theme toggle
  const themeBtn = document.getElementById('member-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => Auth.toggleTheme());
  }

  // Logout
  const logoutBtn = document.getElementById('member-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Auth.logout());
  }

  // Notifications dropdown toggle
  const notifBtn = document.getElementById('notif-bell-btn');
  const notifDropdown = document.getElementById('notif-dropdown');
  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => notifDropdown.classList.remove('show'));
  }

  // Renewal Modal
  const renewSubmitBtn = document.getElementById('submit-renewal-btn');
  if (renewSubmitBtn) {
    renewSubmitBtn.addEventListener('click', handleRenewalSubmit);
  }

  // Progress Log Form
  const progressForm = document.getElementById('progress-form');
  if (progressForm) {
    progressForm.addEventListener('submit', handleProgressSubmit);
  }

  // Profile Edit Form
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileUpdate);
  }

  // Feedback Form
  const feedbackForm = document.getElementById('feedback-form');
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', handleFeedbackSubmit);
  }

  // Self Check-in
  const checkinBtn = document.getElementById('self-checkin-btn');
  if (checkinBtn) {
    checkinBtn.addEventListener('click', handleSelfCheckin);
  }
}

/**
 * Refresh full dashboard state
 */
async function refreshDashboard() {
  try {
    const res = await apiRequest('/member/dashboard');
    if (!res.success) throw new Error(res.message);

    currentMemberData = res.data;
    renderMemberProfile(res.data.member);
    renderCountdown(res.data.countdown);
    renderAttendance(res.data.attendance);
    renderWorkout(res.data.workout);
    renderHealth(res.data.health);
    renderNotifications(res.data.notifications);
    renderAnnouncements(res.data.announcements);

    // Load sub-modules
    await loadAttendanceCalendar();
    await loadProgressChart();
    await loadPaymentHistory();
    await loadPlansDropdown();
    await loadTrainersDropdown();
  } catch (err) {
    showToast(err.message || 'Error loading dashboard data.', 'error');
  }
}

/**
 * Render Profile & Welcome Bar
 */
function renderMemberProfile(member) {
  document.getElementById('welcome-member-name').innerText = member.name;
  const goalEl = document.getElementById('member-goal-tag');
  if (goalEl) goalEl.innerText = member.fitness_goal;

  const coachEl = document.getElementById('member-coach-name');
  if (coachEl) coachEl.innerText = member.trainer_name ? `Coach: ${member.trainer_name}` : 'Coach: Unassigned';

  // Fill profile modal inputs
  document.getElementById('prof-name').value = member.name || '';
  document.getElementById('prof-phone').value = member.phone || '';
  document.getElementById('prof-age').value = member.age || '';
  document.getElementById('prof-gender').value = member.gender || 'male';
  document.getElementById('prof-height').value = member.height_cm || '';
  document.getElementById('prof-weight').value = member.weight_kg || '';
  document.getElementById('prof-goal').value = member.fitness_goal || 'General Fitness';
}

/**
 * CORE FEATURE: Circular Membership Countdown Ring & Warning Banner
 */
function renderCountdown(cd) {
  const container = document.getElementById('countdown-wrapper-container');
  const banner = document.getElementById('urgent-warning-banner');

  // 1. Warning banner (<7 days or expired)
  if (cd.showWarningBanner) {
    banner.style.display = 'flex';
    const msg = cd.status === 'expired'
      ? 'Your gym membership has expired! Renew now to regain access.'
      : `Warning: Your gym membership expires in ${cd.daysLeft} day${cd.daysLeft === 1 ? '' : 's'}!`;
    document.getElementById('warning-banner-text').innerText = msg;
  } else {
    banner.style.display = 'none';
  }

  // 2. Set dynamic colors
  container.className = `countdown-card color-${cd.color}`;

  // 3. Days number & status
  document.getElementById('countdown-number').innerText = cd.daysLeft;
  document.getElementById('countdown-status-badge').innerText = cd.badge;
  document.getElementById('countdown-status-badge').className = `badge badge-${cd.color}`;

  // 4. Exact dates and plan name
  document.getElementById('countdown-plan-name').innerText = cd.planName;
  document.getElementById('countdown-start-date').innerText = cd.startDate || 'N/A';
  document.getElementById('countdown-end-date').innerText = cd.endDate || 'N/A';
  document.getElementById('countdown-percent-used').innerText = `${cd.percentUsed}% used`;

  // 5. SVG Ring calculation
  // Circle radius r = 85 -> circumference = 2 * PI * 85 ≈ 534.07
  const circle = document.getElementById('countdown-progress-circle');
  const circumference = 2 * Math.PI * 85;
  circle.style.strokeDasharray = `${circumference} ${circumference}`;

  // Stroke offset based on percent remaining:
  // offset = circumference - (percentRemaining / 100) * circumference
  const offset = circumference - ((100 - cd.percentUsed) / 100) * circumference;
  circle.style.strokeDashoffset = offset;
}

/**
 * Render attendance stats
 */
function renderAttendance(att) {
  document.getElementById('streak-count-val').innerText = att.streak;
  document.getElementById('monthly-attendance-pct').innerText = `${att.monthlyAttendancePercent}%`;
  document.getElementById('total-checkins-val').innerText = att.totalCheckins;

  const checkinBtn = document.getElementById('self-checkin-btn');
  if (checkinBtn) {
    if (att.checkedInToday) {
      checkinBtn.disabled = true;
      checkinBtn.innerText = '✓ Checked In Today';
      checkinBtn.className = 'btn btn-secondary btn-sm';
    } else {
      checkinBtn.disabled = false;
      checkinBtn.innerText = '⚡ Check-In Today';
      checkinBtn.className = 'btn btn-primary btn-sm';
    }
  }
}

/**
 * Render today's workout exercises
 */
function renderWorkout(wk) {
  document.getElementById('workout-day-title').innerText = `${wk.dayName} Workout`;
  document.getElementById('workout-category-badge').innerText = wk.category;

  const container = document.getElementById('today-exercises-list');
  if (!wk.exercises || wk.exercises.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🛌</div>
        <strong>Rest & Recovery Day</strong>
        <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 0.25rem;">No scheduled routines today. Hydrate and stretch!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = wk.exercises.map((ex, idx) => `
    <div class="exercise-item">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <input type="checkbox" id="ex-chk-${idx}" style="width: 18px; height: 18px; accent-color: var(--accent-primary); cursor: pointer;">
        <div>
          <label for="ex-chk-${idx}" class="exercise-name" style="cursor: pointer;">${ex.exercise_name}</label>
          ${ex.notes ? `<div style="font-size: 0.78rem; color: var(--text-dim);">${ex.notes}</div>` : ''}
        </div>
      </div>
      <div class="exercise-meta">
        <span class="exercise-chip">${ex.sets} Sets</span>
        <span class="exercise-chip">${ex.reps} Reps</span>
      </div>
    </div>
  `).join('');
}

/**
 * Render Health & BMI
 */
function renderHealth(health) {
  document.getElementById('bmi-score-val').innerText = health.bmi || '--';
  document.getElementById('bmi-category-badge').innerText = health.category;
  document.getElementById('bmi-category-badge').className = `badge ${health.categoryClass}`;
  document.getElementById('calorie-target-val').innerText = `${health.suggestedCalories} kcal`;
}

/**
 * Render Notifications
 */
function renderNotifications(notifs) {
  const container = document.getElementById('notifications-dropdown-list');
  const countEl = document.getElementById('notif-badge-count');

  const unread = notifs.filter(n => !n.is_read).length;
  if (unread > 0) {
    countEl.style.display = 'inline-block';
    countEl.innerText = unread;
  } else {
    countEl.style.display = 'none';
  }

  if (notifs.length === 0) {
    container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No notifications.</div>';
    return;
  }

  container.innerHTML = notifs.map(n => `
    <div class="notif-item ${!n.is_read ? 'unread' : ''}" onclick="markNotificationRead(${n.id})">
      <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.2rem;">${n.title}</div>
      <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.3;">${n.message}</div>
      <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 0.35rem;">${n.created_at}</div>
    </div>
  `).join('');
}

/**
 * Render Announcements bulletin
 */
function renderAnnouncements(announcements) {
  const container = document.getElementById('announcements-container');
  if (!announcements || announcements.length === 0) {
    container.innerHTML = '<p style="color: var(--text-dim);">No announcements at this time.</p>';
    return;
  }

  container.innerHTML = announcements.map(a => `
    <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem;">
        <strong style="color: var(--accent-primary); font-size: 0.95rem;">${a.title}</strong>
        ${a.priority === 'urgent' ? '<span class="badge badge-red">Urgent</span>' : ''}
      </div>
      <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.4;">${a.content}</p>
    </div>
  `).join('');
}

/**
 * Attendance Calendar Widget
 */
async function loadAttendanceCalendar() {
  try {
    const yr = currentCalendarDate.getFullYear();
    const mo = String(currentCalendarDate.getMonth() + 1).padStart(2, '0');
    const res = await apiRequest(`/attendance/my?month=${yr}-${mo}`);

    if (res.success && res.data) {
      renderCalendarGrid(res.data.attendedDates, yr, currentCalendarDate.getMonth());
    }
  } catch (err) {
    console.error('Calendar load error:', err);
  }
}

function renderCalendarGrid(attendedDates, year, monthIndex) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  document.getElementById('calendar-month-title').innerText = `${monthNames[monthIndex]} ${year}`;

  const grid = document.getElementById('calendar-days-grid');
  grid.innerHTML = '';

  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const todayStr = new Date().toISOString().split('T')[0];

  // Empty cells before day 1
  for (let i = 0; i < firstDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    grid.appendChild(emptyCell);
  }

  // Days in month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    cell.innerText = day;

    if (dateStr === todayStr) {
      cell.classList.add('today');
    }
    if (attendedDates && attendedDates.includes(dateStr)) {
      cell.classList.add('attended');
      cell.title = `Attended on ${dateStr}`;
    }

    grid.appendChild(cell);
  }
}

function prevMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  loadAttendanceCalendar();
}
function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  loadAttendanceCalendar();
}

/**
 * Progress Line Chart via Chart.js
 */
async function loadProgressChart() {
  const chartCanvas = document.getElementById('progressChart');
  if (!chartCanvas) return;

  try {
    const res = await apiRequest('/progress/my');
    if (res.success && res.data) {
      const { chart, logs } = res.data;

      // Render Table
      const tableBody = document.getElementById('progress-table-body');
      if (tableBody) {
        tableBody.innerHTML = logs.map(l => `
          <tr>
            <td>${l.log_date}</td>
            <td><strong>${l.weight_kg} kg</strong></td>
            <td>${l.chest_cm ? `${l.chest_cm} cm` : '--'}</td>
            <td>${l.waist_cm ? `${l.waist_cm} cm` : '--'}</td>
            <td>${l.biceps_cm ? `${l.biceps_cm} cm` : '--'}</td>
            <td>${l.notes || '--'}</td>
          </tr>
        `).join('');
      }

      // Render Chart.js
      if (window.Chart) {
        if (progressChartInstance) {
          progressChartInstance.destroy();
        }

        progressChartInstance = new Chart(chartCanvas, {
          type: 'line',
          data: {
            labels: chart.labels,
            datasets: [{
              label: 'Weight (kg)',
              data: chart.weights,
              borderColor: '#00e676',
              backgroundColor: 'rgba(0, 230, 118, 0.1)',
              fill: true,
              tension: 0.3,
              pointBackgroundColor: '#00e676',
              pointRadius: 5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: '#9ca3af' } }
            },
            scales: {
              x: { grid: { color: '#273142' }, ticks: { color: '#9ca3af' } },
              y: { grid: { color: '#273142' }, ticks: { color: '#9ca3af' } }
            }
          }
        });
      }
    }
  } catch (err) {
    console.error('Progress chart error:', err);
  }
}

/**
 * Payments History
 */
async function loadPaymentHistory() {
  const container = document.getElementById('payments-table-body');
  if (!container) return;

  try {
    const res = await apiRequest('/payments/my');
    if (res.success && res.data) {
      if (res.data.length === 0) {
        container.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">No transactions recorded.</td></tr>';
        return;
      }
      container.innerHTML = res.data.map(p => `
        <tr>
          <td><code style="color: var(--accent-cyan);">${p.transaction_id}</code></td>
          <td>${p.plan_name || 'Standard'}</td>
          <td><strong>$${p.amount}</strong></td>
          <td>${p.payment_method}</td>
          <td>${p.payment_date}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Payments load error:', err);
  }
}

/**
 * Load Plans for Renewal Dropdown
 */
async function loadPlansDropdown() {
  const select = document.getElementById('renewal-plan-select');
  if (!select) return;

  try {
    const res = await apiRequest('/plans');
    if (res.success && res.data) {
      select.innerHTML = res.data.map(p => `
        <option value="${p.id}">${p.name} ($${p.price} / ${p.duration_days} days)</option>
      `).join('');
    }
  } catch (err) {
    console.error('Plan dropdown error:', err);
  }
}

/**
 * Load Trainers for Feedback Dropdown
 */
async function loadTrainersDropdown() {
  const select = document.getElementById('feedback-trainer-select');
  if (!select) return;

  try {
    const res = await apiRequest('/trainers');
    if (res.success && res.data) {
      select.innerHTML = '<option value="">Gym Facility (General)</option>' + res.data.map(t => `
        <option value="${t.id}">Coach ${t.name} (${t.specialization})</option>
      `).join('');
    }
  } catch (err) {
    console.error('Trainers dropdown error:', err);
  }
}

/**
 * Handle Self Check-in
 */
async function handleSelfCheckin() {
  try {
    const res = await apiRequest('/attendance/checkin', {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (res.success) {
      showToast(res.message, 'success');
      await refreshDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Handle Renewal Request Submission
 */
async function handleRenewalSubmit() {
  const planId = document.getElementById('renewal-plan-select').value;
  const notes = document.getElementById('renewal-notes').value;

  try {
    const res = await apiRequest('/renewals/request', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId, notes })
    });
    if (res.success) {
      showToast(res.message, 'success');
      closeRenewalModal();
      await refreshDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Handle Progress Log Submission
 */
async function handleProgressSubmit(e) {
  e.preventDefault();
  const payload = {
    log_date: document.getElementById('log-date').value,
    weight_kg: document.getElementById('log-weight').value,
    chest_cm: document.getElementById('log-chest').value,
    waist_cm: document.getElementById('log-waist').value,
    biceps_cm: document.getElementById('log-biceps').value,
    notes: document.getElementById('log-notes').value
  };

  try {
    const res = await apiRequest('/progress/my', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast(res.message, 'success');
      closeProgressModal();
      await refreshDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Handle Profile Update
 */
async function handleProfileUpdate(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('prof-name').value,
    phone: document.getElementById('prof-phone').value,
    age: document.getElementById('prof-age').value,
    gender: document.getElementById('prof-gender').value,
    height_cm: document.getElementById('prof-height').value,
    weight_kg: document.getElementById('prof-weight').value,
    fitness_goal: document.getElementById('prof-goal').value
  };

  try {
    const res = await apiRequest('/member/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast(res.message, 'success');
      closeProfileModal();
      await refreshDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Handle Feedback Submission
 */
async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const payload = {
    trainer_id: document.getElementById('feedback-trainer-select').value || null,
    rating: document.getElementById('feedback-rating').value,
    comment: document.getElementById('feedback-comment').value
  };

  try {
    const res = await apiRequest('/feedback', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast(res.message, 'success');
      document.getElementById('feedback-comment').value = '';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Mark notification as read
 */
async function markNotificationRead(id) {
  try {
    await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
    await refreshDashboard();
  } catch (err) {
    console.error(err);
  }
}

// Modal Toggle Helpers
function openRenewalModal() {
  document.getElementById('renewal-modal').classList.add('active');
}
function closeRenewalModal() {
  document.getElementById('renewal-modal').classList.remove('active');
}
function openProgressModal() {
  document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('progress-modal').classList.add('active');
}
function closeProgressModal() {
  document.getElementById('progress-modal').classList.remove('active');
}
function openProfileModal() {
  document.getElementById('profile-modal').classList.add('active');
}
function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('active');
}
