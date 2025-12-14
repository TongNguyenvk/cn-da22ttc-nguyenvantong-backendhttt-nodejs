const express = require('express');
const router = express.Router();
const trainingBatchController = require('../controllers/trainingBatchController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - viewing only
router.get('/', trainingBatchController.getAllTrainingBatches);
router.get('/:id', trainingBatchController.getTrainingBatchById);

// Admin only routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin']), trainingBatchController.createTrainingBatch);
router.put('/:id', authenticateToken, authorize(['admin']), trainingBatchController.updateTrainingBatch);
router.delete('/:id', authenticateToken, authorize(['admin']), trainingBatchController.deleteTrainingBatch);

// Additional routes for training batch management (public read)
router.get('/:id/full-details', trainingBatchController.getTrainingBatchFullDetails);
router.get('/:id/semesters', trainingBatchController.getSemestersByBatch);
router.get('/:id/assignments', trainingBatchController.getAssignmentsByBatch);
router.get('/:id/courses', trainingBatchController.getCoursesByBatch);

// Admin route for subject-teacher assignment management
router.get('/:batch_id/semesters/:semester_id/subjects-teachers', authenticateToken, authorize(['admin']), trainingBatchController.getSubjectsAndTeachersByBatchSemester);

module.exports = router;