const express = require('express');
const router = express.Router();
const trainerController = require('../controllers/trainerController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// Public or authenticated list of trainers
router.get('/', trainerController.getTrainers);

// Admin add & assign
router.post('/', authenticateToken, requireAdmin, trainerController.createTrainer);
router.post('/assign', authenticateToken, requireAdmin, trainerController.assignTrainer);

module.exports = router;
