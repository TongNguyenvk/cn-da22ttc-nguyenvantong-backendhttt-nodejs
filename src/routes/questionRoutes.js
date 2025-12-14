const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const multer = require('multer');
const path = require('path');
const handleMulterError = require('../middleware/multerMiddleware')
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Configure multer for single file upload (Excel)
const upload = multer({ dest: 'uploads/' });

// Configure multer for batch media upload
const mediaStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/temp');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const uploadMedia = multer({ 
    storage: mediaStorage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB per file
    }
});
// Lấy danh sách tất cả câu hỏi
router.get('/', questionController.getAllQuestions);

// Lấy thông tin chi tiết một câu hỏi
// Đặt route cụ thể trước
router.get('/bylos', questionController.getQuestionsByLOs);

// Sau đó mới đến route động (cần auth để phân biệt student/teacher)
router.get('/:id', authenticateToken, questionController.getQuestionById);

// Tạo một câu hỏi mới
router.post('/', authenticateToken, authorize(['teacher', 'admin']), questionController.createQuestion);

// Cập nhật thông tin một câu hỏi
router.put('/:id', authenticateToken, authorize(['teacher', 'admin']), questionController.updateQuestion);

// Xóa nhiều câu hỏi (bulk delete) - PHẢI ĐẶT TRƯỚC /:id
router.delete('/bulk', authenticateToken, authorize(['teacher', 'admin']), questionController.bulkDeleteQuestions);

// Xóa một câu hỏi
router.delete('/:id', authenticateToken, authorize(['teacher', 'admin']), questionController.deleteQuestion);

// =====================================================
// MEDIA UPLOAD ROUTES (NEW)
// =====================================================

// Batch upload media files
router.post('/batch-upload-media', 
    authenticateToken, 
    authorize(['teacher', 'admin']), 
    uploadMedia.array('media_files', 50), // Max 50 files
    handleMulterError,
    questionController.batchUploadMedia
);

// Serve temp media file
router.get('/temp-media/:filename', 
    questionController.serveTempMedia
);

// =====================================================
// IMPORT ROUTES
// =====================================================

// Import from ZIP file (Excel + Media) - EASIEST FOR USERS ⭐⭐⭐
router.post('/import-from-zip', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    upload.single('zip_file'),
    handleMulterError, 
    questionController.importFromZip
);

// Import questions with media support - ALL IN ONE (ADVANCED)
router.post('/import-all-in-one', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    uploadMedia.fields([
        { name: 'excel_file', maxCount: 1 },
        { name: 'media_files', maxCount: 50 }
    ]),
    handleMulterError, 
    questionController.importAllInOne
);

// Import questions with media support - TWO STEPS (OLD WAY)
router.post('/import-excel-with-media', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    upload.single('file'), 
    handleMulterError, 
    questionController.importQuestionsWithMedia
);

// Existing import routes
router.post('/import', upload.single('file'), handleMulterError, questionController.importQuestionsFromCSV);
router.post('/import-excel', upload.single('file'), handleMulterError, questionController.importQuestionsFromExcel);
router.post('/import-advanced', upload.single('file'), handleMulterError, questionController.importQuestionsAdvanced);

module.exports = router;