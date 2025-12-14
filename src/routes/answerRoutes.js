const express = require('express');
const router = express.Router();
const answerController = require('../controllers/answerController');
const answerMediaController = require('../controllers/answerMediaController');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/', answerController.getAllAnswers);
router.get('/:id', answerController.getAnswerById);
router.post('/', answerController.createAnswer);
router.put('/:id', answerController.updateAnswer);
router.delete('/:id', answerController.deleteAnswer);

// Answer media endpoints
router.get('/:answerId/media', answerMediaController.list);
router.post('/:answerId/media', upload.single('media_file'), answerMediaController.upload);
router.delete('/:answerId/media/:mediaId', answerMediaController.remove);
router.get('/:answerId/media/:filename', answerMediaController.serve);

module.exports = router;