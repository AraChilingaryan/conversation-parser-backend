import { Request, Response } from 'express';
import { processingService } from '../services/processing.service';
import { databaseService } from '../services/database.service';
import { logger } from '../utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import type { APIResponse } from '../interfaces/api.interface';

/**
 * Background processing function - handles async conversation processing
 */
async function processConversationInBackground(conversationId: string): Promise<void> {
    try {
        logger.info(`Starting background processing for conversation: ${conversationId}`);
        await processingService.processConversation(conversationId);
        logger.info(`Background processing completed for conversation: ${conversationId}`);
    } catch (error) {
        logger.error(`Background processing failed for conversation ${conversationId}:`, error);
        // Error handling is already done in processingService.processConversation
    }
}

/**
 * Manually trigger conversation processing (for testing/admin use)
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

        // Check if conversation exists and is in correct status
        const conversation = await databaseService.conversations.findById(conversationId);
        if (!conversation) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'CONVERSATION_NOT_FOUND',
                    message: 'Conversation not found',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        if (conversation.status !== 'uploaded') {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_STATUS',
                    message: `Conversation status is '${conversation.status}', expected 'uploaded'`,
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Start processing in background (don't await)
        processConversationInBackground(conversationId);

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
 * Get processing progress for specific conversation
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
        const stats = await databaseService.conversations.getProcessingStats();

        res.json({
            success: true,
            data: {
                processingStats: stats,
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
