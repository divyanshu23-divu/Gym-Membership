const db = require('../../database/db');

/**
 * Get member's progress history for Chart.js and progress table
 */
function getProgress(req, res) {
  let memberId = req.user.memberId;
  if (req.user.role === 'admin' && req.query.member_id) {
    memberId = parseInt(req.query.member_id, 10);
  }

  if (!memberId) {
    return res.status(400).json({ success: false, message: 'Member ID required.' });
  }

  const logs = db.prepare(`
    SELECT id, log_date, weight_kg, chest_cm, waist_cm, biceps_cm, notes, created_at
    FROM progress_logs
    WHERE member_id = ?
    ORDER BY log_date ASC
  `).all(memberId);

  // Format data for Chart.js
  const chartData = {
    labels: logs.map(l => l.log_date),
    weights: logs.map(l => l.weight_kg),
    waist: logs.map(l => l.waist_cm || null),
    biceps: logs.map(l => l.biceps_cm || null)
  };

  return res.json({
    success: true,
    data: {
      chart: chartData,
      logs: [...logs].reverse() // newest first for table
    }
  });
}

/**
 * Log a new weight / body measurement entry
 */
function addProgress(req, res) {
  const memberId = req.user.memberId;
  const { log_date, weight_kg, chest_cm, waist_cm, biceps_cm, notes } = req.body;

  if (!weight_kg) {
    return res.status(400).json({ success: false, message: 'Body weight (kg) is required.' });
  }

  const targetDate = log_date || new Date().toISOString().split('T')[0];

  const result = db.prepare(`
    INSERT INTO progress_logs (member_id, log_date, weight_kg, chest_cm, waist_cm, biceps_cm, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    memberId,
    targetDate,
    parseFloat(weight_kg),
    chest_cm ? parseFloat(chest_cm) : null,
    waist_cm ? parseFloat(waist_cm) : null,
    biceps_cm ? parseFloat(biceps_cm) : null,
    notes || null
  );

  // Update current weight in members table
  db.prepare('UPDATE members SET weight_kg = ? WHERE id = ?').run(parseFloat(weight_kg), memberId);

  return res.status(201).json({
    success: true,
    message: 'Progress metrics logged successfully.',
    logId: result.lastInsertRowid
  });
}

module.exports = {
  getProgress,
  addProgress
};
