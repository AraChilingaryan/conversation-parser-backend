// src/routes/conversation.routes.ts

import { Router } from 'express';
import multer from 'multer';
import {
    uploadRecording,
    getConversation,
    getConversationStatus,
    listConversations, resetConversationStatus
} from '../controllers/conversation.controller';

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

/**
 * @route POST /api/v1/conversations/upload
 * @desc Upload conversation audio file
 * @access Public
 */
router.post('/upload', upload.single('audio'), uploadRecording);

/**
 * @route GET /api/v1/conversations
 * @desc List conversations with pagination and filters
 * @access Public
 */
router.get('/', listConversations);

/**
 * @route GET /api/v1/conversations/:conversationId
 * @desc Get conversation by ID
 * @access Public
 */
router.get('/:conversationId', getConversation);

/**
 * @route GET /api/v1/conversations/:conversationId/status
 * @desc Get conversation processing status
 * @access Public
 */
router.get('/:conversationId/status', getConversationStatus);

router.get('/:conversationId/reset', resetConversationStatus);

export { router as conversationRoutes };
