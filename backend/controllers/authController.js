const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database/db');
const config = require('../config/config');
const { calculateMembershipDetails, addDays } = require('../utils/helpers');

/**
 * Register a new member
 */
function register(req, res) {
  const {
    email,
    password,
    name,
    phone,
    age,
    gender,
    height_cm,
    weight_kg,
    fitness_goal,
    plan_id
  } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ success: false, message: 'Email, password, and full name are required.' });
  }

  // Check if email already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    return res.status(409).json({ success: false, message: 'An account with this email address already exists.' });
  }

  const registerTx = db.transaction(() => {
    // 1. Insert user
    const passwordHash = bcrypt.hashSync(password, 10);
    const userRes = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(email, passwordHash, 'member');
    const userId = userRes.lastInsertRowid;

    // 2. Insert member record
    const memberRes = db.prepare(`
      INSERT INTO members (user_id, trainer_id, name, phone, age, gender, height_cm, weight_kg, fitness_goal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      null, // trainer can be assigned later by admin
      name,
      phone || null,
      age ? parseInt(age, 10) : null,
      gender || 'male',
      height_cm ? parseFloat(height_cm) : null,
      weight_kg ? parseFloat(weight_kg) : null,
      fitness_goal || 'General Fitness'
    );
    const memberId = memberRes.lastInsertRowid;

    // 3. Assign initial membership
    const selectedPlanId = plan_id ? parseInt(plan_id, 10) : 1;
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(selectedPlanId) || db.prepare('SELECT * FROM plans LIMIT 1').get();

    const todayStr = new Date().toISOString().split('T')[0];
    const duration = plan ? plan.duration_days : 30;
    const endDateStr = addDays(duration);

    db.prepare(`
      INSERT INTO memberships (member_id, plan_id, start_date, end_date, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(memberId, plan.id, todayStr, endDateStr);

    // 4. Record simulated payment
    const txnId = `TXN-REG-${Date.now()}`;
    db.prepare(`
      INSERT INTO payments (member_id, plan_id, amount, payment_method, transaction_id, status)
      VALUES (?, ?, ?, 'Online Signup (Simulated)', ?, 'completed')
    `).run(memberId, plan.id, plan.price, txnId);

    // 5. Initial progress log if weight provided
    if (weight_kg) {
      db.prepare(`
        INSERT INTO progress_logs (member_id, log_date, weight_kg, notes)
        VALUES (?, ?, ?, 'Registration baseline')
      `).run(memberId, todayStr, parseFloat(weight_kg));
    }

    // 6. Welcome notification
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Welcome to IronPulse!', 'Your account has been created with the ' || ? || ' plan. Check out your dashboard countdown!', 'success')
    `).run(userId, plan.name);

    return { userId, memberId, planName: plan.name, endDate: endDateStr };
  });

  try {
    const regResult = registerTx();

    const token = jwt.sign(
      { id: regResult.userId, email, role: 'member' },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        id: regResult.userId,
        email,
        role: 'member',
        name,
        memberId: regResult.memberId
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, message: 'Failed to complete registration.' });
  }
}

/**
 * Login handler
 */
function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide both email and password.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  let memberDetails = null;
  if (user.role === 'member') {
    memberDetails = db.prepare(`
      SELECT m.*, t.name as trainer_name,
             ms.start_date, ms.end_date, ms.status as membership_status,
             p.name as plan_name, p.duration_days, p.price
      FROM members m
      LEFT JOIN trainers t ON m.trainer_id = t.id
      LEFT JOIN memberships ms ON ms.member_id = m.id
      LEFT JOIN plans p ON ms.plan_id = p.id
      WHERE m.user_id = ?
      ORDER BY ms.id DESC
      LIMIT 1
    `).get(user.id);
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  return res.json({
    success: true,
    message: 'Login successful.',
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: memberDetails ? memberDetails.name : 'Gym Administrator',
      memberId: memberDetails ? memberDetails.id : null,
      avatarUrl: memberDetails ? memberDetails.avatar_url : null
    }
  });
}

/**
 * Get currently authenticated user info
 */
function me(req, res) {
  if (req.user.role === 'admin') {
    return res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: 'admin',
        name: 'Gym Administrator'
      }
    });
  }

  const member = db.prepare(`
    SELECT m.*, t.name as trainer_name, t.specialization as trainer_spec,
           ms.start_date, ms.end_date, ms.status as membership_status,
           p.name as plan_name, p.duration_days, p.price
    FROM members m
    LEFT JOIN trainers t ON m.trainer_id = t.id
    LEFT JOIN memberships ms ON ms.member_id = m.id
    LEFT JOIN plans p ON ms.plan_id = p.id
    WHERE m.user_id = ?
    ORDER BY ms.id DESC
    LIMIT 1
  `).get(req.user.id);

  if (!member) {
    return res.status(404).json({ success: false, message: 'Member profile not found.' });
  }

  const countdown = calculateMembershipDetails(member.start_date, member.end_date, member.plan_name);

  return res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: 'member',
      name: member.name,
      memberId: member.id,
      phone: member.phone,
      age: member.age,
      gender: member.gender,
      height_cm: member.height_cm,
      weight_kg: member.weight_kg,
      fitness_goal: member.fitness_goal,
      avatar_url: member.avatar_url,
      trainer_name: member.trainer_name,
      trainer_spec: member.trainer_spec,
      countdown
    }
  });
}

module.exports = {
  register,
  login,
  me
};
