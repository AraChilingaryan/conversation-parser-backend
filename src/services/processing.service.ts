// src/services/processing.service.ts

import {speechToTextService} from './speech-to-text.service';
import {databaseService} from './database.service';
import {logger} from '../utils/logger.util';
import type {ConversationData, ConversationInsights, ProcessingLogEntry} from '../interfaces/conversation.interface';
import type {AudioEncoding, SpeechRecognitionConfig} from '../interfaces/audio.interface';

/**
 * Cost-Optimized Conversation Processing Pipeline
 */
export class ProcessingService {
    private static instance: ProcessingService;

    // Cost optimization settings
    private readonly MAX_SPEAKERS_DEFAULT = 4; // Reduced from 6 for cost optimization
    private readonly ENABLE_ENHANCED_DEFAULT = false; // Disabled by default for cost
    private readonly ENABLE_DATA_LOGGING = true; // Cheaper pricing tier

    private constructor() {}

    static getInstance(): ProcessingService {
        if (!ProcessingService.instance) {
            ProcessingService.instance = new ProcessingService();
        }
        return ProcessingService.instance;
    }

    /**
     * Process uploaded conversation with cost optimization
     */
    async processConversation(conversationId: string, costOptimization?: {
        maxSpeakers?: number;
        enableEnhanced?: boolean;
        priorityCost?: 'speed' | 'accuracy' | 'cost';
    }): Promise<void> {
        try {
            logger.info(`Starting cost-optimized conversation processing: ${conversationId}`);

            // Get conversation data
            const conversation = await databaseService.conversations.findById(conversationId);
            if (!conversation) {
                throw new Error(`Conversation not found: ${conversationId}`);
            }

            if (conversation.status !== 'uploaded') {
                logger.warn(`Conversation ${conversationId} is not in uploaded status: ${conversation.status}`);
                return;
            }

            // Update status to processing
            await this.updateProcessingStatus(conversationId, 'processing', {
                timestamp: new Date().toISOString(),
                stage: 'diarization',
                message: 'Starting cost-optimized speech-to-text processing with speaker diarization'
            });

            // Step 1: Get audio file URL for processing
            const audioUrl = await this.getAudioFileUrl(conversationId);
            if (!audioUrl) {
                throw new Error(`Audio file not found for conversation: ${conversationId}`);
            }

            // Step 2: Configure speech recognition with cost optimization
            const speechConfig = this.createCostOptimizedSpeechConfig(conversation, costOptimization);

            // Log cost estimate
            const estimatedCost = this.estimateProcessingCost(conversation, speechConfig);
            logger.info(`Estimated processing cost: $${estimatedCost.totalCost} (${estimatedCost.duration} minutes)`);

            // Step 3: Process speech-to-text
            logger.info(`Processing speech-to-text for conversation: ${conversationId}`);
            await this.updateProcessingStatus(conversationId, 'processing', {
                timestamp: new Date().toISOString(),
                stage: 'transcription',
                message: `Converting speech to text (est. cost: $${estimatedCost.totalCost})`
            });

            const speechResults = await speechToTextService.processAudioFile(audioUrl, speechConfig);

            if (!speechResults.results || speechResults.results.length === 0) {
                throw new Error('No speech content detected in audio file');
            }

            // Log actual cost
            if (speechResults.costEstimate) {
                logger.info(`Actual processing cost: $${speechResults.costEstimate.totalEstimatedCost} for ${speechResults.costEstimate.baseMinutes} minutes`);
            }

            // Step 4: Extract speaker diarization
            logger.info(`Extracting speaker diarization for conversation: ${conversationId}`);
            const diarizationResult = speechToTextService.extractSpeakerDiarization(speechResults);

            if (diarizationResult.segments.length === 0) {
                throw new Error('No speaker segments detected in audio');
            }

            // Step 5: Convert to conversation format
            logger.info(`Converting to conversation format: ${conversationId}`);
            await this.updateProcessingStatus(conversationId, 'processing', {
                timestamp: new Date().toISOString(),
                stage: 'parsing',
                message: 'Parsing conversation structure and identifying speakers'
            });

            const { speakers, messages } = speechToTextService.convertToConversationFormat(
                diarizationResult,
                conversation
            );

            // Step 6: Generate insights
            logger.info(`Generating conversation insights: ${conversationId}`);
            await this.updateProcessingStatus(conversationId, 'processing', {
                timestamp: new Date().toISOString(),
                stage: 'insights',
                message: 'Analyzing conversation patterns and generating insights'
            });

            const insights = this.generateConversationInsights(speakers, messages, diarizationResult.totalDuration);

            // Step 7: Update conversation with results and cost info
            const updatedConversation: Partial<ConversationData> = {
                speakers,
                messages,
                insights,
                status: 'completed',
                metadata: {
                    ...conversation.metadata,
                    confidence: this.calculateOverallConfidence(messages),
                    processingDate: new Date().toISOString(),
                    costInfo: speechResults.costEstimate ? {
                        billedMinutes: speechResults.costEstimate.baseMinutes,
                        estimatedCost: speechResults.costEstimate.totalEstimatedCost,
                        currency: speechResults.costEstimate.currency,
                        optimizationsApplied: this.getOptimizationsSummary(speechConfig),
                        tier: speechConfig.costOptimization?.enableDataLogging ? 'BALANCED' : 'QUALITY',
                        premiumFeatures: this.getPremiumFeaturesUsed(speechConfig),
                        processingDate: new Date().toISOString()
                    } : undefined
                }
            };

            await databaseService.conversations.update(conversationId, updatedConversation);

            // Step 8: Add completion log
            await this.updateProcessingStatus(conversationId, 'completed', {
                timestamp: new Date().toISOString(),
                stage: 'completion',
                message: `Processing completed successfully. ${speakers.length} speakers, ${messages.length} messages identified. Cost: $${speechResults.costEstimate?.totalEstimatedCost || 'unknown'}`,
                duration: speechResults.totalBilledTime || 0,
                cost: speechResults.costEstimate?.totalEstimatedCost
            });

            logger.info(`Conversation processing completed successfully: ${conversationId}`, {
                speakers: speakers.length,
                messages: messages.length,
                duration: diarizationResult.totalDuration,
                billedTime: speechResults.totalBilledTime,
                estimatedCost: speechResults.costEstimate?.totalEstimatedCost
            });

        } catch (error) {
            logger.error(`Conversation processing failed: ${conversationId}`, error);

            // Update status to failed
            await this.updateProcessingStatus(conversationId, 'failed', {
                timestamp: new Date().toISOString(),
                stage: 'error',
                message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: error instanceof Error ? error.stack : String(error)
            });

            throw error;
        }
    }

    /**
     * Estimate processing cost before starting
     */
    estimateProcessingCost(conversation: ConversationData, config: SpeechRecognitionConfig): {
        duration: number;
        baseCost: number;
        premiumCost: number;
        totalCost: number;
        breakdown: string[];
    } {
        const duration = conversation.metadata.duration || 0;
        const useDataLogging = config.costOptimization?.enableDataLogging !== false;
        const baseRate = useDataLogging ? 0.016 : 0.024;

        let baseCost = (duration / 60) * baseRate; // Convert seconds to minutes
        let premiumCost = 0;
        const breakdown: string[] = [];

        breakdown.push(`Base: ${(duration / 60).toFixed(2)} min × $${baseRate} = $${baseCost.toFixed(3)}`);

        // Calculate premium features
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

        if (config.enableWordTimeOffsets) {
            const timestampCost = baseCost * 0.1;
            premiumCost += timestampCost;
            breakdown.push(`Word timestamps: +$${timestampCost.toFixed(3)} (10%)`);
        }

        const totalCost = baseCost + premiumCost;

        return {
            duration: duration / 60, // in minutes
            baseCost: Math.round(baseCost * 1000) / 1000,
            premiumCost: Math.round(premiumCost * 1000) / 1000,
            totalCost: Math.round(totalCost * 1000) / 1000,
            breakdown
        };
    }

    /**
     * Get processing progress for a conversation
     */
    async getProcessingProgress(conversationId: string): Promise<{
        stage: string;
        percentage: number;
        message: string;
        estimatedTimeRemaining?: number;
        estimatedCost?: number;
    }> {
        const conversation = await databaseService.conversations.findById(conversationId);
        if (!conversation) {
            throw new Error(`Conversation not found: ${conversationId}`);
        }

        const stages = ['upload', 'validation', 'diarization', 'transcription', 'parsing', 'insights', 'completion'];
        const currentStageIndex = conversation.processingLog
            ? Math.max(...conversation.processingLog.map(log => stages.indexOf(log.stage)).filter(i => i !== -1))
            : 0;

        const percentage = Math.round((currentStageIndex / (stages.length - 1)) * 100);
        const currentStage = stages[currentStageIndex] || 'upload';

        // Estimate remaining time and cost
        let estimatedTimeRemaining: number | undefined;
        let estimatedCost: number | undefined;

        if (conversation.status === 'processing' && conversation.metadata.duration) {
            const processingFactor = 1.5; // Optimized: reduced from 2x
            const totalEstimatedTime = conversation.metadata.duration * processingFactor;
            const remainingProgress = (100 - percentage) / 100;
            estimatedTimeRemaining = Math.ceil(totalEstimatedTime * remainingProgress);

            // Estimate cost based on duration
            const durationMinutes = conversation.metadata.duration / 60;
            estimatedCost = durationMinutes * 0.025; // Rough estimate with optimizations
        }

        return {
            stage: currentStage,
            percentage,
            message: this.getStageMessage(currentStage),
            estimatedTimeRemaining,
            estimatedCost: estimatedCost ? Math.round(estimatedCost * 100) / 100 : undefined
        };
    }

    // Private helper methods

    private createCostOptimizedSpeechConfig(
        conversation: ConversationData,
        optimization?: {
            maxSpeakers?: number;
            enableEnhanced?: boolean;
            priorityCost?: 'speed' | 'accuracy' | 'cost';
        }
    ): SpeechRecognitionConfig {
        const fileName = conversation.metadata?.originalFileName || '';
        let encoding: string = 'MP3'; // default
        if (fileName.endsWith('.wav')) encoding = 'LINEAR16';
        if (fileName.endsWith('.flac')) encoding = 'FLAC';
        if (fileName.endsWith('.m4a')) encoding = 'MP3';

        // Determine optimization priority
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
            encoding: encoding as AudioEncoding,
            sampleRateHertz: speechToTextService.estimateSampleRate({
                format: conversation.metadata.audioFormat
            }),
            languageCode: conversation.metadata.language || 'en-US',
            alternativeLanguageCodes: priority === 'cost' ? undefined : ['en-US'], // Minimize for cost
            maxAlternatives: 1, // Always limit to 1 for cost
            profanityFilter: false,
            speechContexts: [], // Empty for cost optimization
            enableWordTimeOffsets,
            enableAutomaticPunctuation: true, // Usually free
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

    private getOptimizationsSummary(config: SpeechRecognitionConfig): string[] {
        const optimizations: string[] = [];

        if (config.costOptimization?.enableDataLogging) {
            optimizations.push('Data logging enabled (cheaper pricing)');
        }

        if (!config.useEnhanced) {
            optimizations.push('Standard model used (cost optimized)');
        }

        if (config.diarizationConfig?.maxSpeakerCount && config.diarizationConfig.maxSpeakerCount <= 4) {
            optimizations.push(`Speaker limit: ${config.diarizationConfig.maxSpeakerCount} (cost optimized)`);
        }

        if (!config.enableWordTimeOffsets) {
            optimizations.push('Word timestamps disabled (cost optimized)');
        }

        if (!config.alternativeLanguageCodes || config.alternativeLanguageCodes.length <= 1) {
            optimizations.push('Limited alternative languages (cost optimized)');
        }

        return optimizations;
    }

    private async updateProcessingStatus(
        conversationId: string,
        status: ConversationData['status'],
        logEntry?: ProcessingLogEntry & { cost?: number }
    ): Promise<void> {
        try {
            await databaseService.conversations.updateStatus(conversationId, status, logEntry);
        } catch (error) {
            logger.error(`Failed to update processing status for ${conversationId}:`, error);
        }
    }

    private async getAudioFileUrl(conversationId: string): Promise<string | null> {
        try {
            const conversation = await databaseService.conversations.findById(conversationId);
            if (!conversation) {
                logger.error(`Conversation not found: ${conversationId}`);
                return null;
            }

            const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
            const audioFormat = conversation.metadata.audioFormat;
            const storageKey = `conversations/${conversationId}/audio/original.${audioFormat}`;
            const gcsPath = `gs://${bucketName}/${storageKey}`;

            logger.info(`Using GCS path for Speech API: ${gcsPath}`);
            return gcsPath;
        } catch (error) {
            logger.error(`Failed to get audio file URL for conversation ${conversationId}:`, error);
            return null;
        }
    }

    private generateConversationInsights(
        speakers: ConversationData['speakers'],
        messages: ConversationData['messages'],
        totalDuration: number
    ): ConversationInsights {
        const questionCount = messages.filter(msg => msg.messageType === 'question').length;
        const responseCount = messages.filter(msg => msg.messageType === 'response').length;
        const statementCount = messages.filter(msg => msg.messageType === 'statement').length;

        const averageMessageLength = messages.length > 0
            ? Math.round(messages.reduce((sum, msg) => sum + msg.wordCount, 0) / messages.length * 100) / 100
            : 0;

        const longestMessage = messages.reduce(
            (longest, msg) => msg.wordCount > longest.length ? { messageId: msg.messageId, length: msg.wordCount } : longest,
            { messageId: '', length: 0 }
        );

        const conversationFlow = this.analyzeConversationFlow(questionCount, responseCount, statementCount, messages.length);

        const speakingTimeDistribution = speakers.map(speaker => ({
            speakerId: speaker.id,
            percentage: Math.round((speaker.totalSpeakingTime / totalDuration) * 100 * 100) / 100,
            totalTime: speaker.totalSpeakingTime
        }));

        return {
            totalMessages: messages.length,
            questionCount,
            responseCount,
            statementCount,
            averageMessageLength,
            longestMessage,
            conversationFlow,
            speakingTimeDistribution
        };
    }

    private analyzeConversationFlow(
        questionCount: number,
        responseCount: number,
        statementCount: number,
        totalMessages: number
    ): ConversationInsights['conversationFlow'] {
        const questionRatio = questionCount / totalMessages;
        const responseRatio = responseCount / totalMessages;

        if (questionRatio > 0.4 && responseRatio > 0.3) {
            return 'question_answer_pattern';
        } else if (questionRatio > 0.3) {
            return 'interview';
        } else if (totalMessages > 20 && questionRatio > 0.2) {
            return 'meeting';
        } else if (responseRatio < 0.2 && statementCount > totalMessages * 0.6) {
            return 'monologue';
        } else {
            return 'discussion';
        }
    }

    private calculateOverallConfidence(messages: ConversationData['messages']): number {
        if (messages.length === 0) return 0;
        const totalConfidence = messages.reduce((sum, msg) => sum + msg.confidence, 0);
        return Math.round((totalConfidence / messages.length) * 100) / 100;
    }

    private getStageMessage(stage: string): string {
        const messages: Record<string, string> = {
            upload: 'Audio file uploaded successfully',
            validation: 'Validating audio format and quality',
            diarization: 'Identifying speakers (cost-optimized)',
            transcription: 'Converting speech to text with cost optimization',
            parsing: 'Analyzing conversation structure',
            insights: 'Generating insights and statistics',
            completion: 'Processing completed successfully'
        };

        return messages[stage] || 'Processing conversation...';
    }

    private getPremiumFeaturesUsed(config: SpeechRecognitionConfig): string[] {
        const features: string[] = [];

        if (config.diarizationConfig?.enableSpeakerDiarization) {
            features.push('Speaker Diarization');
        }
        if (config.useEnhanced) {
            features.push('Enhanced Models');
        }
        if (config.enableWordTimeOffsets) {
            features.push('Word Timestamps');
        }
        if (config.model === 'latest_long') {
            features.push('Premium Model');
        }

        return features;
    }
}

export const processingService = ProcessingService.getInstance();
