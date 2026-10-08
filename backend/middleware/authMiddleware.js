const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../../database/db');

/**
 * Validates JWT from Authorization header or query param (for downloads)
 */
function authenticateToken(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied: Authentication token required.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Confirm user exists in database
    const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User session invalid or account not found.' });
    }

    // If member, look up member_id
    let member = null;
    if (user.role === 'member') {
      member = db.prepare('SELECT id, name, trainer_id FROM members WHERE user_id = ?').get(user.id);
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      memberId: member ? member.id : null,
      memberName: member ? member.name : null,
      trainerId: member ? member.trainer_id : null
    };

    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
}

/**
 * Restricts endpoint to admin role only
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
  }
  next();
}

/**
 * Restricts endpoint to member role only
 */
function requireMember(req, res, next) {
  if (!req.user || req.user.role !== 'member') {
    return res.status(403).json({ success: false, message: 'Forbidden: Member access required.' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireMember
};
