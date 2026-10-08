const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// Public: view plans (landing page & registration)
router.get('/', planController.getPlans);

// Admin: create & update plans
router.post('/', authenticateToken, requireAdmin, planController.createPlan);
router.put('/:id', authenticateToken, requireAdmin, planController.updatePlan);

module.exports = router;
