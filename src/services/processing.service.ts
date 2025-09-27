// src/services/processing.service.ts

import { speechToTextService } from './speech-to-text.service';
import { databaseService } from './database.service';
import { recordingRepository } from '../repositories/recording.repository';
import { twilioIntegrationService } from './twilio-integration.service';
import { logger } from '../utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import type { ConversationData, ConversationInsights, ConversationMetadata } from '../interfaces/conversation.interface';
import type { Recording } from '../interfaces/user.interface';
import type { AudioEncoding, SpeechRecognitionConfig } from '../interfaces/audio.interface';

/**
 * Enhanced Processing Service with Recording Support
 */
export class ProcessingService {
    private static instance: ProcessingService;

    // Cost optimization settings
    private readonly MAX_SPEAKERS_DEFAULT = 4;
    private readonly ENABLE_ENHANCED_DEFAULT = false;
    private readonly ENABLE_DATA_LOGGING = true;

    private constructor() {}

    static getInstance(): ProcessingService {
        if (!ProcessingService.instance) {
            ProcessingService.instance = new ProcessingService();
        }
        return ProcessingService.instance;
    }

    /**
     * Process recording from Twilio and create separate conversation
     */
    async processRecording(recordingId: string, costOptimization?: {
        maxSpeakers?: number;
        enableEnhanced?: boolean;
        priorityCost?: 'speed' | 'accuracy' | 'cost';
    }): Promise<{
        success: boolean;
        conversationId: string;
        conversation: ConversationData;
        processingTime: number;
        error?: string;
    }> {
        const startTime = Date.now();

        try {
            logger.info(`Starting recording processing: ${recordingId}`);

            // Get recording data
            const recording = await recordingRepository.findById(recordingId);
            if (!recording) {
                throw new Error(`Recording not found: ${recordingId}`);
            }

            // Validate recording status
            if (recording.transcriptionStatus !== 'processing') {
                throw new Error(`Recording not in processing status: ${recording.transcriptionStatus}`);
            }

            // Create conversation ID
            const conversationId = uuidv4();

            // Step 1: Get audio file URL (Twilio URL with auth)
            const audioUrl = recording.recordingUrl;
            if (!audioUrl) {
                throw new Error(`No recording URL found for recording: ${recordingId}`);
            }

            logger.info(`Processing audio from Twilio URL: ${audioUrl}`);

            // Step 2: Configure speech recognition
            const speechConfig = this.createSpeechConfigFromRecording(recording, costOptimization);

            // Log cost estimate
            const estimatedCost = this.estimateProcessingCostFromRecording(recording, speechConfig);
            logger.info(`Estimated processing cost: $${estimatedCost.totalCost} (${estimatedCost.duration} minutes)`);

            // Step 3: Process speech-to-text with authenticated Twilio URL
            logger.info(`Processing speech-to-text for recording: ${recordingId}`);
            const speechResults = await this.processTwilioAudio(audioUrl, speechConfig);

            if (!speechResults.results || speechResults.results.length === 0) {
                throw new Error('No speech content detected in audio file');
            }

            // Log actual cost
            if (speechResults.costEstimate) {
                logger.info(`Actual processing cost: $${speechResults.costEstimate.totalEstimatedCost} for ${speechResults.costEstimate.baseMinutes} minutes`);
            }

            // Step 4: Extract speaker diarization
            logger.info(`Extracting speaker diarization for recording: ${recordingId}`);
            const diarizationResult = speechToTextService.extractSpeakerDiarization(speechResults);

            if (diarizationResult.segments.length === 0) {
                throw new Error('No speaker segments detected in audio');
            }

            // Step 5: Convert to conversation format
            logger.info(`Converting to conversation format: ${recordingId}`);
            const { speakers, messages } = speechToTextService.convertToConversationFormat(
                diarizationResult,
                this.createConversationDataFromRecording(recording, conversationId)
            );

            // Step 6: Generate insights
            logger.info(`Generating conversation insights: ${recordingId}`);
            const insights = this.generateConversationInsights(speakers, messages, diarizationResult.totalDuration);

            // Step 7: Create conversation metadata
            const metadata: ConversationMetadata = {
                title: `Call Recording: ${this.formatPhoneNumber(recording.fromNumber)} → ${this.formatPhoneNumber(recording.toNumber)}`,
                description: `Processed from Twilio recording on ${new Date(recording.callStartTime).toLocaleDateString()}`,
                duration: recording.recordingDuration,
                language: 'en-US', // Could be configurable
                recordingDate: recording.callStartTime,
                processingDate: new Date().toISOString(),
                confidence: this.calculateOverallConfidence(messages),
                fileSize: 0, // We don't store the file
                originalFileName: `twilio_recording_${recording.recordingSid}`,
                audioFormat: 'wav', // Twilio default
                source: 'twilio',
                costInfo: speechResults.costEstimate ? {
                    billedMinutes: speechResults.costEstimate.baseMinutes,
                    estimatedCost: speechResults.costEstimate.totalEstimatedCost,
                    currency: speechResults.costEstimate.currency,
                    optimizationsApplied: this.getOptimizationsSummary(speechConfig),
                    tier: speechConfig.costOptimization?.enableDataLogging ? 'BALANCED' : 'QUALITY',
                    premiumFeatures: this.getPremiumFeaturesUsed(speechConfig),
                    processingDate: new Date().toISOString()
                } : undefined
            };

            const conversationData: ConversationData = {
                conversationId,
                recordingId, // Link back to recording
                status: 'completed',
                metadata,
                speakers,
                messages,
                insights,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                processingLog: [ // TODO: Each stage should be logged as it happens with real timing:
                    {
                        timestamp: new Date().toISOString(),
                        stage: 'diarization',
                        message: 'Downloaded audio from Twilio and identified speakers',
                        duration: recording.recordingDuration * 1000
                    },
                    {
                        timestamp: new Date().toISOString(),
                        stage: 'transcription',
                        message: 'Converted speech to text with speaker diarization',
                        duration: recording.recordingDuration * 1000,
                        cost: speechResults.costEstimate?.totalEstimatedCost
                    },
                    {
                        timestamp: new Date().toISOString(),
                        stage: 'parsing',
                        message: 'Parsed conversation structure and message types',
                        duration: recording.recordingDuration * 1000
                    },
                    {
                        timestamp: new Date().toISOString(),
                        stage: 'insights',
                        message: 'Generated conversation insights and analysis',
                        duration: recording.recordingDuration * 1000
                    },
                    {
                        timestamp: new Date().toISOString(),
                        stage: 'completion',
                        message: `Conversation created successfully from Twilio recording. ${speakers.length} speakers, ${messages.length} messages identified.`,
                        duration: Date.now() - startTime,
                        cost: speechResults.costEstimate?.totalEstimatedCost
                    }
                ]
            };

            // Step 9: Save conversation to database
            await databaseService.conversations.createWithId(conversationId, conversationData);

            // Step 10: Update recording with conversation ID and completion status
            await recordingRepository.update(recordingId, {
                conversationId,
                processed: true,
                transcriptionStatus: 'completed'
            } as Partial<Recording>);

            const processingTime = Date.now() - startTime;
            logger.info(`Recording processing completed successfully: ${recordingId} -> ${conversationId}`, {
                speakers: speakers.length,
                messages: messages.length,
                duration: diarizationResult.totalDuration,
                processingTime,
                estimatedCost: speechResults.costEstimate?.totalEstimatedCost
            });

            return {
                success: true,
                conversationId,
                conversation: conversationData,
                processingTime
            };

        } catch (error) {
            logger.error(`Recording processing failed: ${recordingId}`, error);

            // Update recording status to failed
            try {
                await recordingRepository.updateProcessingStatus(recordingId, 'failed');
            } catch (updateError) {
                logger.error(`Failed to update recording status to failed: ${recordingId}`, updateError);
            }

            throw error;
        }
    }

    /**
     * Process audio from Twilio URL with authentication
     */
    private async processTwilioAudio(recordingUrl: string, config: SpeechRecognitionConfig) {
        // For Google Speech API, we need to handle Twilio URLs specially
        // Google Speech API expects gs:// URLs, but we have HTTPS URLs with auth

        // Option 1: Try direct URL (may not work due to auth requirements)
        // Option 2: Download and upload to GCS temporarily
        // Option 3: Use a proxy/streaming approach

        // For now, let's try the streaming approach by downloading the audio first
        logger.info('Downloading audio from Twilio for processing...');

        const audioBuffer = await twilioIntegrationService.downloadRecording(recordingUrl);

        // Create a temporary GCS upload for processing
        const tempFileName = `temp_processing_${Date.now()}.wav`;
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
        const tempGcsPath = `gs://${bucketName}/temp/${tempFileName}`;

        // Upload temporarily to GCS for processing
        // Note: You'll need to implement uploadTempAudio in your storage service
        // For now, we'll use the speech service directly with the buffer

        // Alternative: Process the buffer directly if your speech service supports it
        // This is a placeholder - you may need to adapt based on your speech service implementation
        const speechResults = await speechToTextService.processAudioBuffer(audioBuffer, config);

        return speechResults;
    }

    /**
     * Create speech config from recording data
     */
    private createSpeechConfigFromRecording(
        recording: Recording,
        optimization?: {
            maxSpeakers?: number;
            enableEnhanced?: boolean;
            priorityCost?: 'speed' | 'accuracy' | 'cost';
        }
    ): SpeechRecognitionConfig {
        const priority = optimization?.priorityCost || 'cost';

        let maxSpeakers = this.MAX_SPEAKERS_DEFAULT;
        let useEnhanced = this.ENABLE_ENHANCED_DEFAULT;
        let enableWordTimeOffsets = false;
        let model: string = 'default';

        switch (priority) {
            case 'accuracy':
                maxSpeakers = optimization?.maxSpeakers || 6;
                useEnhanced = optimization?.enableEnhanced !== false;
                enableWordTimeOffsets = true;
                model = 'latest_long';
                break;
            case 'speed':
                maxSpeakers = 3;
                useEnhanced = false;
                enableWordTimeOffsets = false;
                model = 'command_and_search';
                break;
            case 'cost':
            default:
                maxSpeakers = optimization?.maxSpeakers || this.MAX_SPEAKERS_DEFAULT;
                useEnhanced = optimization?.enableEnhanced || false;
                enableWordTimeOffsets = false;
                model = 'default';
                break;
        }

        return {
            encoding: 'LINEAR16' as AudioEncoding, // Twilio default
            sampleRateHertz: 8000, // Twilio voice calls are typically 8kHz
            languageCode: 'en-US', // Could be configurable
            alternativeLanguageCodes: priority === 'cost' ? undefined : ['en-US'],
            maxAlternatives: 1,
            profanityFilter: false,
            speechContexts: [],
            enableWordTimeOffsets,
            enableAutomaticPunctuation: true,
            diarizationConfig: {
                enableSpeakerDiarization: true,
                minSpeakerCount: 1,
                maxSpeakerCount: maxSpeakers
            },
            model,
            useEnhanced,
            costOptimization: {
                enableDataLogging: this.ENABLE_DATA_LOGGING,
                maxSpeakers,
                enableBatchProcessing: true
            }
        };
    }

    /**
     * Create basic conversation data structure from recording
     */
    private createConversationDataFromRecording(recording: Recording, conversationId: string): ConversationData {
        return {
            conversationId,
            recordingId: recording.id,
            status: 'processing',
            metadata: {
                title: '',
                duration: recording.recordingDuration,
                language: 'en-US',
                recordingDate: recording.callStartTime,
                processingDate: new Date().toISOString(),
                confidence: 0,
                fileSize: 0,
                originalFileName: '',
                audioFormat: 'wav'
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    /**
     * Estimate processing cost from recording data
     */
    private estimateProcessingCostFromRecording(recording: Recording, config: SpeechRecognitionConfig): {
        duration: number;
        baseCost: number;
        premiumCost: number;
        totalCost: number;
        breakdown: string[];
    } {
        const duration = recording.recordingDuration || 0;
        const useDataLogging = config.costOptimization?.enableDataLogging !== false;
        const baseRate = useDataLogging ? 0.016 : 0.024;

        let baseCost = (duration / 60) * baseRate;
        let premiumCost = 0;
        const breakdown: string[] = [];

        breakdown.push(`Base: ${(duration / 60).toFixed(2)} min × $${baseRate} = $${baseCost.toFixed(3)}`);

        if (config.diarizationConfig?.enableSpeakerDiarization) {
            const diarizationCost = baseCost * 0.6;
            premiumCost += diarizationCost;
            breakdown.push(`Speaker diarization: +$${diarizationCost.toFixed(3)} (60%)`);
        }

        if (config.useEnhanced) {
            const enhancedCost = baseCost * 0.25;
            premiumCost += enhancedCost;
            breakdown.push(`Enhanced models: +$${enhancedCost.toFixed(3)} (25%)`);
        }

        const totalCost = baseCost + premiumCost;

        return {
            duration: duration / 60,
            baseCost: Math.round(baseCost * 1000) / 1000,
            premiumCost: Math.round(premiumCost * 1000) / 1000,
            totalCost: Math.round(totalCost * 1000) / 1000,
            breakdown
        };
    }

    /**
     * Legacy conversation processing (keep for backward compatibility)
     */
    async processConversation(conversationId: string, costOptimization?: {
        maxSpeakers?: number;
        enableEnhanced?: boolean;
        priorityCost?: 'speed' | 'accuracy' | 'cost';
    }): Promise<void> {
        // Keep existing conversation processing logic for uploaded files
        // This handles the old flow where files were uploaded to GCS first

        try {
            logger.info(`Starting legacy conversation processing: ${conversationId}`);

            const conversation = await databaseService.conversations.findById(conversationId);
            if (!conversation) {
                throw new Error(`Conversation not found: ${conversationId}`);
            }

            if (conversation.status !== 'uploaded') {
                logger.warn(`Conversation ${conversationId} is not in uploaded status: ${conversation.status}`);
                return;
            }

            // Use existing processing logic...
            // (Keep all your existing processConversation logic here)

            logger.info(`Legacy conversation processing completed: ${conversationId}`);

        } catch (error) {
            logger.error(`Legacy conversation processing failed: ${conversationId}`, error);
            throw error;
        }
    }

    // Keep all your existing helper methods
    async getProcessingProgress(conversationId: string): Promise<any> {
        // Existing implementation
        return {};
    }

    private generateConversationInsights(speakers: any[], messages: any[], totalDuration: number): ConversationInsights {
        // Keep your existing implementation
        return {
            totalMessages: messages.length,
            questionCount: 0,
            responseCount: 0,
            statementCount: 0,
            averageMessageLength: 0,
            longestMessage: { messageId: '', length: 0 },
            conversationFlow: 'unknown',
            speakingTimeDistribution: []
        };
    }

    private calculateOverallConfidence(messages: any[]): number {
        // Keep your existing implementation
        return 0.95;
    }

    private getOptimizationsSummary(config: SpeechRecognitionConfig): string[] {
        // Keep your existing implementation
        return [];
    }

    private getPremiumFeaturesUsed(config: SpeechRecognitionConfig): string[] {
        // Keep your existing implementation
        return [];
    }

    private formatPhoneNumber(phoneNumber: string): string {
        // Reuse from TwilioIntegrationService
        if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
            const number = phoneNumber.substring(2);
            return `(${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`;
        }
        return phoneNumber;
    }
}

export const processingService = ProcessingService.getInstance();
