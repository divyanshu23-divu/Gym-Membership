const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Mark check-in (both Admin or Member self check-in)
router.post('/checkin', attendanceController.markCheckIn);

// Member views their own attendance history & streak
router.get('/my', attendanceController.getMemberAttendance);

// Admin views today's check-ins
router.get('/today', requireAdmin, attendanceController.getTodayCheckins);

module.exports = router;
