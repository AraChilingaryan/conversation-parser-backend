// src/controllers/processing.controller.ts

import { Request, Response } from 'express';
import { processingService } from '../services/processing.service';
import { recordingRepository } from '../repositories/recording.repository';
import { logger } from '../utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import type { APIResponse } from '../interfaces/api.interface';

/**
 * Process recording into conversation (new endpoint for recording-based processing)
 */
export const processRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { recordingId } = req.params;

        if (!recordingId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_RECORDING_ID',
                    message: 'Recording ID is required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Check if recording exists
        const recording = await recordingRepository.findById(recordingId);
        if (!recording) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'RECORDING_NOT_FOUND',
                    message: 'Recording not found',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Check if recording is already processed
        if (recording.processed || recording.conversationId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'ALREADY_PROCESSED',
                    message: 'Recording has already been processed',
                    timestamp: new Date().toISOString(),
                    details: {
                        conversationId: recording.conversationId,
                        processedAt: recording.updatedAt
                    }
                }
            } as APIResponse);
            return;
        }

        // Check if recording is in correct status
        if (recording.transcriptionStatus !== 'pending') {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_STATUS',
                    message: `Recording status is '${recording.transcriptionStatus}', expected 'pending'`,
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        logger.info(`Starting recording processing: ${recordingId}`);

        // Update recording status to processing
        await recordingRepository.updateProcessingStatus(recordingId, 'processing');

        try {
            // Process recording synchronously (for now)
            const result = await processingService.processRecording(recordingId);

            logger.info(`Recording processing completed: ${recordingId} -> conversation: ${result.conversationId}`);

            res.json({
                success: true,
                data: {
                    recordingId,
                    conversationId: result.conversationId,
                    message: 'Recording processed successfully',
                    processingStatus: 'completed',
                    conversation: result.conversation
                },
                metadata: {
                    requestId: uuidv4(),
                    timestamp: new Date().toISOString(),
                    processingTime: result.processingTime,
                    version: '1.0.0',
                    source: 'recording_processor'
                }
            } as APIResponse);

        } catch (processingError) {
            // Update recording status to failed
            await recordingRepository.updateProcessingStatus(recordingId, 'failed');

            logger.error(`Recording processing failed: ${recordingId}`, processingError);

            res.status(500).json({
                success: false,
                error: {
                    code: 'PROCESSING_FAILED',
                    message: processingError instanceof Error ? processingError.message : 'Unknown processing error',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
        }

    } catch (error) {
        logger.error('Error in recording processing controller:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'CONTROLLER_ERROR',
                message: 'Internal server error processing recording',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Get recording processing progress
 */
export const getRecordingProgress = async (req: Request, res: Response): Promise<void> => {
    try {
        const { recordingId } = req.params;

        if (!recordingId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_RECORDING_ID',
                    message: 'Recording ID is required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        const recording = await recordingRepository.findById(recordingId);
        if (!recording) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'RECORDING_NOT_FOUND',
                    message: 'Recording not found',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Convert recording status to progress info
        const progress = {
            recordingId,
            status: recording.transcriptionStatus,
            processed: recording.processed,
            conversationId: recording.conversationId,
            progress: {
                stage: recording.transcriptionStatus,
                percentage: recording.transcriptionStatus === 'completed' ? 100 :
                    recording.transcriptionStatus === 'processing' ? 50 :
                        recording.transcriptionStatus === 'failed' ? 0 : 0,
                message: getProgressMessage(recording.transcriptionStatus)
            }
        };

        res.json({
            success: true,
            data: progress,
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('Error getting recording progress:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get recording progress',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Legacy conversation processing endpoint (keep for backward compatibility)
 */
export const triggerProcessing = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        if (!conversationId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_CONVERSATION_ID',
                    message: 'Conversation ID is required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // This is the legacy endpoint for existing uploaded conversations
        // Keep the existing logic for backward compatibility
        const result = await processingService.processConversation(conversationId);

        res.json({
            success: true,
            data: {
                conversationId,
                message: 'Processing started successfully',
                status: 'processing'
            },
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('Error triggering processing:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to trigger processing',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Get processing progress for specific conversation (legacy)
 */
export const getProcessingProgress = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;

        if (!conversationId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_CONVERSATION_ID',
                    message: 'Conversation ID is required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        const progress = await processingService.getProcessingProgress(conversationId);

        res.json({
            success: true,
            data: {
                conversationId,
                progress
            },
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);
    } catch (error) {
        logger.error('Error getting processing progress:', error);

        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'CONVERSATION_NOT_FOUND',
                    message: error.message,
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get processing progress',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Get processing queue status
 */
export const getProcessingStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        // Get statistics about current processing state
        res.json({
            success: true,
            data: {
                queueStatus: 'active',
                message: 'Processing queue is active'
            },
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);
    } catch (error) {
        logger.error('Error getting processing status:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get processing status',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

// Helper function
function getProgressMessage(status: string): string {
    const messages: Record<string, string> = {
        pending: 'Recording ready for processing',
        processing: 'Converting speech to text...',
        completed: 'Processing completed successfully',
        failed: 'Processing failed'
    };
    return messages[status] || 'Unknown status';
}
