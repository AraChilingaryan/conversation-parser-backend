import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger.util';

/**
 * Handle multer upload errors
 */
export const handleUploadError = (error: any, req: Request, res: Response, next: NextFunction): void => {
    if (error instanceof multer.MulterError) {
        logger.warn('File upload error:', error);

        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'FILE_TOO_LARGE',
                        message: 'File size exceeds the maximum allowed limit of 100MB',
                        timestamp: new Date().toISOString()
                    }
                });
                return;

            case 'LIMIT_FILE_COUNT':
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'TOO_MANY_FILES',
                        message: 'Only one audio file is allowed per upload',
                        timestamp: new Date().toISOString()
                    }
                });
                return;

            case 'LIMIT_UNEXPECTED_FILE':
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'UNEXPECTED_FILE',
                        message: 'Unexpected file field. Use "audio" field name for file uploads',
                        timestamp: new Date().toISOString()
                    }
                });
                return;

            default:
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'UPLOAD_ERROR',
                        message: `File upload error: ${error.message}`,
                        timestamp: new Date().toISOString()
                    }
                });
                return;
        }
    }

    if (error.message && error.message.includes('Unsupported file type')) {
        res.status(400).json({
            success: false,
            error: {
                code: 'UNSUPPORTED_FILE_TYPE',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        });
        return;
    }

    next(error);
};

/**
 * Validate request parameters
 */
export const validateConversationId = (req: Request, res: Response, next: NextFunction): void => {
    const { conversationId } = req.params;

    if (!conversationId) {
        res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_CONVERSATION_ID',
                message: 'Conversation ID is required',
                timestamp: new Date().toISOString()
            }
        });
        return;
    }

    // Basic UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
        res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_CONVERSATION_ID',
                message: 'Conversation ID must be a valid UUID',
                timestamp: new Date().toISOString()
            }
        });
        return;
    }

    next();
};

/**
 * Rate limiting middleware for uploads
 */
export const uploadRateLimit = (req: Request, res: Response, next: NextFunction): void => {
    // This is a placeholder for rate limiting logic
    // In production, you'd use express-rate-limit or similar

    const userIP = req.ip;
    const currentTime = Date.now();

    // For now, just log the upload attempt
    logger.info(`Upload attempt from IP: ${userIP} at ${new Date(currentTime).toISOString()}`);

    next();
};
