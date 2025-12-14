const { POsPLOs, PO, PLO } = require('../models');

exports.getAllPOsPLOs = async (req, res) => {
    try {
        const posPlos = await POsPLOs.findAll({
            include: [
                { model: PO, attributes: ['po_id', 'name', 'description'] },
                { model: PLO, attributes: ['plo_id', 'name' ,'description'] },
            ],
        });

        res.status(200).json({success: true, data: posPlos});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy danh sách POs_PLOs', error: error.message });
    }
};

exports.getPOsPLOsById = async (req, res) => {
    try {
        const { po_id, plo_id } = req.params;

        const posPlos = await POsPLOs.findOne({
            where: { po_id, plo_id },
            include: [
                { model: PO, attributes: ['po_id', 'name'] },
                { model: PLO, attributes: ['plo_id', 'description'] },
            ],
        });

        if (!posPlos) return res.status(404).json({success: false, message: 'POsPLOs không tồn tại' });
        res.status(200).json({success: true, data: posPlos});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy thông tin POsPLOs', error: error.message });
    }
};

exports.createPOsPLOs = async (req, res) => {
    try {
        const { po_id, plo_id } = req.body;

        if (!po_id || !plo_id) {
            return res.status(400).json({success: false, message: 'Thiếu các trường bắt buộc' });
        }

        const po = await PO.findByPk(po_id);
        const plo = await PLO.findByPk(plo_id);

        if (!po) return res.status(400).json({success: false, message: 'PO không tồn tại' });
        if (!plo) return res.status(400).json({success: false, message: 'PLO không tồn tại' });

        const newPOsPLOs = await POsPLOs.create({ po_id, plo_id });
        res.status(201).json({success: true, data: newPOsPLOs});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo POsPLOs', error: error.message });
    }
};

exports.deletePOsPLOs = async (req, res) => {
    try {
        const { po_id, plo_id } = req.params;

        const posPlos = await POsPLOs.findOne({ where: { po_id, plo_id } });
        if (!posPlos) return res.status(404).json({success: false, message: 'POsPLOs không tồn tại' });

        await posPlos.destroy();
        res.status(200).json({success: true, data: {message: 'Xóa POsPLOs thành công' }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi xóa POsPLOs', error: error.message });
    }
};