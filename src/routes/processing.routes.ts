// src/routes/processing.routes.ts
import { Router } from 'express';
import {
    triggerProcessing,
    getProcessingProgress,
    getProcessingStatus, processRecording, getRecordingProgress
} from '../controllers/processing.controller';

const router = Router();

/**
 * @route POST /api/processing/conversations/:conversationId/process
 * @desc Manually trigger processing for a specific conversation
 * @access Admin/Testing
 */
router.post('/recordings/:recordingId/process', processRecording);

/**
 * @route GET /api/processing/conversations/:conversationId/progress
 * @desc Get processing progress for a specific conversation
 * @access Public
 */
router.get('/recordings/:recordingId/progress', getRecordingProgress);

/**
 * @route GET /api/processing/status
 * @desc Get overall processing queue status
 * @access Admin
 */
router.get('/status', getProcessingStatus);

export { router as processingRoutes };
