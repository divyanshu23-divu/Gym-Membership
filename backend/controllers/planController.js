const db = require('../../database/db');

/**
 * Get all available membership plans
 */
function getPlans(req, res) {
  const plans = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY duration_days ASC').all();
  return res.json({ success: true, count: plans.length, data: plans });
}

/**
 * Admin creates a new plan
 */
function createPlan(req, res) {
  const { name, duration_days, price, description } = req.body;

  if (!name || !duration_days || price === undefined) {
    return res.status(400).json({ success: false, message: 'Plan name, duration in days, and price are required.' });
  }

  const result = db.prepare(`
    INSERT INTO plans (name, duration_days, price, description, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(name, parseInt(duration_days, 10), parseFloat(price), description || '');

  return res.status(201).json({
    success: true,
    message: 'Membership plan created successfully.',
    planId: result.lastInsertRowid
  });
}

/**
 * Admin updates an existing plan
 */
function updatePlan(req, res) {
  const planId = parseInt(req.params.id, 10);
  const { name, duration_days, price, description, is_active } = req.body;

  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'Plan not found.' });
  }

  db.prepare(`
    UPDATE plans
    SET name = ?, duration_days = ?, price = ?, description = ?, is_active = ?
    WHERE id = ?
  `).run(
    name || plan.name,
    duration_days ? parseInt(duration_days, 10) : plan.duration_days,
    price !== undefined ? parseFloat(price) : plan.price,
    description !== undefined ? description : plan.description,
    is_active !== undefined ? parseInt(is_active, 10) : plan.is_active,
    planId
  );

  return res.json({ success: true, message: 'Plan updated successfully.' });
}

module.exports = {
  getPlans,
  createPlan,
  updatePlan
};
