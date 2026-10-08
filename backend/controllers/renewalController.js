const db = require('../../database/db');

function addDaysToDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().split('T')[0];
}

/**
 * Member requests a plan renewal
 */
function requestRenewal(req, res) {
  const memberId = req.user.memberId;
  const { plan_id, notes } = req.body;

  if (!plan_id) {
    return res.status(400).json({ success: false, message: 'Please select a membership plan.' });
  }

  // Check if member already has a pending renewal
  const existingPending = db.prepare(`
    SELECT id FROM renewal_requests WHERE member_id = ? AND status = 'pending'
  `).get(memberId);

  if (existingPending) {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending renewal request under review by the gym staff.'
    });
  }

  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'Selected plan not found.' });
  }

  const result = db.prepare(`
    INSERT INTO renewal_requests (member_id, plan_id, status, notes)
    VALUES (?, ?, 'pending', ?)
  `).run(memberId, plan_id, notes || 'Requested via member dashboard');

  // Notify member
  db.prepare(`
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, 'Renewal Request Received', 'Your request for ' || ? || ' ($' || ? || ') has been sent to gym staff for approval.', 'info')
  `).run(req.user.id, plan.name, plan.price);

  return res.status(201).json({
    success: true,
    message: `Renewal request for ${plan.name} submitted successfully! Gym staff will approve it shortly.`,
    requestId: result.lastInsertRowid
  });
}

/**
 * Admin: Get all renewal requests (pending or all)
 */
function getRenewals(req, res) {
  const { status = 'pending' } = req.query;

  let query = `
    SELECT r.id, r.member_id, r.plan_id, r.status, r.request_date, r.processed_date, r.notes,
           m.name as member_name, m.phone as member_phone, u.email as member_email,
           p.name as requested_plan_name, p.duration_days as requested_duration, p.price as requested_price,
           ms.start_date as current_start_date, ms.end_date as current_end_date, ms.status as current_membership_status,
           cur_p.name as current_plan_name
    FROM renewal_requests r
    JOIN members m ON r.member_id = m.id
    JOIN users u ON m.user_id = u.id
    JOIN plans p ON r.plan_id = p.id
    LEFT JOIN memberships ms ON ms.member_id = m.id
    LEFT JOIN plans cur_p ON ms.plan_id = cur_p.id
    WHERE 1=1
  `;
  const params = [];

  if (status !== 'all') {
    query += ` AND r.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY r.id DESC`;

  const renewals = db.prepare(query).all(...params);
  return res.json({ success: true, count: renewals.length, data: renewals });
}

/**
 * Admin approves renewal:
 * Automatically extends end date:
 * - If still active (current_end >= today): extend from current end date
 * - If expired (current_end < today): extend from today
 */
function approveRenewal(req, res) {
  const requestId = parseInt(req.params.id, 10);

  const request = db.prepare(`
    SELECT r.*, m.user_id, m.name as member_name, p.name as plan_name, p.duration_days, p.price
    FROM renewal_requests r
    JOIN members m ON r.member_id = m.id
    JOIN plans p ON r.plan_id = p.id
    WHERE r.id = ?
  `).get(requestId);

  if (!request) {
    return res.status(404).json({ success: false, message: 'Renewal request not found.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ success: false, message: `This request has already been ${request.status}.` });
  }

  const approveTx = db.transaction(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    // Get current membership
    const currentMs = db.prepare(`
      SELECT * FROM memberships WHERE member_id = ? ORDER BY id DESC LIMIT 1
    `).get(request.member_id);

    let newStartDate, newEndDate;

    if (currentMs && currentMs.end_date >= todayStr) {
      // Still active: extend seamlessly from current end date
      newStartDate = currentMs.end_date;
      newEndDate = addDaysToDate(currentMs.end_date, request.duration_days);
    } else {
      // Expired or missing: extend from today
      newStartDate = todayStr;
      newEndDate = addDaysToDate(todayStr, request.duration_days);
    }

    // Update existing membership or create extended membership
    if (currentMs) {
      db.prepare(`
        UPDATE memberships
        SET plan_id = ?, start_date = ?, end_date = ?, status = 'active'
        WHERE id = ?
      `).run(request.plan_id, currentMs.start_date, newEndDate, currentMs.id);
    } else {
      db.prepare(`
        INSERT INTO memberships (member_id, plan_id, start_date, end_date, status)
        VALUES (?, ?, ?, ?, 'active')
      `).run(request.member_id, request.plan_id, newStartDate, newEndDate);
    }

    // Record simulated payment
    const txnId = `TXN-RNW-${Date.now()}`;
    db.prepare(`
      INSERT INTO payments (member_id, plan_id, amount, payment_method, transaction_id, status)
      VALUES (?, ?, ?, 'Desk Approval / Online', ?, 'completed')
    `).run(request.member_id, request.plan_id, request.price, txnId);

    // Update renewal request status
    db.prepare(`
      UPDATE renewal_requests
      SET status = 'approved', processed_date = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(requestId);

    // Send in-app success notification to member
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, '🎉 Membership Renewal Approved!', ?, 'success')
    `).run(
      request.user_id,
      `Your renewal for the ${request.plan_name} plan has been approved. Your membership is now active until ${newEndDate}.`
    );

    return { newStartDate, newEndDate, planName: request.plan_name, memberName: request.member_name };
  });

  try {
    const approvalResult = approveTx();
    return res.json({
      success: true,
      message: `Renewal approved for ${approvalResult.memberName}. Extended to ${approvalResult.newEndDate}.`,
      data: approvalResult
    });
  } catch (err) {
    console.error('Approve renewal error:', err);
    return res.status(500).json({ success: false, message: 'Failed to approve renewal request.' });
  }
}

/**
 * Admin rejects renewal request
 */
function rejectRenewal(req, res) {
  const requestId = parseInt(req.params.id, 10);
  const { reason = 'Rejected by gym administrator.' } = req.body;

  const request = db.prepare(`
    SELECT r.*, m.user_id, m.name as member_name
    FROM renewal_requests r
    JOIN members m ON r.member_id = m.id
    WHERE r.id = ?
  `).get(requestId);

  if (!request) {
    return res.status(404).json({ success: false, message: 'Renewal request not found.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ success: false, message: `Request is already ${request.status}.` });
  }

  db.prepare(`
    UPDATE renewal_requests
    SET status = 'rejected', processed_date = CURRENT_TIMESTAMP, notes = ?
    WHERE id = ?
  `).run(reason, requestId);

  db.prepare(`
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, 'Renewal Request Update', ?, 'warning')
  `).run(request.user_id, `Your membership renewal request could not be approved. Reason: ${reason}`);

  return res.json({ success: true, message: `Renewal request rejected for ${request.member_name}.` });
}

module.exports = {
  requestRenewal,
  getRenewals,
  approveRenewal,
  rejectRenewal
};
