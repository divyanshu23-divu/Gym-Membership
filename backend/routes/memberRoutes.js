const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const { authenticateToken, requireMember } = require('../middleware/authMiddleware');

router.use(authenticateToken);
router.use(requireMember);

router.get('/dashboard', memberController.getDashboard);
router.put('/profile', memberController.updateProfile);

module.exports = router;
