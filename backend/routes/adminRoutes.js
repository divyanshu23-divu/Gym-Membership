const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/analytics', adminController.getAnalytics);
router.get('/members', adminController.getMembers);
router.post('/members', adminController.addMember);
router.put('/members/:id', adminController.updateMember);
router.delete('/members/:id', adminController.deleteMember);
router.post('/remind/:id', adminController.sendReminder);
router.post('/announcements', adminController.postAnnouncement);
router.get('/export/members', adminController.exportMembersCSV);
router.get('/export/payments', adminController.exportPaymentsCSV);

module.exports = router;
