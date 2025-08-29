// src/controllers/conversation.controller.ts

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../services/database.service';
import { storageService } from '../services/storage.service';
import { audioValidationService } from '../services/audio-validation.service';
import { logger } from '../utils/logger.util';
import type {
    ConversationData, ConversationStatus,
    UploadConversationRequest,
    UploadConversationResponse
} from '../interfaces/conversation.interface';
import type { APIResponse } from '../interfaces/api.interface';

/**
 * Upload conversation audio file
 */
export const uploadConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const audioFile = req.file;
        const { title, description, language = 'en-US' }: UploadConversationRequest = req.body;

        // Validate file upload
        if (!audioFile) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_FILE',
                    message: 'Audio file is required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Validate audio file
        const validationResult = await audioValidationService.validateAudioFile({
            buffer: audioFile.buffer,
            originalName: audioFile.originalname,
            mimeType: audioFile.mimetype,
            size: audioFile.size
        });

        if (!validationResult.isValid) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_AUDIO_FILE',
                    message: 'Audio file validation failed',
                    details: {
                        errors: validationResult.errors,
                        warnings: validationResult.warnings
                    },
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Generate conversation ID
        const conversationId = uuidv4();
        const timestamp = new Date().toISOString();

        // Upload file to storage
        logger.info(`Uploading audio file for conversation: ${conversationId}`);
        const uploadResult = await storageService.uploadAudioFile(conversationId, {
            buffer: audioFile.buffer,
            originalName: audioFile.originalname,
            mimeType: audioFile.mimetype,
            size: audioFile.size,
            duration: validationResult.metadata.duration,
            sampleRate: validationResult.metadata.sampleRate,
            channels: validationResult.metadata.channels
        });

        if (!uploadResult.success) {
            res.status(500).json({
                success: false,
                error: {
                    code: 'UPLOAD_FAILED',
                    message: 'Failed to upload audio file',
                    details: uploadResult.error,
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Create conversation record
        const conversationData: ConversationData = {
            conversationId,
            status: 'uploaded',
            metadata: {
                title: title || `Conversation ${new Date().toLocaleDateString()}`,
                description: description || '',
                duration: validationResult.metadata.duration,
                language,
                recordingDate: timestamp,
                processingDate: timestamp,
                confidence: 0, // Will be updated during processing
                fileSize: audioFile.size,
                originalFileName: audioFile.originalname,
                audioFormat: getAudioFormat(audioFile.mimetype)
            },
            speakers: [],
            messages: [],
            insights: {
                totalMessages: 0,
                questionCount: 0,
                responseCount: 0,
                statementCount: 0,
                averageMessageLength: 0,
                longestMessage: { messageId: '', length: 0 },
                conversationFlow: 'unknown',
                speakingTimeDistribution: []
            },
            createdAt: timestamp,
            updatedAt: timestamp,
            processingLog: [
                {
                    timestamp,
                    stage: 'upload',
                    message: 'Audio file uploaded successfully',
                    duration: Date.now() - new Date(timestamp).getTime()
                }
            ]
        };

        // Save to database
        await databaseService.conversations.createWithId(conversationId, conversationData);

        // Add processing log entry
        await databaseService.conversations.addProcessingLogEntry(conversationId, {
            timestamp: new Date().toISOString(),
            stage: 'validation',
            message: 'Audio file validated and stored',
            duration: validationResult.metadata.duration
        });

        logger.info(`Conversation created successfully: ${conversationId}`);

        // TODO: In next task, we'll trigger background processing here
        // await processingQueue.add('processConversation', { conversationId });

        const response: UploadConversationResponse = {
            conversationId,
            status: 'uploaded',
            message: 'Audio file uploaded successfully. Processing will begin shortly.',
            estimatedProcessingTime: Math.ceil(validationResult.metadata.duration * 2), // Rough estimate: 2x audio length
            statusCheckUrl: `/api/v1/conversations/${conversationId}/status`,
            originalFileName: audioFile.originalname,
            fileSize: audioFile.size
        };

        res.status(201).json({
            success: true,
            data: response,
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - new Date(timestamp).getTime(),
                version: '1.0.0'
            }
        } as APIResponse<UploadConversationResponse>);

    } catch (error) {
        logger.error('Error uploading conversation:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Internal server error during upload',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Get conversation by ID
 */
export const getConversation = async (req: Request, res: Response): Promise<void> => {
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

        res.json({
            success: true,
            data: conversation,
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse<ConversationData>);

    } catch (error) {
        logger.error('Error getting conversation:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Internal server error',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Get conversation status
 */
export const getConversationStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;

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

        const statusResponse = {
            conversationId,
            status: conversation.status,
            progress: getProcessingProgress(conversation),
            ...(conversation.status === 'completed' && { result: conversation }),
            ...(conversation.status === 'failed' && {
                error: {
                    code: 'PROCESSING_FAILED',
                    message: 'Conversation processing failed',
                    stage: getLastProcessingStage(conversation),
                    retryable: true
                }
            })
        };

        res.json({
            success: true,
            data: statusResponse,
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('Error getting conversation status:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Internal server error',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * List conversations with pagination and filters
 */
export const listConversations = async (req: Request, res: Response): Promise<void> => {
    try {
        const searchParams = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 20,
            sortBy: req.query.sortBy as string || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
            status: req.query.status as ConversationStatus | undefined,
            language: req.query.language as string,
            dateFrom: req.query.dateFrom as string,
            dateTo: req.query.dateTo as string,
            searchTerm: req.query.searchTerm as string
        };

        const result = await databaseService.conversations.findConversations(searchParams);

        res.json({
            success: true,
            data: result,
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('Error listing conversations:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Internal server error',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

// Helper functions
function getAudioFormat(mimeType: string): 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg' | 'mpeg' {
    const mimeToFormat: Record<string, 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg' | 'mpeg'> = {
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'audio/m4a': 'm4a',      // Add this
        'audio/mp4': 'm4a',      // Add this
        'audio/webm': 'webm',
        'audio/ogg': 'ogg'
    };

    return mimeToFormat[mimeType.toLowerCase()] || 'mp3';
}

function getProcessingProgress(conversation: ConversationData) {
    const stages = ['upload', 'validation', 'diarization', 'transcription', 'parsing', 'insights', 'completion'];
    const currentStageIndex = conversation.processingLog
        ? Math.max(...conversation.processingLog.map(log => stages.indexOf(log.stage)))
        : 0;

    const percentage = Math.round((currentStageIndex / stages.length) * 100);

    return {
        stage: stages[currentStageIndex] || 'upload',
        percentage,
        currentStep: getStageDescription(stages[currentStageIndex]),
        stepsCompleted: currentStageIndex,
        totalSteps: stages.length
    };
}

function getLastProcessingStage(conversation: ConversationData): string {
    if (!conversation.processingLog || conversation.processingLog.length === 0) {
        return 'upload';
    }

    return conversation.processingLog[conversation.processingLog.length - 1].stage;
}

function getStageDescription(stage: string): string {
    const descriptions: Record<string, string> = {
        upload: 'Uploading audio file',
        validation: 'Validating audio format',
        diarization: 'Identifying speakers',
        transcription: 'Converting speech to text',
        parsing: 'Parsing conversation structure',
        insights: 'Generating insights',
        completion: 'Processing complete'
    };

    return descriptions[stage] || 'Processing';
}
