const multer = require('multer');
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        console.log('Received fields:', req.body);
        console.log('Received files:', req.file);
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ message: 'Field không hợp lệ, hãy sử dụng field "file" để tải lên file CSV' });
        }
        return res.status(400).json({ message: err.message });
    }
    next(err);
};

module.exports = handleMulterError;