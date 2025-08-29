// src/services/processing.service.ts

import {speechToTextService} from './speech-to-text.service';
import {databaseService} from './database.service';
import {logger} from '../utils/logger.util';
import type {ConversationData, ConversationInsights, ProcessingLogEntry} from '../interfaces/conversation.interface';
import type {AudioEncoding, SpeechRecognitionConfig} from '../interfaces/audio.interface';

/**
 * Orchestrates the entire conversation processing pipeline
 */
export class ProcessingService {
    private static instance: ProcessingService;

    private constructor() {}

    static getInstance(): ProcessingService {
        if (!ProcessingService.instance) {
            ProcessingService.instance = new ProcessingService();
        }
        return ProcessingService.instance;
    }

    /**
     * Process uploaded conversation - main orchestration method
     */
    async processConversation(conversationId: string): Promise<void> {
        try {
            logger.info(`Starting conversation processing: ${conversationId}`);

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
                message: 'Starting speech-to-text processing with speaker diarization'
            });

            // Step 1: Get audio file URL for processing
            const audioUrl = await this.getAudioFileUrl(conversationId);
            if (!audioUrl) {
                throw new Error(`Audio file not found for conversation: ${conversationId}`);
            }

            // Step 2: Configure speech recognition
            const speechConfig = this.createSpeechConfig(conversation);

            // Step 3: Process speech-to-text
            logger.info(`Processing speech-to-text for conversation: ${conversationId}`);
            await this.updateProcessingStatus(conversationId, 'processing', {
                timestamp: new Date().toISOString(),
                stage: 'transcription',
                message: 'Converting speech to text with speaker identification'
            });

            const speechResults = await speechToTextService.processAudioFile(audioUrl, speechConfig);

            if (!speechResults.results || speechResults.results.length === 0) {
                throw new Error('No speech content detected in audio file');
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

            // Step 7: Update conversation with results
            const updatedConversation: Partial<ConversationData> = {
                speakers,
                messages,
                insights,
                status: 'completed',
                metadata: {
                    ...conversation.metadata,
                    confidence: this.calculateOverallConfidence(messages),
                    processingDate: new Date().toISOString()
                }
            };

            await databaseService.conversations.update(conversationId, updatedConversation);

            // Step 8: Add completion log
            await this.updateProcessingStatus(conversationId, 'completed', {
                timestamp: new Date().toISOString(),
                stage: 'completion',
                message: `Conversation processing completed successfully. ${speakers.length} speakers, ${messages.length} messages identified`,
                duration: speechResults.totalBilledTime || 0
            });

            logger.info(`Conversation processing completed successfully: ${conversationId}`, {
                speakers: speakers.length,
                messages: messages.length,
                duration: diarizationResult.totalDuration,
                billedTime: speechResults.totalBilledTime
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
     * Get processing progress for a conversation
     */
    async getProcessingProgress(conversationId: string): Promise<{
        stage: string;
        percentage: number;
        message: string;
        estimatedTimeRemaining?: number;
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

        // Estimate remaining time based on audio duration and current progress
        let estimatedTimeRemaining: number | undefined;
        if (conversation.status === 'processing' && conversation.metadata.duration) {
            const processingFactor = 2; // Rough estimate: 2x audio duration for processing
            const totalEstimatedTime = conversation.metadata.duration * processingFactor;
            const remainingProgress = (100 - percentage) / 100;
            estimatedTimeRemaining = Math.ceil(totalEstimatedTime * remainingProgress);
        }

        return {
            stage: currentStage,
            percentage,
            message: this.getStageMessage(currentStage),
            estimatedTimeRemaining
        };
    }

    // Private helper methods

    private async updateProcessingStatus(
        conversationId: string,
        status: ConversationData['status'],
        logEntry?: ProcessingLogEntry
    ): Promise<void> {
        try {
            await databaseService.conversations.updateStatus(conversationId, status, logEntry);
        } catch (error) {
            logger.error(`Failed to update processing status for ${conversationId}:`, error);
            // Don't throw - processing can continue even if logging fails
        }
    }

    private async getAudioFileUrl(conversationId: string): Promise<string | null> {
        try {
            // Get conversation to find the actual audio format
            const conversation = await databaseService.conversations.findById(conversationId);
            if (!conversation) {
                logger.error(`Conversation not found: ${conversationId}`);
                return null;
            }

            // Use the same storage structure as the upload service
            const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
            const audioFormat = conversation.metadata.audioFormat;
            const storageKey = `conversations/${conversationId}/audio/original.${audioFormat}`;

            // Construct GCS path matching your upload service structure
            const gcsPath = `gs://${bucketName}/${storageKey}`;

            logger.info(`Using GCS path for Speech API: ${gcsPath}`);
            logger.info(`Storage key: ${storageKey}`);

            return gcsPath;
        } catch (error) {
            logger.error(`Failed to get audio file URL for conversation ${conversationId}:`, error);
            return null;
        }
    }

    private createSpeechConfig(conversation: ConversationData): SpeechRecognitionConfig {
        const fileName = conversation.metadata?.originalFileName || '';
        let encoding: string = 'MP3'; // default
        if (fileName.endsWith('.wav')) encoding = 'LINEAR16';
        if (fileName.endsWith('.flac')) encoding = 'FLAC';
        if (fileName.endsWith('.m4a')) encoding = 'MP3'; // GCP treats AAC/M4A as MP3 container

        return {
            encoding: encoding as AudioEncoding,
            sampleRateHertz: speechToTextService.estimateSampleRate({
                format: conversation.metadata.audioFormat
            }),
            languageCode: conversation.metadata.language || 'en-US',
            alternativeLanguageCodes: ['en-US', 'es-US'], // Could be made configurable
            maxAlternatives: 1,
            profanityFilter: false,
            speechContexts: [],
            enableWordTimeOffsets: true,
            enableAutomaticPunctuation: true,
            diarizationConfig: {
                enableSpeakerDiarization: true,
                minSpeakerCount: 1,
                maxSpeakerCount: 6
            },
            model: 'latest_long', // Best for longer recordings
            useEnhanced: true
        };
    }

    private generateConversationInsights(
        speakers: ConversationData['speakers'],
        messages: ConversationData['messages'],
        totalDuration: number
    ): ConversationInsights {
        // Count message types
        const questionCount = messages.filter(msg => msg.messageType === 'question').length;
        const responseCount = messages.filter(msg => msg.messageType === 'response').length;
        const statementCount = messages.filter(msg => msg.messageType === 'statement').length;

        // Calculate average message length
        const averageMessageLength = messages.length > 0
            ? Math.round(messages.reduce((sum, msg) => sum + msg.wordCount, 0) / messages.length * 100) / 100
            : 0;

        // Find longest message
        const longestMessage = messages.reduce(
            (longest, msg) => msg.wordCount > longest.length ? { messageId: msg.messageId, length: msg.wordCount } : longest,
            { messageId: '', length: 0 }
        );

        // Determine conversation flow
        const conversationFlow = this.analyzeConversationFlow(questionCount, responseCount, statementCount, messages.length);

        // Calculate speaking time distribution
        const speakingTimeDistribution = speakers.map(speaker => ({
            speakerId: speaker.id,
            percentage: Math.round((speaker.totalSpeakingTime / totalDuration) * 10000) / 100,
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
            diarization: 'Identifying different speakers in the conversation',
            transcription: 'Converting speech to text with timestamps',
            parsing: 'Analyzing conversation structure and message types',
            insights: 'Generating conversation insights and statistics',
            completion: 'Processing completed successfully'
        };

        return messages[stage] || 'Processing conversation...';
    }
}

export const processingService = ProcessingService.getInstance();
