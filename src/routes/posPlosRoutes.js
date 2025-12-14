const express = require('express');
const router = express.Router();
const posPlosController = require('../controllers/posPlosController');

router.get('/', posPlosController.getAllPOsPLOs);
router.get('/:po_id/:plo_id', posPlosController.getPOsPLOsById);
router.post('/', posPlosController.createPOsPLOs);
router.delete('/:po_id/:plo_id', posPlosController.deletePOsPLOs);

module.exports = router;