const fs = require('fs');
const path = require('path');
const { Answer, MediaFile, sequelize } = require('../models');

module.exports = {
  async list(req, res){
    try {
      const answerId = req.params.answerId;
      const answer = await Answer.findByPk(answerId, { include: [{ model: MediaFile, as: 'MediaFiles' }] });
      if (!answer) return res.status(404).json({ message: 'Answer not found' });
      const files = answer.MediaFiles.map(m => ({ ...m.toJSON(), file_url: m.getFileUrl() }));
      return res.json({ data: files });
    } catch(err){
      console.error('Answer media list error', err); return res.status(500).json({ message: 'Internal error' });
    }
  },
  async upload(req, res){
    const t = await sequelize.transaction();
    try {
      const answerId = req.params.answerId;
      const answer = await Answer.findByPk(answerId);
      if (!answer) { await t.rollback(); return res.status(404).json({ message: 'Answer not found' }); }
      if (!req.file) { await t.rollback(); return res.status(400).json({ message: 'No file uploaded' }); }

      const file = req.file;
      const mime = file.mimetype;
      let fileType;
      if (mime.startsWith('image/')) fileType='image';
      else if (mime.startsWith('audio/')) fileType='audio';
      else if (mime.startsWith('video/')) fileType='video';
      else fileType='document';

      MediaFile.validateFile(file, fileType);

      const storageDir = path.join(process.cwd(), 'uploads', 'answers', String(answerId));
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const safeName = Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_');
      const destPath = path.join(storageDir, safeName);
      fs.writeFileSync(destPath, file.buffer);

      const media = await MediaFile.create({
        question_id: answer.question_id,
        owner_type: 'answer',
        answer_id: answer.answer_id,
        file_type: fileType,
        file_name: safeName,
        file_path: destPath,
        file_size: file.size,
        mime_type: mime,
        alt_text: req.body.alt_text || null,
        description: req.body.description || null
      }, { transaction: t });

      await t.commit();
      return res.status(201).json({ message: 'Uploaded', data: { ...media.toJSON(), file_url: media.getFileUrl ? media.getFileUrl() : null } });
    } catch(err){
      console.error('Answer media upload error', err);
      try { if (!t.finished) await t.rollback(); } catch(e) {}
      return res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  },
  async remove(req, res){
    try {
      const { answerId, mediaId } = req.params;
      const media = await MediaFile.findOne({ where:{ media_id: mediaId, answer_id: answerId, owner_type:'answer' } });
      if (!media) return res.status(404).json({ message: 'Media not found' });
      if (fs.existsSync(media.file_path)) fs.unlinkSync(media.file_path);
      await media.destroy();
      return res.json({ message: 'Deleted' });
    } catch(err){
      console.error('Answer media delete error', err); return res.status(500).json({ message: 'Delete failed' });
    }
  },
  async serve(req,res){
    try {
      const { answerId, filename } = req.params;
      const media = await MediaFile.findOne({ where:{ answer_id: answerId, file_name: filename, owner_type:'answer' } });
      if (!media) return res.status(404).json({ message:'Not found' });
      return res.sendFile(media.file_path);
    } catch(err){
      console.error('Serve answer media error', err); return res.status(500).json({ message:'Internal error' });
    }
  }
};