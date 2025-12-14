const express = require('express');
const router = express.Router();
const tienQuyetController = require('../controllers/tienQuyetController');

router.get('/', tienQuyetController.getAllTienQuyets);
router.get('/:subject_id/:prerequisite_subject_id', tienQuyetController.getTienQuyetById);
router.post('/', tienQuyetController.createTienQuyet);
router.delete('/:subject_id/:prerequisite_subject_id', tienQuyetController.deleteTienQuyet);

module.exports = router;