const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authenticateToken, requireAdmin, requireMember } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Member submits feedback
router.post('/', requireMember, feedbackController.submitFeedback);

// Admin views all feedback
router.get('/', requireAdmin, feedbackController.getAllFeedback);

module.exports = router;
