const db = require('../../database/db');
const bcrypt = require('bcryptjs');
const { calculateMembershipDetails, addDays } = require('../utils/helpers');

/**
 * Admin Dashboard KPI Stat Cards
 */
function getStats(req, res) {
  const todayStr = new Date().toISOString().split('T')[0];
  const in7DaysStr = addDays(7);
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Total members
  const totalMembers = db.prepare('SELECT count(*) as count FROM members').get().count;

  // Active members: latest membership end_date >= today
  const activeMembers = db.prepare(`
    SELECT count(DISTINCT m.id) as count
    FROM members m
    JOIN memberships ms ON ms.member_id = m.id
    WHERE ms.end_date >= ? AND ms.status = 'active'
  `).get(todayStr).count;

  // Expiring in 7 days (end_date >= today AND end_date <= today + 7)
  const expiringSoon = db.prepare(`
    SELECT count(DISTINCT m.id) as count
    FROM members m
    JOIN memberships ms ON ms.member_id = m.id
    WHERE ms.end_date >= ? AND ms.end_date <= ? AND ms.status = 'active'
  `).get(todayStr, in7DaysStr).count;

  // Expired members
  const expiredMembers = db.prepare(`
    SELECT count(DISTINCT m.id) as count
    FROM members m
    JOIN memberships ms ON ms.member_id = m.id
    WHERE ms.end_date < ? OR ms.status = 'expired'
  `).get(todayStr).count;

  // Today's Check-ins
  const todayCheckins = db.prepare(`
    SELECT count(*) as count FROM attendance WHERE date = ?
  `).get(todayStr).count;

  // Monthly Revenue
  const monthlyRevenueRow = db.prepare(`
    SELECT coalesce(sum(amount), 0) as total
    FROM payments
    WHERE strftime('%Y-%m', payment_date) = ? AND status = 'completed'
  `).get(currentMonthStr);
  const monthlyRevenue = monthlyRevenueRow ? monthlyRevenueRow.total : 0;

  // Pending renewals
  const pendingRenewals = db.prepare(`
    SELECT count(*) as count FROM renewal_requests WHERE status = 'pending'
  `).get().count;

  return res.json({
    success: true,
    data: {
      totalMembers,
      activeMembers,
      expiringSoon,
      expiredMembers,
      todayCheckins,
      monthlyRevenue: +monthlyRevenue.toFixed(2),
      pendingRenewals
    }
  });
}

/**
 * Chart.js Analytics: Growth, Revenue, and Plan Distribution
 */
function getAnalytics(req, res) {
  // 1. Members joined per month (last 6 months)
  const growthRows = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, count(*) as count
    FROM members
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all().reverse();

  // 2. Revenue per month (last 6 months)
  const revenueRows = db.prepare(`
    SELECT strftime('%Y-%m', payment_date) as month, coalesce(sum(amount), 0) as total
    FROM payments
    WHERE status = 'completed'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all().reverse();

  // 3. Plan Distribution
  const planRows = db.prepare(`
    SELECT p.name, count(ms.id) as count
    FROM plans p
    LEFT JOIN memberships ms ON ms.plan_id = p.id AND ms.status = 'active'
    GROUP BY p.id, p.name
  `).all();

  return res.json({
    success: true,
    data: {
      memberGrowth: {
        labels: growthRows.map(r => r.month),
        data: growthRows.map(r => r.count)
      },
      revenueTrend: {
        labels: revenueRows.map(r => r.month),
        data: revenueRows.map(r => +r.total.toFixed(2))
      },
      planDistribution: {
        labels: planRows.map(r => r.name),
        data: planRows.map(r => r.count)
      }
    }
  });
}

/**
 * Member Directory (Search, Filter, Countdown values)
 */
function getMembers(req, res) {
  const { search = '', filter = 'all' } = req.query;

  let query = `
    SELECT m.id, m.name, m.phone, m.age, m.gender, m.weight_kg, m.fitness_goal, m.created_at,
           u.email, t.name as trainer_name,
           ms.id as membership_id, ms.start_date, ms.end_date, ms.status as raw_status,
           p.id as plan_id, p.name as plan_name
    FROM members m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN trainers t ON m.trainer_id = t.id
    LEFT JOIN memberships ms ON ms.member_id = m.id
    LEFT JOIN plans p ON ms.plan_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (m.name LIKE ? OR u.email LIKE ? OR m.phone LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ` ORDER BY m.id DESC`;

  const rows = db.prepare(query).all(...params);

  // Compute dynamic countdown for each member
  const membersWithCountdown = rows.map(row => {
    const countdown = calculateMembershipDetails(row.start_date, row.end_date, row.plan_name);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      age: row.age,
      gender: row.gender,
      weight_kg: row.weight_kg,
      fitness_goal: row.fitness_goal,
      trainer_name: row.trainer_name || 'Unassigned',
      plan_name: row.plan_name || 'No Plan',
      plan_id: row.plan_id,
      membership_id: row.membership_id,
      start_date: row.start_date,
      end_date: row.end_date,
      daysLeft: countdown.daysLeft,
      color: countdown.color,
      badge: countdown.badge,
      badgeClass: countdown.badgeClass,
      status: countdown.status,
      percentUsed: countdown.percentUsed
    };
  });

  // Apply in-memory filter based on dynamically computed status
  let filtered = membersWithCountdown;
  if (filter === 'active') {
    filtered = membersWithCountdown.filter(m => m.status === 'active');
  } else if (filter === 'expiring') {
    filtered = membersWithCountdown.filter(m => m.status === 'expiring_soon' || m.status === 'urgent_expiry');
  } else if (filter === 'expired') {
    filtered = membersWithCountdown.filter(m => m.status === 'expired');
  }

  return res.json({ success: true, count: filtered.length, data: filtered });
}

/**
 * Admin directly adds a new member
 */
function addMember(req, res) {
  const {
    name,
    email,
    password = 'member123',
    phone,
    age,
    gender,
    height_cm,
    weight_kg,
    fitness_goal,
    trainer_id,
    plan_id
  } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);
  if (existing) {
    return res.status(409).json({ success: false, message: 'User with this email already exists.' });
  }

  const addTx = db.transaction(() => {
    const passwordHash = bcrypt.hashSync(password, 10);
    const uRes = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(email, passwordHash, 'member');
    const userId = uRes.lastInsertRowid;

    const mRes = db.prepare(`
      INSERT INTO members (user_id, trainer_id, name, phone, age, gender, height_cm, weight_kg, fitness_goal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      trainer_id ? parseInt(trainer_id, 10) : null,
      name,
      phone || null,
      age ? parseInt(age, 10) : null,
      gender || 'male',
      height_cm ? parseFloat(height_cm) : null,
      weight_kg ? parseFloat(weight_kg) : null,
      fitness_goal || 'General Fitness'
    );
    const memberId = mRes.lastInsertRowid;

    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id || 1) || db.prepare('SELECT * FROM plans LIMIT 1').get();
    const todayStr = new Date().toISOString().split('T')[0];
    const duration = plan ? plan.duration_days : 30;
    const endDateStr = addDays(duration);

    db.prepare(`
      INSERT INTO memberships (member_id, plan_id, start_date, end_date, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(memberId, plan.id, todayStr, endDateStr);

    const txnId = `TXN-ADM-${Date.now()}`;
    db.prepare(`
      INSERT INTO payments (member_id, plan_id, amount, payment_method, transaction_id, status)
      VALUES (?, ?, ?, 'Cash / Desk', ?, 'completed')
    `).run(memberId, plan.id, plan.price, txnId);

    // Initial weight progress
    if (weight_kg) {
      db.prepare('INSERT INTO progress_logs (member_id, log_date, weight_kg, notes) VALUES (?, ?, ?, ?)').run(memberId, todayStr, parseFloat(weight_kg), 'Initial baseline');
    }

    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Welcome to IronPulse!', 'Your membership plan ' || ? || ' is now active.', 'success')
    `).run(userId, plan.name);

    return memberId;
  });

  try {
    const newMemberId = addTx();
    return res.status(201).json({ success: true, message: 'Member added successfully.', memberId: newMemberId });
  } catch (err) {
    console.error('Error adding member:', err);
    return res.status(500).json({ success: false, message: 'Failed to add member.' });
  }
}

/**
 * Admin updates member details and membership end date
 */
function updateMember(req, res) {
  const memberId = parseInt(req.params.id, 10);
  const {
    name,
    phone,
    age,
    gender,
    fitness_goal,
    trainer_id,
    end_date,
    plan_id
  } = req.body;

  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) {
    return res.status(404).json({ success: false, message: 'Member not found.' });
  }

  const updateTx = db.transaction(() => {
    db.prepare(`
      UPDATE members
      SET name = ?, phone = ?, age = ?, gender = ?, fitness_goal = ?, trainer_id = ?
      WHERE id = ?
    `).run(
      name || member.name,
      phone || member.phone,
      age ? parseInt(age, 10) : member.age,
      gender || member.gender,
      fitness_goal || member.fitness_goal,
      trainer_id !== undefined ? (trainer_id ? parseInt(trainer_id, 10) : null) : member.trainer_id,
      memberId
    );

    if (end_date || plan_id) {
      const todayStr = new Date().toISOString().split('T')[0];
      const newStatus = (end_date && end_date < todayStr) ? 'expired' : 'active';
      if (end_date && plan_id) {
        db.prepare('UPDATE memberships SET end_date = ?, plan_id = ?, status = ? WHERE member_id = ?').run(end_date, plan_id, newStatus, memberId);
      } else if (end_date) {
        db.prepare('UPDATE memberships SET end_date = ?, status = ? WHERE member_id = ?').run(end_date, newStatus, memberId);
      } else if (plan_id) {
        db.prepare('UPDATE memberships SET plan_id = ? WHERE member_id = ?').run(plan_id, memberId);
      }
    }
  });

  try {
    updateTx();
    return res.json({ success: true, message: 'Member updated successfully.' });
  } catch (err) {
    console.error('Update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update member.' });
  }
}

/**
 * Delete a member (cascades to user and records)
 */
function deleteMember(req, res) {
  const memberId = parseInt(req.params.id, 10);
  const member = db.prepare('SELECT user_id FROM members WHERE id = ?').get(memberId);
  if (!member) {
    return res.status(404).json({ success: false, message: 'Member not found.' });
  }

  // Deleting user cascades to member and all foreign key tables
  db.prepare('DELETE FROM users WHERE id = ?').run(member.user_id);
  return res.json({ success: true, message: 'Member and related records deleted successfully.' });
}

/**
 * Send custom or renewal reminder notification
 */
function sendReminder(req, res) {
  const memberId = parseInt(req.params.id, 10);
  const member = db.prepare('SELECT user_id, name FROM members WHERE id = ?').get(memberId);
  if (!member) {
    return res.status(404).json({ success: false, message: 'Member not found.' });
  }

  const membership = db.prepare('SELECT end_date FROM memberships WHERE member_id = ? ORDER BY id DESC LIMIT 1').get(memberId);
  const countdown = calculateMembershipDetails(membership ? membership.start_date : null, membership ? membership.end_date : null, 'Gym Plan');

  db.prepare(`
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, '⚡ Membership Renewal Reminder', ?, 'warning')
  `).run(
    member.user_id,
    `Hello ${member.name}, your gym membership ${countdown.daysLeft > 0 ? `expires in ${countdown.daysLeft} days` : 'has expired'}. Tap Renew Now to maintain continuous gym access!`
  );

  return res.json({ success: true, message: `Reminder notification sent to ${member.name}.` });
}

/**
 * Post an announcement
 */
function postAnnouncement(req, res) {
  const { title, content, priority = 'normal' } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'Title and content are required.' });
  }

  db.prepare(`
    INSERT INTO announcements (title, content, author_id, priority)
    VALUES (?, ?, ?, ?)
  `).run(title, content, req.user.id, priority);

  // Broadcast notification to all active users
  const users = db.prepare("SELECT id FROM users WHERE role = 'member'").all();
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, ?, ?, 'announcement')
  `);
  for (const u of users) {
    insertNotif.run(u.id, `📢 Gym Notice: ${title}`, content.slice(0, 100) + '...');
  }

  return res.status(201).json({ success: true, message: 'Announcement posted and broadcasted to members.' });
}

/**
 * Export Members List as CSV
 */
function exportMembersCSV(req, res) {
  const members = db.prepare(`
    SELECT m.id, m.name, u.email, m.phone, m.gender, m.age, m.weight_kg, m.fitness_goal,
           t.name as trainer_name, p.name as plan_name, ms.start_date, ms.end_date, ms.status
    FROM members m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN trainers t ON m.trainer_id = t.id
    LEFT JOIN memberships ms ON ms.member_id = m.id
    LEFT JOIN plans p ON ms.plan_id = p.id
    ORDER BY m.id ASC
  `).all();

  const headers = ['Member ID', 'Name', 'Email', 'Phone', 'Gender', 'Age', 'Weight(kg)', 'Goal', 'Trainer', 'Plan', 'Start Date', 'End Date', 'Days Left', 'Status'];
  const rows = members.map(m => {
    const cd = calculateMembershipDetails(m.start_date, m.end_date, m.plan_name);
    return [
      m.id,
      `"${m.name.replace(/"/g, '""')}"`,
      `"${m.email}"`,
      `"${m.phone || ''}"`,
      m.gender || '',
      m.age || '',
      m.weight_kg || '',
      `"${m.fitness_goal || ''}"`,
      `"${m.trainer_name || 'None'}"`,
      `"${m.plan_name || 'None'}"`,
      m.start_date || '',
      m.end_date || '',
      cd.daysLeft,
      cd.badge
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=IronPulse_Members_${new Date().toISOString().split('T')[0]}.csv`);
  return res.send(csv);
}

/**
 * Export Payments List as CSV
 */
function exportPaymentsCSV(req, res) {
  const payments = db.prepare(`
    SELECT p.id, p.transaction_id, m.name as member_name, pl.name as plan_name,
           p.amount, p.payment_method, p.payment_date, p.status
    FROM payments p
    JOIN members m ON p.member_id = m.id
    LEFT JOIN plans pl ON p.plan_id = pl.id
    ORDER BY p.payment_date DESC
  `).all();

  const headers = ['Payment ID', 'Transaction ID', 'Member Name', 'Plan', 'Amount', 'Payment Method', 'Payment Date', 'Status'];
  const rows = payments.map(p => [
    p.id,
    `"${p.transaction_id}"`,
    `"${p.member_name.replace(/"/g, '""')}"`,
    `"${p.plan_name || ''}"`,
    p.amount,
    `"${p.payment_method}"`,
    `"${p.payment_date}"`,
    p.status
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=IronPulse_Payments_${new Date().toISOString().split('T')[0]}.csv`);
  return res.send(csv);
}

module.exports = {
  getStats,
  getAnalytics,
  getMembers,
  addMember,
  updateMember,
  deleteMember,
  sendReminder,
  postAnnouncement,
  exportMembersCSV,
  exportPaymentsCSV
};
