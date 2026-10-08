const db = require('../../database/db');

/**
 * Get payment history for member
 */
function getMemberPayments(req, res) {
  const memberId = req.user.memberId;
  if (!memberId) {
    return res.status(404).json({ success: false, message: 'Member profile not found.' });
  }

  const payments = db.prepare(`
    SELECT p.id, p.transaction_id, p.amount, p.payment_method, p.payment_date, p.status,
           pl.name as plan_name, pl.duration_days
    FROM payments p
    LEFT JOIN plans pl ON p.plan_id = pl.id
    WHERE p.member_id = ?
    ORDER BY p.payment_date DESC
  `).all(memberId);

  return res.json({ success: true, count: payments.length, data: payments });
}

/**
 * Admin view: Get all gym payments
 */
function getAllPayments(req, res) {
  const payments = db.prepare(`
    SELECT p.id, p.transaction_id, p.amount, p.payment_method, p.payment_date, p.status,
           m.name as member_name, m.phone as member_phone, u.email as member_email,
           pl.name as plan_name
    FROM payments p
    JOIN members m ON p.member_id = m.id
    JOIN users u ON m.user_id = u.id
    LEFT JOIN plans pl ON p.plan_id = pl.id
    ORDER BY p.payment_date DESC
  `).all();

  return res.json({ success: true, count: payments.length, data: payments });
}

module.exports = {
  getMemberPayments,
  getAllPayments
};
