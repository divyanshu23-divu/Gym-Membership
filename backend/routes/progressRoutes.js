const express = require('express');
const router = express.Router();
const progressController = require('../controllers/progressController');
const { authenticateToken, requireMember } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/my', progressController.getProgress);
router.post('/my', requireMember, progressController.addProgress);

module.exports = router;
