import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Ensure upload directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Retain original name, append timestamp to prevent name collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// @desc    Upload file
// @route   POST /api/upload
// @access  Private
router.post('/', protect, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Return the relative URL from the server root
    const fileUrl = `/uploads/${req.file.filename}`;

    res.status(201).json({
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
