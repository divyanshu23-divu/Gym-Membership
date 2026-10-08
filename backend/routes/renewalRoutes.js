const express = require('express');
const router = express.Router();
const renewalController = require('../controllers/renewalController');
const { authenticateToken, requireAdmin, requireMember } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Member submits renewal request
router.post('/request', requireMember, renewalController.requestRenewal);

// Admin views pending/all renewal requests
router.get('/', requireAdmin, renewalController.getRenewals);

// Admin approves renewal
router.post('/:id/approve', requireAdmin, renewalController.approveRenewal);

// Admin rejects renewal
router.post('/:id/reject', requireAdmin, renewalController.rejectRenewal);

module.exports = router;
