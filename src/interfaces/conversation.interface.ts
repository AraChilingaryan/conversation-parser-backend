// src/interfaces/conversation.interface.ts

/**
 * Core conversation data structures for the conversation parser
 */

// ============================================================================
// CONVERSATION METADATA
// ============================================================================

export interface ConversationMetadata {
    title: string;
    description?: string;
    duration: number; // in seconds
    language: string; // ISO language code (en-US, es-ES, etc.)
    recordingDate: string; // ISO date string
    processingDate: string; // ISO date string
    confidence: number; // Overall transcription confidence (0-1)
    fileSize: number; // Original file size in bytes
    originalFileName: string;
    audioFormat: AudioFormat;
}

export type AudioFormat = 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg' | 'mpeg';

// ============================================================================
// SPEAKER INFORMATION
// ============================================================================

export interface Speaker {
    id: string; // Unique speaker ID (speaker_1, speaker_2, etc.)
    label: string; // Display label ("Speaker 1", "Speaker 2", etc.)
    identifiedName?: string; // User-assigned name (optional)
    totalSpeakingTime: number; // Total seconds this speaker spoke
    messageCount: number; // Number of messages from this speaker
    characteristics?: SpeakerCharacteristics;
}

export interface SpeakerCharacteristics {
    averagePitch?: 'low' | 'medium' | 'high';
    estimatedGender?: 'male' | 'female' | 'unknown';
    speakingRate?: number; // Words per minute
    confidenceScore?: number; // How confident we are about this speaker (0-1)
}

// ============================================================================
// CONVERSATION MESSAGES
// ============================================================================

export interface Message {
    messageId: string; // Unique message identifier
    speakerId: string; // References Speaker.id
    content: string; // Transcribed text
    startTime: number; // Start time in seconds
    endTime: number; // End time in seconds
    confidence: number; // Transcription confidence for this message (0-1)
    messageType: MessageType;
    order: number; // Sequential order in conversation
    wordCount: number; // Number of words in message
    alternatives?: MessageAlternative[]; // Alternative transcriptions
}

export type MessageType = 'question' | 'response' | 'statement' | 'interruption' | 'unknown';

export interface MessageAlternative {
    content: string;
    confidence: number;
}

// ============================================================================
// CONVERSATION INSIGHTS
// ============================================================================

export interface ConversationInsights {
    totalMessages: number;
    questionCount: number;
    responseCount: number;
    statementCount: number;
    averageMessageLength: number; // In words
    longestMessage: {
        messageId: string;
        length: number;
    };
    conversationFlow: ConversationFlow;
    speakingTimeDistribution: SpeakingTimeDistribution[];
    topics?: string[]; // Detected topics (future enhancement)
    sentiment?: ConversationSentiment; // Sentiment analysis (future enhancement)
}

export type ConversationFlow =
    | 'question_answer_pattern'
    | 'discussion'
    | 'monologue'
    | 'interview'
    | 'meeting'
    | 'unknown';

export interface SpeakingTimeDistribution {
    speakerId: string;
    percentage: number;
    totalTime: number;
}

export interface ConversationSentiment {
    overall: 'positive' | 'negative' | 'neutral';
    confidence: number;
    breakdown: {
        positive: number;
        negative: number;
        neutral: number;
    };
}

// ============================================================================
// MAIN CONVERSATION DATA STRUCTURE
// ============================================================================

export interface ConversationData {
    conversationId: string;
    status: ConversationStatus;
    metadata: ConversationMetadata;
    speakers: Speaker[];
    messages: Message[];
    insights: ConversationInsights;
    createdAt: string; // ISO date string
    updatedAt: string; // ISO date string
    processingLog?: ProcessingLogEntry[]; // For debugging
}

export type ConversationStatus =
    | 'uploaded'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'deleted';

export interface ProcessingLogEntry {
    timestamp: string;
    stage: ProcessingStage;
    message: string;
    duration?: number; // Processing time in ms
    error?: string;
}

export type ProcessingStage =
    | 'upload'
    | 'validation'
    | 'diarization'
    | 'transcription'
    | 'parsing'
    | 'insights'
    | 'completion';

// ============================================================================
// AUDIO PROCESSING CONFIGURATION
// ============================================================================

export interface AudioProcessingConfig {
    speechToText: SpeechToTextConfig;
    diarization: DiarizationConfig;
    parsing: ParsingConfig;
    output: OutputConfig;
}

export interface SpeechToTextConfig {
    provider: 'google' | 'aws' | 'azure' | 'whisper'; // For future extensibility
    language: string; // Primary language
    alternativeLanguages?: string[]; // Secondary languages to try
    enableAutomaticPunctuation: boolean;
    enableWordTimeOffsets: boolean;
    profanityFilter: boolean;
    speechContexts?: string[]; // Custom vocabulary
    model?: 'default' | 'phone_call' | 'video' | 'command_and_search';
}

export interface DiarizationConfig {
    enableSpeakerDiarization: boolean;
    minSpeakers?: number; // Minimum expected speakers
    maxSpeakers?: number; // Maximum expected speakers
    speakerTag?: number; // For single speaker override
}

export interface ParsingConfig {
    detectQuestions: boolean;
    detectInterruptions: boolean;
    groupSimilarMessages: boolean;
    minimumMessageLength: number; // In words
    confidenceThreshold: number; // Minimum confidence to include message
    enableInsights: boolean;
    enableSentimentAnalysis: boolean; // Future feature
}

export interface OutputConfig {
    includeTimestamps: boolean;
    includeConfidenceScores: boolean;
    includeAlternatives: boolean;
    includeInsights: boolean;
    includeProcessingLog: boolean;
    format: 'standard' | 'detailed' | 'minimal';
}

// ============================================================================
// API REQUEST/RESPONSE INTERFACES FOR CONVERSATIONS
// ============================================================================

export interface UploadConversationRequest {
    title?: string;
    description?: string;
    language?: string;
    config?: Partial<AudioProcessingConfig>;
}

export interface UploadConversationResponse {
    conversationId: string;
    status: ConversationStatus;
    message: string;
    estimatedProcessingTime?: number; // in seconds
    statusCheckUrl: string;
    originalFileName: string;
    fileSize: number;
}

export interface ConversationStatusResponse {
    conversationId: string;
    status: ConversationStatus;
    progress?: ProcessingProgress;
    result?: ConversationData;
    error?: ProcessingError;
    estimatedTimeRemaining?: number; // in seconds
}

export interface ProcessingProgress {
    stage: ProcessingStage;
    percentage: number; // 0-100
    currentStep: string;
    stepsCompleted: number;
    totalSteps: number;
}

export interface ProcessingError {
    code: string;
    message: string;
    stage: ProcessingStage;
    details?: Record<string, any>;
    retryable: boolean;
}

// ============================================================================
// CONVERSATION LIST/SEARCH INTERFACES
// ============================================================================

export interface ConversationSummary {
    conversationId: string;
    title: string;
    status: ConversationStatus;
    duration: number;
    speakerCount: number;
    messageCount: number;
    createdAt: string;
    language: string;
}

export interface ConversationSearchParams {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: ConversationStatus;
    language?: string;
    dateFrom?: string;
    dateTo?: string;
    minDuration?: number;
    maxDuration?: number;
    searchTerm?: string; // Search in title/content
}

export interface ConversationListResponse {
    data: ConversationSummary[];
    pagination: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        itemsPerPage: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    filters: {
        availableLanguages: string[];
        statusCounts: Record<ConversationStatus, number>;
    };
}
