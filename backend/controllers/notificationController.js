const db = require('../../database/db');

/**
 * Get user's in-app notifications
 */
function getNotifications(req, res) {
  const notifications = db.prepare(`
    SELECT id, title, message, type, is_read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 20
  `).all(req.user.id);

  const unreadCount = db.prepare(`
    SELECT count(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
  `).get(req.user.id).count;

  return res.json({
    success: true,
    unreadCount,
    data: notifications
  });
}

/**
 * Mark a single notification as read
 */
function markAsRead(req, res) {
  const notifId = parseInt(req.params.id, 10);
  db.prepare(`
    UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?
  `).run(notifId, req.user.id);

  return res.json({ success: true, message: 'Notification marked as read.' });
}

/**
 * Mark all notifications as read
 */
function markAllAsRead(req, res) {
  db.prepare(`
    UPDATE notifications SET is_read = 1 WHERE user_id = ?
  `).run(req.user.id);

  return res.json({ success: true, message: 'All notifications marked as read.' });
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead
};
