// src/services/audio-validation.service.ts

import { logger } from '../utils/logger.util';
import type {
    AudioFile,
    AudioValidationResult,
    AudioValidationError,
    AudioValidationWarning,
    AudioMetadata
} from '../interfaces/audio.interface';

/**
 * Audio validation service for validating uploaded audio files
 */
export class AudioValidationService {
    private static instance: AudioValidationService;

    // Default validation configuration
    private readonly config = {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        minFileSize: 1024, // 1KB
        maxDuration: 2 * 60 * 60, // 2 hours in seconds
        minDuration: 1, // 1 second
        allowedFormats: [
            'audio/wav', 'audio/wave',
            'audio/mp3', 'audio/mpeg',
            'audio/m4a', 'audio/mp4',
            'audio/webm',
            'audio/ogg'
        ],
        allowedExtensions: ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'mp4'],
        minSampleRate: 8000, // 8kHz
        maxChannels: 2 // Stereo
    };

    private constructor() {}

    static getInstance(): AudioValidationService {
        if (!AudioValidationService.instance) {
            AudioValidationService.instance = new AudioValidationService();
        }
        return AudioValidationService.instance;
    }

    /**
     * Validate audio file for conversation processing
     */
    async validateAudioFile(audioFile: AudioFile): Promise<AudioValidationResult> {
        const errors: AudioValidationError[] = [];
        const warnings: AudioValidationWarning[] = [];

        try {
            // Extract metadata from audio file
            const metadata = await this.extractAudioMetadata(audioFile);

            // Validate file size
            this.validateFileSize(audioFile.size, errors);

            // Validate file format
            this.validateFileFormat(audioFile.mimeType, audioFile.originalName, errors);

            // Validate audio properties
            this.validateAudioProperties(metadata, errors, warnings);

            // Add performance warnings
            this.addPerformanceWarnings(metadata, warnings);

            const isValid = errors.length === 0;

            if (isValid) {
                logger.debug(`Audio file validation passed: ${audioFile.originalName}`);
            } else {
                logger.warn(`Audio file validation failed: ${audioFile.originalName}`, { errors });
            }

            return {
                isValid,
                errors,
                warnings,
                metadata
            };

        } catch (error) {
            logger.error('Error during audio validation:', error);

            errors.push({
                code: 'VALIDATION_ERROR',
                message: 'Failed to validate audio file',
                field: 'file',
                value: audioFile.originalName,
                constraint: 'readable'
            });

            return {
                isValid: false,
                errors,
                warnings,
                metadata: this.getDefaultMetadata(audioFile)
            };
        }
    }

    /**
     * Extract metadata from audio file buffer
     * Note: This is a simplified version. In production, you might want to use
     * libraries like 'node-ffprobe' or 'music-metadata' for more accurate detection
     */
    private async extractAudioMetadata(audioFile: AudioFile): Promise<AudioMetadata> {
        try {
            // Basic metadata extraction based on file properties
            const metadata: AudioMetadata = {
                format: this.getFormatFromMimeType(audioFile.mimeType),
                duration: this.estimateDurationFromSize(audioFile.size, audioFile.mimeType),
                sampleRate: this.getDefaultSampleRate(audioFile.mimeType),
                channels: this.estimateChannelsFromSize(audioFile.size),
                size: audioFile.size,
                bitrate: this.estimateBitrate(audioFile.size, audioFile.mimeType)
            };

            // For WAV files, we can read header information
            if (audioFile.mimeType.includes('wav')) {
                const wavMetadata = this.parseWavHeader(audioFile.buffer);
                if (wavMetadata) {
                    metadata.sampleRate = wavMetadata.sampleRate;
                    metadata.channels = wavMetadata.channels;
                    metadata.duration = wavMetadata.duration;
                }
            }

            return metadata;

        } catch (error) {
            logger.warn('Could not extract detailed audio metadata, using defaults:', error);
            return this.getDefaultMetadata(audioFile);
        }
    }

    /**
     * Parse WAV file header to extract metadata
     */
    private parseWavHeader(buffer: Buffer): { sampleRate: number; channels: number; duration: number } | null {
        try {
            if (buffer.length < 44) return null;

            // Check for WAV file signature
            if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
                return null;
            }

            // Read WAV header fields
            const channels = buffer.readUInt16LE(22);
            const sampleRate = buffer.readUInt32LE(24);
            const byteRate = buffer.readUInt32LE(28);
            const bitsPerSample = buffer.readUInt16LE(34);

            // Calculate duration
            const dataSize = buffer.length - 44; // Simplified - assumes data chunk starts at byte 44
            const duration = dataSize / byteRate;

            return {
                sampleRate,
                channels,
                duration
            };

        } catch (error) {
            logger.debug('Could not parse WAV header:', error);
            return null;
        }
    }

    /**
     * Validate file size
     */
    private validateFileSize(size: number, errors: AudioValidationError[]): void {
        if (size > this.config.maxFileSize) {
            errors.push({
                code: 'FILE_TOO_LARGE',
                message: `File size ${this.formatFileSize(size)} exceeds maximum allowed size of ${this.formatFileSize(this.config.maxFileSize)}`,
                field: 'size',
                value: size,
                constraint: this.config.maxFileSize
            });
        }

        if (size < this.config.minFileSize) {
            errors.push({
                code: 'FILE_TOO_SMALL',
                message: `File size ${this.formatFileSize(size)} is below minimum required size of ${this.formatFileSize(this.config.minFileSize)}`,
                field: 'size',
                value: size,
                constraint: this.config.minFileSize
            });
        }
    }

    /**
     * Validate file format
     */
    private validateFileFormat(mimeType: string, fileName: string, errors: AudioValidationError[]): void {
        // Check MIME type
        if (!this.config.allowedFormats.includes(mimeType.toLowerCase())) {
            errors.push({
                code: 'UNSUPPORTED_FORMAT',
                message: `File format '${mimeType}' is not supported. Allowed formats: ${this.config.allowedFormats.join(', ')}`,
                field: 'mimeType',
                value: mimeType,
                constraint: this.config.allowedFormats
            });
        }

        // Check file extension
        const extension = fileName.split('.').pop()?.toLowerCase();
        if (extension && !this.config.allowedExtensions.includes(extension)) {
            errors.push({
                code: 'UNSUPPORTED_EXTENSION',
                message: `File extension '.${extension}' is not supported. Allowed extensions: ${this.config.allowedExtensions.join(', ')}`,
                field: 'extension',
                value: extension,
                constraint: this.config.allowedExtensions
            });
        }
    }

    /**
     * Validate audio properties
     */
    private validateAudioProperties(metadata: AudioMetadata, errors: AudioValidationError[], warnings: AudioValidationWarning[]): void {
        // Validate duration
        if (metadata.duration > this.config.maxDuration) {
            errors.push({
                code: 'DURATION_TOO_LONG',
                message: `Audio duration ${this.formatDuration(metadata.duration)} exceeds maximum allowed duration of ${this.formatDuration(this.config.maxDuration)}`,
                field: 'duration',
                value: metadata.duration,
                constraint: this.config.maxDuration
            });
        }

        if (metadata.duration < this.config.minDuration) {
            errors.push({
                code: 'DURATION_TOO_SHORT',
                message: `Audio duration ${this.formatDuration(metadata.duration)} is below minimum required duration of ${this.formatDuration(this.config.minDuration)}`,
                field: 'duration',
                value: metadata.duration,
                constraint: this.config.minDuration
            });
        }

        // Validate sample rate
        if (metadata.sampleRate < this.config.minSampleRate) {
            errors.push({
                code: 'SAMPLE_RATE_TOO_LOW',
                message: `Sample rate ${metadata.sampleRate}Hz is below minimum required ${this.config.minSampleRate}Hz`,
                field: 'sampleRate',
                value: metadata.sampleRate,
                constraint: this.config.minSampleRate
            });
        }

        // Validate channels
        if (metadata.channels > this.config.maxChannels) {
            errors.push({
                code: 'TOO_MANY_CHANNELS',
                message: `Audio has ${metadata.channels} channels, maximum allowed is ${this.config.maxChannels}`,
                field: 'channels',
                value: metadata.channels,
                constraint: this.config.maxChannels
            });
        }
    }

    /**
     * Add performance-related warnings
     */
    private addPerformanceWarnings(metadata: AudioMetadata, warnings: AudioValidationWarning[]): void {
        // Warn about low sample rate
        if (metadata.sampleRate < 16000) {
            warnings.push({
                code: 'LOW_SAMPLE_RATE',
                message: `Sample rate ${metadata.sampleRate}Hz is low. Higher sample rates (16kHz+) provide better transcription accuracy.`,
                recommendation: 'Consider re-recording at 16kHz or higher for optimal results.'
            });
        }

        // Warn about mono audio
        if (metadata.channels === 1) {
            warnings.push({
                code: 'MONO_AUDIO',
                message: 'Audio is mono (single channel). Stereo audio can help with speaker separation.',
                recommendation: 'Consider using stereo recording for better speaker identification.'
            });
        }

        // Warn about compressed formats
        if (metadata.format === 'mp3' || metadata.format === 'ogg') {
            warnings.push({
                code: 'COMPRESSED_FORMAT',
                message: `${metadata.format.toUpperCase()} is a compressed format which may affect transcription quality.`,
                recommendation: 'WAV or M4A formats typically provide better results.'
            });
        }

        // Warn about long duration
        if (metadata.duration > 30 * 60) { // 30 minutes
            warnings.push({
                code: 'LONG_DURATION',
                message: `Audio duration is ${this.formatDuration(metadata.duration)}. Long recordings may take significant time to process.`,
                recommendation: 'Consider breaking long recordings into shorter segments for faster processing.'
            });
        }

        // Warn about large file size
        if (metadata.size > 50 * 1024 * 1024) { // 50MB
            warnings.push({
                code: 'LARGE_FILE_SIZE',
                message: `File size is ${this.formatFileSize(metadata.size)}. Large files may take longer to upload and process.`,
                recommendation: 'Consider compressing the audio or reducing the sample rate if quality allows.'
            });
        }
    }

    // Helper methods for metadata estimation

    private getFormatFromMimeType(mimeType: string): string {
        const formatMap: Record<string, string> = {
            'audio/wav': 'wav',
            'audio/wave': 'wav',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/m4a': 'm4a',
            'audio/mp4': 'm4a',
            'audio/webm': 'webm',
            'audio/ogg': 'ogg'
        };
        return formatMap[mimeType.toLowerCase()] || 'unknown';
    }

    private estimateDurationFromSize(size: number, mimeType: string): number {
        // Rough estimation based on typical bitrates
        const estimatedBitrates: Record<string, number> = {
            'audio/wav': 1411, // 16-bit 44.1kHz stereo
            'audio/mp3': 128,
            'audio/m4a': 128,
            'audio/webm': 64,
            'audio/ogg': 96
        };

        const bitrate = estimatedBitrates[mimeType.toLowerCase()] || 128;
        const bitsPerSecond = bitrate * 1000;
        const bytesPerSecond = bitsPerSecond / 8;

        return Math.max(size / bytesPerSecond, 1);
    }

    private getDefaultSampleRate(mimeType: string): number {
        const defaultRates: Record<string, number> = {
            'audio/wav': 44100,
            'audio/mp3': 44100,
            'audio/m4a': 44100,
            'audio/webm': 48000,
            'audio/ogg': 44100
        };
        return defaultRates[mimeType.toLowerCase()] || 44100;
    }

    private estimateChannelsFromSize(size: number): number {
        // Very rough estimation - assume stereo for larger files
        return size > 5 * 1024 * 1024 ? 2 : 1;
    }

    private estimateBitrate(size: number, mimeType: string): number {
        const estimatedBitrates: Record<string, number> = {
            'audio/wav': 1411,
            'audio/mp3': 128,
            'audio/m4a': 128,
            'audio/webm': 64,
            'audio/ogg': 96
        };
        return estimatedBitrates[mimeType.toLowerCase()] || 128;
    }

    private getDefaultMetadata(audioFile: AudioFile): AudioMetadata {
        return {
            format: this.getFormatFromMimeType(audioFile.mimeType),
            duration: this.estimateDurationFromSize(audioFile.size, audioFile.mimeType),
            sampleRate: this.getDefaultSampleRate(audioFile.mimeType),
            channels: this.estimateChannelsFromSize(audioFile.size),
            size: audioFile.size,
            bitrate: this.estimateBitrate(audioFile.size, audioFile.mimeType)
        };
    }

    // Formatting helpers

    private formatFileSize(bytes: number): string {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + sizes[i];
    }

    private formatDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${remainingSeconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    }
}

export const audioValidationService = AudioValidationService.getInstance();
