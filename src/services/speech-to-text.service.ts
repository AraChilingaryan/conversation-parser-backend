// src/services/speech-to-text.service.ts
import {SpeechClient} from '@google-cloud/speech';
import {logger} from '../utils/logger.util';
import type {
    AudioEncoding,
    DiarizationResult,
    SpeakerSegment,
    SpeechRecognitionConfig,
    SpeechToTextResponse
} from '../interfaces/audio.interface';
import type {ConversationData} from '../interfaces/conversation.interface';

/**
 * Cost-Optimized Speech-to-Text service using Google Cloud Speech-to-Text API
 */
export class SpeechToTextService {
    private static instance: SpeechToTextService;
    private speechClient: SpeechClient;

    // Cost tracking
    private readonly COST_PER_MINUTE_BASE = 0.016; // With data logging
    private readonly COST_PER_MINUTE_NO_LOGGING = 0.024; // Without data logging

    private constructor() {
        this.speechClient = new SpeechClient();
    }

    static getInstance(): SpeechToTextService {
        if (!SpeechToTextService.instance) {
            SpeechToTextService.instance = new SpeechToTextService();
        }
        return SpeechToTextService.instance;
    }

    /**
     * Process audio file with cost optimization
     */
    async processAudioFile(audioUrl: string, config: SpeechRecognitionConfig): Promise<SpeechToTextResponse> {
        try {
            logger.info(`Starting cost-optimized speech-to-text processing for: ${audioUrl}`);

            // Apply cost optimization settings
            const optimizedConfig = this.applyCostOptimization(config);

            const request = {
                audio: {
                    uri: audioUrl,
                },
                config: {
                    encoding: optimizedConfig.encoding as any,
                    sampleRateHertz: optimizedConfig.sampleRateHertz,
                    languageCode: optimizedConfig.languageCode,
                    alternativeLanguageCodes: optimizedConfig.alternativeLanguageCodes,
                    maxAlternatives: optimizedConfig.maxAlternatives || 1, // Limit alternatives for cost
                    profanityFilter: optimizedConfig.profanityFilter || false,
                    speechContexts: optimizedConfig.speechContexts || [], // Minimize context for cost
                    enableWordTimeOffsets: optimizedConfig.enableWordTimeOffsets || false, // Disable if not critical
                    enableAutomaticPunctuation: optimizedConfig.enableAutomaticPunctuation !== false, // Keep this as it's usually free
                    diarizationConfig: optimizedConfig.diarizationConfig,
                    model: optimizedConfig.model as any,
                    useEnhanced: optimizedConfig.useEnhanced || false // Disable enhanced by default
                },
            };

            logger.debug('Cost-optimized Speech-to-Text configuration:', {
                encoding: request.config.encoding,
                sampleRate: request.config.sampleRateHertz,
                language: request.config.languageCode,
                diarization: request.config.diarizationConfig?.enableSpeakerDiarization,
                minSpeakers: request.config.diarizationConfig?.minSpeakerCount,
                maxSpeakers: request.config.diarizationConfig?.maxSpeakerCount,
                enhanced: request.config.useEnhanced,
                model: request.config.model,
                costOptimization: optimizedConfig.costOptimization
            });

            const [operation] = await this.speechClient.longRunningRecognize(request);
            logger.info('Speech-to-Text operation started, waiting for completion...');

            const [response] = await operation.promise();

            if (!response.results || response.results.length === 0) {
                logger.warn('No speech recognition results returned');
                return {
                    results: [],
                    totalBilledTime: 0,
                    costEstimate: this.calculateCostEstimate(0, optimizedConfig)
                };
            }

            const billedTime = this.parseDuration(response.totalBilledTime);

            logger.info(`Speech-to-Text completed. Found ${response.results.length} result segments`);
            logger.info(`Billed time: ${billedTime} minutes, Estimated cost: $${this.calculateCostEstimate(billedTime, optimizedConfig).totalEstimatedCost}`);

            return {
                results: response.results || [],
                totalBilledTime: billedTime,
                costEstimate: this.calculateCostEstimate(billedTime, optimizedConfig)
            };

        } catch (error) {
            logger.error('Speech-to-Text processing failed:', error);
            throw new Error(`Speech processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Apply cost optimization settings to config
     */
    private applyCostOptimization(config: SpeechRecognitionConfig): SpeechRecognitionConfig {
        const optimized = { ...config };

        // Default cost optimization if not specified
        if (!optimized.costOptimization) {
            optimized.costOptimization = {
                enableDataLogging: true, // Cheaper pricing tier
                maxSpeakers: 4, // Reasonable limit for most conversations
                enableBatchProcessing: true // Use batch when possible
            };
        }

        // Apply optimizations
        if (optimized.costOptimization.enableDataLogging) {
            // Use cheaper pricing tier (allows Google to use data for improvements)
            logger.info('Using data logging for reduced pricing');
        }

        // Optimize speaker diarization
        if (optimized.diarizationConfig?.enableSpeakerDiarization) {
            const maxSpeakers = optimized.costOptimization.maxSpeakers || 4;
            optimized.diarizationConfig = {
                ...optimized.diarizationConfig,
                maxSpeakerCount: Math.min(optimized.diarizationConfig.maxSpeakerCount || 6, maxSpeakers),
                minSpeakerCount: optimized.diarizationConfig.minSpeakerCount || 1
            };
            logger.info(`Limited max speakers to ${optimized.diarizationConfig.maxSpeakerCount} for cost optimization`);
        }

        // Use cost-effective model unless premium is specifically requested
        if (!optimized.model || optimized.model === 'latest_long') {
            optimized.model = 'default'; // Most cost-effective
            logger.info('Using default model for cost optimization');
        }

        // Limit alternative languages for cost
        if (optimized.alternativeLanguageCodes && optimized.alternativeLanguageCodes.length > 1) {
            optimized.alternativeLanguageCodes = optimized.alternativeLanguageCodes.slice(0, 1);
            logger.info('Limited alternative languages to 1 for cost optimization');
        }

        // Disable enhanced features unless explicitly required
        if (optimized.useEnhanced !== true) {
            optimized.useEnhanced = false;
            logger.info('Disabled enhanced models for cost optimization');
        }

        return optimized;
    }

    /**
     * Calculate estimated cost for the request
     */
    private calculateCostEstimate(billedMinutes: number, config: SpeechRecognitionConfig): {
        baseMinutes: number;
        premiumFeatureCost: number;
        totalEstimatedCost: number;
        currency: string;
    } {
        const useDataLogging = config.costOptimization?.enableDataLogging !== false;
        const baseRate = useDataLogging ? this.COST_PER_MINUTE_BASE : this.COST_PER_MINUTE_NO_LOGGING;

        let baseCost = billedMinutes * baseRate;
        let premiumCost = 0;

        // Calculate premium feature costs
        if (config.diarizationConfig?.enableSpeakerDiarization) {
            premiumCost += baseCost * 0.6; // 60% premium for diarization (reduced from typical 80%)
        }

        if (config.useEnhanced) {
            premiumCost += baseCost * 0.25; // 25% premium for enhanced models
        }

        if (config.enableWordTimeOffsets) {
            premiumCost += baseCost * 0.1; // 10% premium for word timestamps
        }

        const totalCost = baseCost + premiumCost;

        return {
            baseMinutes: billedMinutes,
            premiumFeatureCost: Math.round(premiumCost * 100) / 100,
            totalEstimatedCost: Math.round(totalCost * 100) / 100,
            currency: 'USD'
        };
    }

    /**
     * Extract speaker diarization data from speech results
     */
    extractSpeakerDiarization(speechResults: SpeechToTextResponse): DiarizationResult {
        const segments: SpeakerSegment[] = [];
        const speakerStats = new Map<number, { totalTime: number; segmentCount: number }>();
        let totalDuration = 0;

        for (const result of speechResults.results) {
            if (!result.alternatives || result.alternatives.length === 0) continue;

            const alternative = result.alternatives[0];
            if (!alternative.words) continue;

            // Skip results that don't have speaker tags
            const hasValidSpeakerTags = alternative.words.some((word: { speakerTag: number; }) => word.speakerTag && word.speakerTag > 0);
            if (!hasValidSpeakerTags) {
                continue;
            }

            let currentSegment: SpeakerSegment | null = null;

            for (const word of alternative.words) {
                const speakerTag = word.speakerTag || 1;
                const startTime = this.parseTime(word.startTime);
                const endTime = this.parseTime(word.endTime);

                totalDuration = Math.max(totalDuration, endTime);

                // Start new segment if speaker changed or no current segment
                if (!currentSegment || currentSegment.speakerTag !== speakerTag) {
                    // Finalize previous segment
                    if (currentSegment) {
                        segments.push(currentSegment);
                        this.updateSpeakerStats(speakerStats, currentSegment);
                    }

                    // Start new segment
                    currentSegment = {
                        speakerTag,
                        startTime,
                        endTime,
                        confidence: word.confidence || 0,
                        transcript: word.word,
                        words: [word]
                    };
                } else {
                    // Continue current segment
                    currentSegment.endTime = endTime;
                    currentSegment.transcript += ' ' + word.word;
                    currentSegment.words!.push(word);
                    currentSegment.confidence = (currentSegment.confidence + (word.confidence || 0)) / 2;
                }
            }

            // Add final segment
            if (currentSegment) {
                segments.push(currentSegment);
                this.updateSpeakerStats(speakerStats, currentSegment);
            }
        }

        const speakerCount = speakerStats.size;
        logger.info(`Diarization complete: ${speakerCount} speakers, ${segments.length} segments, ${totalDuration.toFixed(2)}s total`);

        return {
            segments,
            speakerCount,
            totalDuration,
            costOptimizationApplied: {
                reducedSpeakerLimit: true,
                simplifiedModel: true,
                batchProcessing: true
            }
        };
    }

    /**
     * Convert diarization result to structured conversation format
     */
    convertToConversationFormat(
        diarizationResult: DiarizationResult,
        conversationData: ConversationData
    ): { speakers: ConversationData['speakers']; messages: ConversationData['messages'] } {
        const speakerMap = new Map<number, string>();
        const speakers: ConversationData['speakers'] = [];
        const messages: ConversationData['messages'] = [];

        // Create speakers from unique speaker tags
        const uniqueSpeakers = Array.from(new Set(
            diarizationResult.segments.map(segment => segment.speakerTag)
        )).sort();

        uniqueSpeakers.forEach((speakerTag, index) => {
            const speakerId = `speaker_${speakerTag}`;
            speakerMap.set(speakerTag, speakerId);

            const speakerSegments = diarizationResult.segments.filter(s => s.speakerTag === speakerTag);
            const totalSpeakingTime = speakerSegments.reduce(
                (total, segment) => total + (segment.endTime - segment.startTime),
                0
            );

            speakers.push({
                id: speakerId,
                label: `Speaker ${speakerTag}`,
                identifiedName: undefined,
                totalSpeakingTime: Math.round(totalSpeakingTime * 100) / 100,
                messageCount: 0, // Will be updated below
                characteristics: this.extractSpeakerCharacteristics(speakerSegments)
            });
        });

        // Convert segments to messages
        diarizationResult.segments.forEach((segment, index) => {
            const speakerId = speakerMap.get(segment.speakerTag);
            if (!speakerId || !segment.transcript?.trim()) return;

            const messageId = `msg_${String(index + 1).padStart(3, '0')}`;
            const content = segment.transcript.trim();

            messages.push({
                messageId,
                speakerId,
                content,
                startTime: Math.round(segment.startTime * 100) / 100,
                endTime: Math.round(segment.endTime * 100) / 100,
                confidence: Math.round(segment.confidence * 100) / 100,
                messageType: this.detectMessageType(content),
                order: index + 1,
                wordCount: content.split(/\s+/).length,
                alternatives: []
            });
        });

        // Update speaker message counts
        speakers.forEach(speaker => {
            speaker.messageCount = messages.filter(msg => msg.speakerId === speaker.id).length;
        });

        logger.info(`Converted to conversation format: ${speakers.length} speakers, ${messages.length} messages`);

        return { speakers, messages };
    }

    /**
     * Get audio encoding from file format
     */
    getAudioEncoding(mimeType: string, format: string): AudioEncoding {
        const encodingMap: Record<string, AudioEncoding> = {
            'audio/wav': 'LINEAR16',
            'audio/wave': 'LINEAR16',
            'audio/mp3': 'MP3',
            'audio/mpeg': 'MP3',
            'audio/m4a': 'MP3', // Google treats M4A as MP3
            'audio/webm': 'WEBM_OPUS',
            'audio/ogg': 'OGG_OPUS'
        };

        const encoding = encodingMap[mimeType.toLowerCase()];
        if (!encoding) {
            logger.warn(`Unknown audio format: ${mimeType}, defaulting to LINEAR16`);
            return 'LINEAR16';
        }

        return encoding;
    }

    /**
     * Estimate sample rate from audio metadata with cost consideration
     */
    estimateSampleRate(metadata: any): number {
        // Use lower sample rates where possible for cost optimization
        const defaultRates: Record<string, number> = {
            'wav': 16000,  // Reduced from 44100 for cost optimization
            'mp3': 16000,  // Reduced from 44100
            'm4a': 16000,  // Reduced from 44100
            'webm': 16000, // Reduced from 48000
            'ogg': 16000   // Reduced from 44100
        };

        const estimatedRate = metadata.sampleRate || defaultRates[metadata.format] || 16000;

        // Cap sample rate for cost optimization (higher rates cost more)
        const maxRate = 16000; // Good balance of quality and cost
        const optimizedRate = Math.min(estimatedRate, maxRate);

        if (optimizedRate < estimatedRate) {
            logger.info(`Sample rate reduced from ${estimatedRate} to ${optimizedRate} for cost optimization`);
        }

        return optimizedRate;
    }

    // Private helper methods

    private parseTime(time: any): number {
        if (!time) return 0;
        if (typeof time === 'number') return time;
        if (time.seconds !== undefined) {
            return Number(time.seconds) + (Number(time.nanos) || 0) / 1e9;
        }
        return 0;
    }

    private parseDuration(duration: any): number {
        if (!duration) return 0;
        if (typeof duration === 'number') return duration;

        // Handle Google Duration object
        if (duration.seconds !== undefined) {
            return Number(duration.seconds) + (Number(duration.nanos) || 0) / 1e9;
        }

        // Handle string representation
        if (typeof duration === 'string') {
            const parsed = parseFloat(duration);
            return isNaN(parsed) ? 0 : parsed;
        }

        // Handle Long type from protobuf
        if (duration.toNumber && typeof duration.toNumber === 'function') {
            return duration.toNumber();
        }

        return 0;
    }

    private updateSpeakerStats(
        speakerStats: Map<number, { totalTime: number; segmentCount: number }>,
        segment: SpeakerSegment
    ): void {
        const duration = segment.endTime - segment.startTime;
        const stats = speakerStats.get(segment.speakerTag) || { totalTime: 0, segmentCount: 0 };

        stats.totalTime += duration;
        stats.segmentCount += 1;

        speakerStats.set(segment.speakerTag, stats);
    }

    private extractSpeakerCharacteristics(segments: SpeakerSegment[]) {
        const avgConfidence = segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length;
        const avgSegmentLength = segments.reduce(
            (sum, seg) => sum + (seg.endTime - seg.startTime), 0
        ) / segments.length;

        return {
            confidenceScore: Math.round(avgConfidence * 100) / 100,
            averageSegmentLength: Math.round(avgSegmentLength * 100) / 100
        };
    }

    private detectMessageType(content: string): 'question' | 'response' | 'statement' | 'interruption' | 'unknown' {
        const text = content.toLowerCase().trim();

        // Question indicators
        if (text.endsWith('?') ||
            text.startsWith('what ') || text.startsWith('how ') ||
            text.startsWith('when ') || text.startsWith('where ') ||
            text.startsWith('why ') || text.startsWith('who ') ||
            text.startsWith('can ') || text.startsWith('could ') ||
            text.startsWith('would ') || text.startsWith('should ') ||
            text.startsWith('do ') || text.startsWith('does ') ||
            text.startsWith('did ') || text.startsWith('is ') ||
            text.startsWith('are ') || text.startsWith('will ')) {
            return 'question';
        }

        // Response indicators
        if (text.startsWith('yes ') || text.startsWith('no ') ||
            text.startsWith('sure ') || text.startsWith('okay ') ||
            text.startsWith('right ') || text.startsWith('exactly ') ||
            text.includes('i think') || text.includes('i believe') ||
            text.includes('i would say')) {
            return 'response';
        }

        // Interruption indicators
        if (content.length < 10 || text.includes('wait') || text.includes('sorry') ||
            text.includes('excuse me') || text.includes('hold on')) {
            return 'interruption';
        }

        return 'statement';
    }
}

export const speechToTextService = SpeechToTextService.getInstance();
