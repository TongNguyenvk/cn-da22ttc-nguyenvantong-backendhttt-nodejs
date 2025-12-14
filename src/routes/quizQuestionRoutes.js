const express = require('express');
const router = express.Router();
const quizQuestionController = require('../controllers/quizQuestionController');

router.get('/', quizQuestionController.getAllQuizQuestions);
router.get('/:quiz_id/:question_id', quizQuestionController.getQuizQuestionById);
router.post('/', quizQuestionController.createQuizQuestion);
router.delete('/:quiz_id/:question_id', quizQuestionController.deleteQuizQuestion);

module.exports = router;