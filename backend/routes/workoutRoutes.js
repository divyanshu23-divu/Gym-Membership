const express = require('express');
const router = express.Router();
const workoutController = require('../controllers/workoutController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Member or Admin views assigned workout
router.get('/my', workoutController.getMemberWorkout);

// Admin views templates
router.get('/templates', requireAdmin, workoutController.getWorkoutTemplates);

// Admin assigns template to member
router.post('/assign', requireAdmin, workoutController.assignWorkoutTemplate);

module.exports = router;
