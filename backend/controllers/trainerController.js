const db = require('../../database/db');

/**
 * Get all trainers with member assignment counts
 */
function getTrainers(req, res) {
  const trainers = db.prepare(`
    SELECT t.*, count(m.id) as assigned_members_count
    FROM trainers t
    LEFT JOIN members m ON m.trainer_id = t.id
    GROUP BY t.id
    ORDER BY t.name ASC
  `).all();

  return res.json({ success: true, count: trainers.length, data: trainers });
}

/**
 * Admin creates a new trainer
 */
function createTrainer(req, res) {
  const { name, email, phone, specialization, bio, avatar_url } = req.body;

  if (!name || !specialization) {
    return res.status(400).json({ success: false, message: 'Trainer name and specialization are required.' });
  }

  const result = db.prepare(`
    INSERT INTO trainers (name, email, phone, specialization, bio, avatar_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    email || null,
    phone || null,
    specialization,
    bio || null,
    avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'
  );

  return res.status(201).json({
    success: true,
    message: 'Trainer added successfully.',
    trainerId: result.lastInsertRowid
  });
}

/**
 * Admin assigns a member to a trainer
 */
function assignTrainer(req, res) {
  const { member_id, trainer_id } = req.body;

  if (!member_id) {
    return res.status(400).json({ success: false, message: 'Member ID is required.' });
  }

  const member = db.prepare('SELECT id, user_id, name FROM members WHERE id = ?').get(member_id);
  if (!member) {
    return res.status(404).json({ success: false, message: 'Member not found.' });
  }

  let trainerName = 'Unassigned';
  if (trainer_id) {
    const trainer = db.prepare('SELECT id, name FROM trainers WHERE id = ?').get(trainer_id);
    if (!trainer) {
      return res.status(404).json({ success: false, message: 'Trainer not found.' });
    }
    trainerName = trainer.name;
  }

  db.prepare('UPDATE members SET trainer_id = ? WHERE id = ?').run(trainer_id ? parseInt(trainer_id, 10) : null, member_id);

  if (trainer_id) {
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Trainer Assigned', 'You have been assigned to Coach ' || ? || '. Check your new workout plan!', 'info')
    `).run(member.user_id, trainerName);
  }

  return res.json({
    success: true,
    message: `Trainer ${trainerName} assigned to ${member.name}.`
  });
}

module.exports = {
  getTrainers,
  createTrainer,
  assignTrainer
};
