const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseAnalyticsController');

router.get('/:courseId/analytics/overview', controller.getCourseOverview);
router.get('/:courseId/analytics/lo-stats', controller.getCourseLOStats);
router.post('/:courseId/analytics/recompute', controller.triggerRecompute);
router.get('/:courseId/analytics/interventions', controller.listInterventions);
router.post('/:courseId/analytics/interventions', controller.createIntervention);

module.exports = router;
