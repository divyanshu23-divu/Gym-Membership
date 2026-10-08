const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken, requireAdmin, requireMember } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Member views own payment history
router.get('/my', requireMember, paymentController.getMemberPayments);

// Admin views all transactions
router.get('/all', requireAdmin, paymentController.getAllPayments);

module.exports = router;
