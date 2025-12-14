const express = require('express');
const router = express.Router();
const typeOfKnowledgeController = require('../controllers/typeOfKnowledgeController');

router.get('/', typeOfKnowledgeController.getAllTypeOfKnowledges);
router.get('/:id', typeOfKnowledgeController.getTypeOfKnowledgeById);
router.post('/', typeOfKnowledgeController.createTypeOfKnowledge);
router.put('/:id', typeOfKnowledgeController.updateTypeOfKnowledge);
router.delete('/:id', typeOfKnowledgeController.deleteTypeOfKnowledge);

module.exports = router;