import {SpeechClient} from '@google-cloud/speech';
import {logger} from '../utils/logger.util';
import type {
    DiarizationResult,
    SpeakerSegment,
    SpeechRecognitionConfig,
    SpeechToTextResponse
} from '../interfaces/audio.interface';
import type {ConversationData} from '../interfaces/conversation.interface';

/**
 * Speech-to-Text service using Google Cloud Speech-to-Text API
 */
export class SpeechToTextService {
    private static instance: SpeechToTextService;
    private speechClient: SpeechClient;

    private constructor() {
        // Resolve relative path to absolute
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.startsWith('./') || process.env.GOOGLE_APPLICATION_CREDENTIALS?.startsWith('../')) {
            const path = require('path');
            process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
        }

        this.speechClient = new SpeechClient();
    }

    static getInstance(): SpeechToTextService {
        if (!SpeechToTextService.instance) {
            SpeechToTextService.instance = new SpeechToTextService();
        }
        return SpeechToTextService.instance;
    }

    /**
     * Process audio file and extract speech with speaker diarization
     */
    async processAudioFile(audioUrl: string, config: SpeechRecognitionConfig): Promise<SpeechToTextResponse> {
        try {
            logger.info(`Starting speech-to-text processing for: ${audioUrl}`);

            const request = {
                audio: {
                    uri: audioUrl,
                },
                config: {
                    encoding: config.encoding as any,
                    sampleRateHertz: config.sampleRateHertz,
                    languageCode: config.languageCode,
                    alternativeLanguageCodes: config.alternativeLanguageCodes || [],
                    maxAlternatives: config.maxAlternatives || 1,
                    profanityFilter: config.profanityFilter || false,
                    speechContexts: config.speechContexts || [],
                    enableWordTimeOffsets: config.enableWordTimeOffsets || true,
                    enableAutomaticPunctuation: config.enableAutomaticPunctuation || true,
                    diarizationConfig: config.diarizationConfig || {
                        enableSpeakerDiarization: true,
                        minSpeakerCount: 1,
                        maxSpeakerCount: 6
                    },
                    model: config.model as any || 'latest_long',
                    useEnhanced: config.useEnhanced || true
                },
            };

            logger.debug('Speech-to-Text request configuration:', {
                encoding: request.config.encoding,
                sampleRate: request.config.sampleRateHertz,
                language: request.config.languageCode,
                diarization: request.config.diarizationConfig?.enableSpeakerDiarization
            });

            const [operation] = await this.speechClient.longRunningRecognize(request);
            logger.info('Speech-to-Text operation started, waiting for completion...');

            const [response] = await operation.promise();

            if (!response.results || response.results.length === 0) {
                logger.warn('No speech recognition results returned');
                return {
                    results: [],
                    totalBilledTime: 0
                };
            }

            logger.info(`Speech-to-Text completed. Found ${response.results.length} result segments`);

            return {
                results: response.results || [],
                totalBilledTime: this.parseDuration(response.totalBilledTime)
            };

        } catch (error) {
            logger.error('Speech-to-Text processing failed:', error);
            throw new Error(`Speech processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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
            totalDuration
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
                identifiedName: undefined, // Will be populated in conversation parser
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
                alternatives: [] // Could be populated from alternative transcriptions
            });
        });

        // Update speaker message counts
        speakers.forEach(speaker => {
            speaker.messageCount = messages.filter(msg => msg.speakerId === speaker.id).length;
        });

        logger.info(`Converted to conversation format: ${speakers.length} speakers, ${messages.length} messages`);

        return {speakers, messages};
    }

    /**
     * Get audio encoding from file format
     */
    getAudioEncoding(mimeType: string, format: string): string {
        const encodingMap: Record<string, string> = {
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
     * Estimate sample rate from audio metadata
     */
    estimateSampleRate(metadata: any): number {
        // Default sample rates by format
        const defaultRates: Record<string, number> = {
            'wav': 44100,
            'mp3': 44100,
            'm4a': 44100,
            'webm': 48000,
            'ogg': 44100
        };

        return metadata.sampleRate || defaultRates[metadata.format] || 16000;
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

    private transformResults(googleResults: any[]): any[] {
        return googleResults.map(result => ({
            alternatives: (result.alternatives || []).map((alt: any) => ({
                transcript: alt.transcript || '',
                confidence: alt.confidence || 0,
                words: (alt.words || []).map((word: any) => ({
                    startTime: this.parseTime(word.startTime),
                    endTime: this.parseTime(word.endTime),
                    word: word.word || '',
                    confidence: word.confidence || 0,
                    speakerTag: word.speakerTag
                }))
            })),
            channelTag: result.channelTag,
            languageCode: result.languageCode
        }));
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
        const stats = speakerStats.get(segment.speakerTag) || {totalTime: 0, segmentCount: 0};

        stats.totalTime += duration;
        stats.segmentCount += 1;

        speakerStats.set(segment.speakerTag, stats);
    }

    private extractSpeakerCharacteristics(segments: SpeakerSegment[]) {
        // Basic characteristic extraction - could be enhanced
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
