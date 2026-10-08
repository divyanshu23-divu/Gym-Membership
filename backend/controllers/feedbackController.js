const db = require('../../database/db');

/**
 * Member submits feedback/review
 */
function submitFeedback(req, res) {
  const memberId = req.user.memberId;
  const { trainer_id, rating, comment } = req.body;

  if (!rating || !comment) {
    return res.status(400).json({ success: false, message: 'Rating (1-5) and review comment are required.' });
  }

  const numRating = parseInt(rating, 10);
  if (numRating < 1 || numRating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5 stars.' });
  }

  const result = db.prepare(`
    INSERT INTO feedback (member_id, trainer_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `).run(
    memberId,
    trainer_id ? parseInt(trainer_id, 10) : null,
    numRating,
    comment
  );

  return res.status(201).json({
    success: true,
    message: 'Thank you for your feedback! Your review has been submitted.',
    feedbackId: result.lastInsertRowid
  });
}

/**
 * Admin view: Get all feedback
 */
function getAllFeedback(req, res) {
  const feedbacks = db.prepare(`
    SELECT f.id, f.rating, f.comment, f.created_at,
           m.name as member_name, m.avatar_url as member_avatar,
           t.name as trainer_name
    FROM feedback f
    JOIN members m ON f.member_id = m.id
    LEFT JOIN trainers t ON f.trainer_id = t.id
    ORDER BY f.id DESC
  `).all();

  return res.json({ success: true, count: feedbacks.length, data: feedbacks });
}

module.exports = {
  submitFeedback,
  getAllFeedback
};
