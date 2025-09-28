// src/routes/processing.routes.ts
import {Router} from 'express';
import { getRecordingProgress, processRecording } from '../controllers/processing.controller';

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

export {router as processingRoutes};
