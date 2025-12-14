const express = require('express');
const router = express.Router();
const typeSubjectController = require('../controllers/typeSubjectController');

router.get('/', typeSubjectController.getAllTypeSubjects);
router.get('/:id', typeSubjectController.getTypeSubjectById);
router.post('/', typeSubjectController.createTypeSubject);
router.put('/:id', typeSubjectController.updateTypeSubject);
router.delete('/:id', typeSubjectController.deleteTypeSubject);

module.exports = router;