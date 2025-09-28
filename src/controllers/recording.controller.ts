// src/controllers/conversation.controller.ts

import {Request, Response} from 'express';
import {v4 as uuidv4} from 'uuid';
import {storageService} from '../services/storage.service';
import {audioValidationService} from '../services/audio-validation.service';
import {recordingRepository} from '../repositories/recording.repository';
import {logger} from '../utils/logger.util';
import type {Recording} from '../interfaces/user.interface';
import type {UploadConversationRequest, UploadConversationResponse} from '../interfaces/conversation.interface';
import type {APIResponse} from '../interfaces/api.interface';

/**
 * Upload recording audio file and create Recording object
 */
export const uploadRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const audioFile = req.file;
        const {
            title,
            description,
            userId // This should come from the mobile app
        }: UploadConversationRequest & { userId: string } = req.body;

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

        // Validate userId (required for Recording)
        if (!userId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_USER_ID',
                    message: 'User ID is required',
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

        // Generate recording ID
        const recordingId = uuidv4();
        const timestamp = new Date().toISOString();

        // Upload file to storage
        logger.info(`Uploading audio file for recording: ${recordingId}`);
        const uploadResult = await storageService.uploadAudioFile(recordingId, {
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

        // Create GCS URL for the uploaded file
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.GOOGLE_CLOUD_PROJECT_ID}.appspot.com`;
        const fileExtension = getFileExtension(audioFile.originalname, audioFile.mimetype);
        // const gcsUrl = `gs://${bucketName}/recordings/${recordingId}/audio/original${fileExtension}`;
        const gcsUrl = `${bucketName}/${uploadResult.file?.storageKey}`;

        // Create recording record (similar to Twilio flow)
        const recording: Omit<Recording, 'id' | 'createdAt' | 'updatedAt'> = {
            userId,

            // Generate synthetic call data for uploaded files
            callSid: `UL${recordingId}`, // UL = Upload prefix
            recordingSid: `RE${recordingId}`,
            recordingUrl: gcsUrl, // Use GCS URL instead of Twilio URL
            recordingDuration: validationResult.metadata.duration,

            // Call details (synthetic for uploads)
            fromNumber: 'upload', // Indicate this was uploaded
            toNumber: 'upload',
            callDirection: 'inbound',
            callStartTime: timestamp,
            callEndTime: new Date(Date.now() + (validationResult.metadata.duration * 1000)).toISOString(),
            callStatus: 'completed',
            callDuration: validationResult.metadata.duration,

            // Processing status
            processed: false,
            transcriptionStatus: 'pending',
            conversationId: undefined,

            // Billing (no cost for uploads)
            callPrice: 0,
            callPriceUnit: 'USD',

            // Metadata (consistent with Twilio structure)
            metadata: {
                twilioAccountSid: 'upload', // Indicate this is an upload
                callDirection: 'upload',
                parentCallSid: undefined,
                // Additional upload-specific fields
                originalFileName: audioFile.originalname,
                fileSize: audioFile.size,
                uploadedTitle: title || `Recording ${new Date().toLocaleDateString()}`,
                uploadedDescription: description || '',
                source: 'upload'
            },

            // Flags
            deleted: false
        };

        // Store recording in Firebase using repository
        const createdRecordingId = await recordingRepository.createRecording(recording);

        logger.info(`Recording created successfully: ${createdRecordingId}`);

        // Return response (using UploadConversationResponse for backward compatibility, but it's really a recording response)
        const response: UploadConversationResponse = {
            recordingId: createdRecordingId, // Return recording ID as conversationId for compatibility
            status: 'uploaded',
            message: 'Audio file uploaded successfully. Ready for processing.',
            estimatedProcessingTime: Math.ceil(validationResult.metadata.duration * 2),
            statusCheckUrl: `/api/v1/recordings/${createdRecordingId}/progress`,
            originalFileName: audioFile.originalname,
            fileSize: audioFile.size
        };

        res.status(201).json({
            success: true,
            data: {
                ...response,
                recordingId: createdRecordingId, // Also include recordingId
                type: 'upload', // Indicate this was an upload vs Twilio
                processingEndpoint: `/api/v1/recordings/${createdRecordingId}/process`
            },
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - new Date(timestamp).getTime(),
                version: '1.0.0',
                source: 'file_upload'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('Error uploading recording:', error);

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
 * Get recording by ID (for uploaded recordings)
 */
export const getRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const {recordingId} = req.params;

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

        res.json({
            success: true,
            data: recording,
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('Error getting recording:', error);

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
 * List user recordings (for mobile app)
 */
export const listUserRecordings = async (req: Request, res: Response): Promise<void> => {
    try {
        const {userId} = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        if (!userId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_USER_ID',
                    message: 'User ID is required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        const recordings = await recordingRepository.findByUserId(userId, {limit, offset: (page - 1) * limit});

        res.json({
            success: true,
            data: {
                recordings,
                pagination: {
                    currentPage: page,
                    itemsPerPage: limit,
                    hasMore: recordings.length === limit
                }
            },
            metadata: {
                requestId: uuidv4(),
                timestamp: new Date().toISOString(),
                processingTime: 0,
                version: '1.0.0'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('Error listing user recordings:', error);

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
function getFileExtension(originalName: string, mimeType: string): string {
    // Try to get extension from filename first
    const nameExtension = originalName.split('.').pop()?.toLowerCase();
    if (nameExtension && ['wav', 'mp3', 'm4a', 'webm', 'ogg'].includes(nameExtension)) {
        return `.${nameExtension}`;
    }

    // Fallback to mime type
    const mimeToExtension: Record<string, string> = {
        'audio/wav': '.wav',
        'audio/wave': '.wav',
        'audio/mp3': '.mp3',
        'audio/mpeg': '.mp3',
        'audio/m4a': '.m4a',
        'audio/webm': '.webm',
        'audio/ogg': '.ogg'
    };

    return mimeToExtension[mimeType.toLowerCase()] || '.wav';
}

function getAudioFormat(mimeType: string): 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg' | 'mpeg' {
    const mimeToFormat: Record<string, 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg' | 'mpeg'> = {
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'audio/m4a': 'm4a',
        'audio/mp4': 'm4a',
        'audio/webm': 'webm',
        'audio/ogg': 'ogg'
    };

    return mimeToFormat[mimeType.toLowerCase()] || 'mp3';
}

function getRecordingProgress(recording: Recording) {
    const progressMap = {
        'pending': {percentage: 0, stage: 'pending', message: 'Recording ready for processing'},
        'processing': {percentage: 50, stage: 'processing', message: 'Converting recording to conversation...'},
        'completed': {percentage: 100, stage: 'completed', message: 'Recording processed successfully'},
        'failed': {percentage: 0, stage: 'failed', message: 'Recording processing failed'}
    };

    const progress = progressMap[recording.transcriptionStatus] || progressMap['pending'];

    return {
        stage: progress.stage,
        percentage: progress.percentage,
        currentStep: progress.message,
        stepsCompleted: recording.transcriptionStatus === 'completed' ? 5 :
            recording.transcriptionStatus === 'processing' ? 3 : 1,
        totalSteps: 5
    };
}

function getStageDescription(stage: string): string {
    const descriptions: Record<string, string> = {
        pending: 'Ready for processing',
        processing: 'Converting recording to conversation',
        completed: 'Processing completed successfully',
        failed: 'Processing failed'
    };

    return descriptions[stage] || 'Processing';
}
