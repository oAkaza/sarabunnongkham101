// routes/upload.js
const express = require('express');
const multer = require('multer');
const { uploadBufferToDrive } = require('../services/googleDrive');

const router = express.Router();

// เก็บไฟล์ในหน่วยความจำ (ไม่เขียนลงดิสก์บน Render)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// POST /files/upload  ฟิลด์ไฟล์ชื่อ "pdf"
router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

    // อัปขึ้น Google Drive
    const result = await uploadBufferToDrive({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype || 'application/pdf',
    });

    // ส่งข้อมูลไฟล์กลับให้ client (เก็บลง DB ต่อได้)
    return res.json({
      ok: true,
      id: result.id,
      name: result.name,
      viewLink: result.webViewLink,
      downloadLink: result.webContentLink,
    });
  } catch (err) {
    console.error('Upload failed:', err?.response?.data || err);
    return res.status(500).json({ ok: false, error: 'Upload failed' });
  }
});

module.exports = router;
