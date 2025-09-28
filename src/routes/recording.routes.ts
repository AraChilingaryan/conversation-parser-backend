// src/routes/recording.routes.ts

import {Router} from 'express';
import multer from 'multer';
import {getRecording, listUserRecordings, uploadRecording,} from '../controllers/recording.controller';
import {processRecording} from '../controllers/processing.controller';

const router = Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'audio/wav',
            'audio/wave',
            'audio/mp3',
            'audio/mpeg',
            'audio/m4a',
            'audio/mp4',
            'audio/webm',
            'audio/ogg'
        ];

        if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`));
        }
    }
});

// ============================================================================
// RECORDING ENDPOINTS (New unified approach)
// ============================================================================

/**
 * @route POST /api/v1/conversations/upload
 * @desc Upload recording audio file and create Recording object
 * @access Public
 * @body { userId: string, title?: string, description?: string, language?: string }
 * @file audio (multipart/form-data)
 */
router.post('/upload', upload.single('audio'), uploadRecording);

/**
 * @route GET /api/v1/conversations/recordings/:recordingId
 * @desc Get recording by ID
 * @access Public
 */
router.get('/recordings/:recordingId', getRecording);

/**
 * @route GET /api/v1/conversations/users/:userId/recordings
 * @desc List all recordings for a user
 * @access Public
 * @query { page?: number, limit?: number }
 */
router.get('/users/:userId/recordings', listUserRecordings);

/**
 * @route POST /api/v1/conversations/recordings/:recordingId/process
 * @desc Process recording into conversation (works for both Twilio and uploaded recordings)
 * @access Public
 */
router.post('/recordings/:recordingId/process', processRecording);

export {router as recordingRoutes};
