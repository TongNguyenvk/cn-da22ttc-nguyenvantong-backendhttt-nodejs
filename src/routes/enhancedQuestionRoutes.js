const express = require('express');
const router = express.Router();
const EnhancedQuestionService = require('../controllers/EnhancedQuestionService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth()+1).padStart(2,'0');
    const baseDir = path.join(process.cwd(),'uploads','questions', year.toString(), month);
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    cb(null, baseDir);
  },
  filename: (req,file,cb) => {
    const unique = Date.now()+'-'+Math.round(Math.random()*1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const fileFilter = (req,file,cb)=>{
  if (/^(image|audio|video)\//.test(file.mimetype) || file.mimetype === 'application/pdf') return cb(null,true);
  return cb(new Error('Unsupported mimetype '+file.mimetype));
};

const upload = multer({ storage, fileFilter, limits:{ fileSize: 50*1024*1024, files:10 } });

// Create with media
router.post('/enhanced', authenticateToken, authorize(['teacher','admin']), upload.array('media_files',10), EnhancedQuestionService.createQuestionWithMedia);
// Get one
router.get('/enhanced/:id', authenticateToken, authorize(['teacher','admin']), EnhancedQuestionService.getQuestionWithMedia);
// Update
router.put('/enhanced/:id', authenticateToken, authorize(['teacher','admin']), upload.array('media_files',10), EnhancedQuestionService.updateQuestionWithMedia);
// Delete
router.delete('/enhanced/:id', authenticateToken, authorize(['teacher','admin']), EnhancedQuestionService.deleteQuestionWithMedia);
// Upload single media file
router.post('/media/upload', authenticateToken, authorize(['teacher','admin']), upload.single('media_file'), EnhancedQuestionService.uploadSingleMedia);
// Serve media file
router.get('/media/:questionId/:filename', EnhancedQuestionService.serveMediaFile);
// Media stats
router.get('/media/stats', authenticateToken, authorize(['teacher','admin']), EnhancedQuestionService.getMediaStats);
// Advanced list
router.get('/enhanced', authenticateToken, authorize(['teacher','admin']), EnhancedQuestionService.getQuestionsAdvanced);

module.exports = router;