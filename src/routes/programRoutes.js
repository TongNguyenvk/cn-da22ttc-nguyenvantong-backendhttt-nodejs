const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');
const programSubjectController = require('../controllers/programSubjectController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - viewing only
router.get('/', programController.getAllPrograms);
router.get('/:id', programController.getProgramById);

// Admin only routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin']), programController.createProgram);
router.put('/:id', authenticateToken, authorize(['admin']), programController.updateProgram);
router.delete('/:id', authenticateToken, authorize(['admin']), programController.deleteProgram);

// Additional routes for program management (public read)
router.get('/:id/courses', programController.getCoursesByProgram);
router.get('/:id/pos', programController.getPOsByProgram);
router.get('/:id/plos', programController.getPLOsByProgram);

// -------- Extended management (admin) --------
// Create PO & PLO for a program
router.post('/:id/pos', authenticateToken, authorize(['admin']), programController.createPOForProgram);
router.post('/:id/plos', authenticateToken, authorize(['admin']), programController.createPLOForProgram);

// List PO-PLO mappings for a program
router.get('/:id/po-mappings', programController.getPOMappings);

// Link / Unlink PO & PLO within a program
router.post('/:programId/pos/:poId/plos/:ploId', authenticateToken, authorize(['admin']), programController.linkPOToPLO);
router.delete('/:programId/pos/:poId/plos/:ploId', authenticateToken, authorize(['admin']), programController.unlinkPOFromPLO);

// -------- Program Subjects Management --------
router.post('/:programId/subjects', authenticateToken, authorize(['admin']), programSubjectController.addOrCreateSubjectForProgram);
router.post('/:programId/subjects/bulk-add', authenticateToken, authorize(['admin']), programSubjectController.bulkAddSubjectsToProgram);
router.post('/:programId/subjects/bulk-update-semesters', authenticateToken, authorize(['admin']), programSubjectController.bulkUpdateRecommendedSemesters);
router.get('/:programId/subjects', authenticateToken, authorize(['admin','teacher']), programSubjectController.listProgramSubjects);
router.patch('/:programId/subjects/:subjectId', authenticateToken, authorize(['admin']), programSubjectController.updateProgramSubjectMapping);
router.delete('/:programId/subjects/:subjectId', authenticateToken, authorize(['admin']), programSubjectController.removeSubjectFromProgram);

module.exports = router;