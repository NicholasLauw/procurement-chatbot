const express = require('express');
const multer  = require('multer');
const fs      = require('fs-extra');
const path    = require('path');
const router  = express.Router();

const { requireAuth }        = require('../middleware/authMiddleware');
const { extractFromTickets } = require('../services/geminiService');
const { appendItemsToSheet } = require('../services/googleSheetsService');

// Multer — store uploaded files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .txt and .pdf files are allowed'));
  }
});

/**
 * POST /api/extract
 * Accept ticket text (paste) or file upload, extract items with AI,
 * return preview without writing to sheet yet.
 */
router.post('/extract', requireAuth, upload.single('file'), async (req, res) => {
  try {
    let ticketText = '';

    if (req.file) {
      // Handle file upload
      if (req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf')) {
        const pdfParse = require('pdf-parse');
        const parsed   = await pdfParse(req.file.buffer);
        ticketText     = parsed.text;
      } else {
        ticketText = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.ticketText) {
      ticketText = req.body.ticketText;
    } else {
      return res.status(400).json({ error: 'No ticket text or file provided' });
    }

    if (!ticketText.trim()) {
      return res.status(400).json({ error: 'Ticket content is empty' });
    }

    const result = await extractFromTickets(ticketText);
    res.json(result);

  } catch (err) {
    console.error('Extract error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/submit
 * Write confirmed items to Google Sheets.
 */
router.post('/submit', requireAuth, async (req, res) => {
  const { items } = req.body;
  const user = req.session.user;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'No items to submit' });
  }

  try {
    const result = await appendItemsToSheet(items, user.name);
    res.json(result);
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Failed to write to Google Sheets: ' + err.message });
  }
});

module.exports = router;
