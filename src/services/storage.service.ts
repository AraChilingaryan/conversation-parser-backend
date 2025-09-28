// src/services/storage.service.ts

import { databaseConfig } from '../config/database.config';
import { logger } from '../utils/logger.util';
import type { AudioFile, StorageUploadResult, StoredAudioFile } from '../interfaces/audio.interface';

/**
 * Storage service for handling audio file uploads to Google Cloud Storage
 */
export class StorageService {
    private static instance: StorageService;

    private constructor() {}

    static getInstance(): StorageService {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }

    /**
     * Upload audio file to Google Cloud Storage
     */
    async uploadAudioFile(recordingId: string, audioFile: AudioFile): Promise<StorageUploadResult> {
        try {
            const storage = databaseConfig.storage;
            const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);

            // Generate storage path
            const fileExtension = this.getFileExtension(audioFile.originalName, audioFile.mimeType);
            const storageKey = `recordings/${recordingId}/audio/original${fileExtension}`;

            // Create file reference
            const file = bucket.file(storageKey);

            // Upload file with metadata
            const stream = file.createWriteStream({
                metadata: {
                    contentType: audioFile.mimeType,
                    metadata: {
                        recordingId: recordingId,
                        originalName: audioFile.originalName,
                        uploadedAt: new Date().toISOString(),
                        fileSize: audioFile.size.toString(),
                        duration: audioFile.duration?.toString() || '0',
                        sampleRate: audioFile.sampleRate?.toString() || '0',
                        channels: audioFile.channels?.toString() || '1'
                    }
                },
                resumable: audioFile.size > 5 * 1024 * 1024, // Use resumable for files > 5MB
                validation: 'crc32c' // Enable integrity checking
            });

            return new Promise((resolve) => {
                stream.on('error', (error) => {
                    logger.error('Error uploading file to storage:', error);
                    resolve({
                        success: false,
                        error: {
                            code: 'UPLOAD_ERROR',
                            message: error.message
                        }
                    });
                });

                stream.on('finish', async () => {
                    try {

                        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storageKey}`;

                        const storedFile: StoredAudioFile = {
                            id: `${recordingId}-original`,
                            recordingId,
                            originalName: audioFile.originalName,
                            storageKey,
                            url: publicUrl,
                            size: audioFile.size,
                            uploadedAt: new Date(),
                            metadata: {
                                format: this.getAudioFormat(audioFile.mimeType),
                                duration: audioFile.duration || 0,
                                sampleRate: audioFile.sampleRate || 0,
                                channels: audioFile.channels || 1,
                                bitrate: 0, // Will be detected during processing
                                codec: '',
                                size: audioFile.size
                            }
                        };

                        logger.info(`File uploaded successfully: ${storageKey}`);

                        resolve({
                            success: true,
                            file: storedFile
                        });

                    } catch (error) {
                        logger.error('Error making file public:', error);
                        resolve({
                            success: false,
                            error: {
                                code: 'POST_UPLOAD_ERROR',
                                message: error instanceof Error ? error.message : 'Unknown post-upload error'
                            }
                        });
                    }
                });

                // Write the file buffer
                stream.end(audioFile.buffer);
            });

        } catch (error) {
            logger.error('Storage service error:', error);
            return {
                success: false,
                error: {
                    code: 'STORAGE_SERVICE_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown storage error'
                }
            };
        }
    }

    /**
     * Get signed URL for temporary access to file
     */
    async getSignedUrl(conversationId: string, fileName: string, expirationMinutes = 60): Promise<string | null> {
        try {
            const storage = databaseConfig.storage;
            const bucket = storage.bucket();
            const file = bucket.file(`conversations/${conversationId}/audio/${fileName}`);

            const [exists] = await file.exists();
            if (!exists) {
                logger.warn(`File not found: conversations/${conversationId}/audio/${fileName}`);
                return null;
            }

            const options = {
                version: 'v4' as const,
                action: 'read' as const,
                expires: Date.now() + expirationMinutes * 60 * 1000, // Convert minutes to milliseconds
            };

            const [signedUrl] = await file.getSignedUrl(options);
            return signedUrl;

        } catch (error) {
            logger.error('Error generating signed URL:', error);
            return null;
        }
    }

    /**
     * Delete audio file from storage
     */
    async deleteAudioFile(conversationId: string, fileName: string): Promise<boolean> {
        try {
            const storage = databaseConfig.storage;
            const bucket = storage.bucket();
            const file = bucket.file(`conversations/${conversationId}/audio/${fileName}`);

            const [exists] = await file.exists();
            if (!exists) {
                logger.warn(`File not found for deletion: conversations/${conversationId}/audio/${fileName}`);
                return true; // Consider it successful if file doesn't exist
            }

            await file.delete();
            logger.info(`File deleted successfully: conversations/${conversationId}/audio/${fileName}`);
            return true;

        } catch (error) {
            logger.error('Error deleting file:', error);
            return false;
        }
    }

    /**
     * Delete entire conversation folder
     */
    async deleteConversationFiles(conversationId: string): Promise<boolean> {
        try {
            const storage = databaseConfig.storage;
            const bucket = storage.bucket();

            // List all files in the conversation folder
            const [files] = await bucket.getFiles({
                prefix: `conversations/${conversationId}/`
            });

            if (files.length === 0) {
                logger.info(`No files found for conversation: ${conversationId}`);
                return true;
            }

            // Delete all files in parallel
            const deletePromises = files.map(file => file.delete());
            await Promise.all(deletePromises);

            logger.info(`Deleted ${files.length} files for conversation: ${conversationId}`);
            return true;

        } catch (error) {
            logger.error('Error deleting conversation files:', error);
            return false;
        }
    }

    /**
     * Check storage health
     */
    async getHealthStatus(): Promise<{ status: 'up' | 'down' | 'degraded'; error?: string }> {
        try {
            const storage = databaseConfig.storage;
            const bucket = storage.bucket();

            // Test bucket access
            const [exists] = await bucket.exists();

            if (!exists) {
                return {
                    status: 'down',
                    error: 'Storage bucket does not exist'
                };
            }

            return { status: 'up' };

        } catch (error) {
            return {
                status: 'down',
                error: error instanceof Error ? error.message : 'Unknown storage error'
            };
        }
    }

    // Helper methods

    private getFileExtension(originalName: string, mimeType: string): string {
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

    private getAudioFormat(mimeType: string): string {
        const mimeToFormat: Record<string, string> = {
            'audio/wav': 'wav',
            'audio/wave': 'wav',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/m4a': 'm4a',
            'audio/webm': 'webm',
            'audio/ogg': 'ogg'
        };

        return mimeToFormat[mimeType.toLowerCase()] || 'unknown';
    }
}

export const storageService = StorageService.getInstance();
