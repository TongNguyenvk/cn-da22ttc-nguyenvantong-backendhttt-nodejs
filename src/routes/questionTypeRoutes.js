const express = require('express');
const router = express.Router();
const questionTypeController = require('../controllers/questionTypeController');

router.get('/', questionTypeController.getAllQuestionTypes);
router.get('/:id', questionTypeController.getQuestionTypeById);
router.post('/', questionTypeController.createQuestionType);
router.put('/:id', questionTypeController.updateQuestionType);
router.delete('/:id', questionTypeController.deleteQuestionType);

module.exports = router;