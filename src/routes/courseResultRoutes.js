const express = require('express');
const router = express.Router();
const courseResultController = require('../controllers/courseResultController');

router.get('/', courseResultController.getAllCourseResults);
router.get('/:id', courseResultController.getCourseResultById);
router.post('/', courseResultController.createCourseResult);
router.put('/:id', courseResultController.updateCourseResult);
router.delete('/:id', courseResultController.deleteCourseResult);

module.exports = router;