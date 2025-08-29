// src/interfaces/audio.interface.ts

/**
 * Audio processing and file handling interfaces
 */

// ============================================================================
// AUDIO FILE INTERFACES
// ============================================================================

export interface AudioFile {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number; // in bytes
    duration?: number; // in seconds (if detectable)
    sampleRate?: number; // Hz
    channels?: number; // 1 for mono, 2 for stereo
    encoding?: AudioEncoding;
}

export type AudioEncoding =
    | 'LINEAR16'
    | 'MP3'
    | 'FLAC'
    | 'MULAW'
    | 'AMR'
    | 'AMR_WB'
    | 'OGG_OPUS'
    | 'WEBM_OPUS';

export interface AudioMetadata {
    format: string;
    duration: number; // seconds
    sampleRate: number; // Hz
    channels: number;
    bitrate?: number; // kbps
    codec?: string;
    size: number; // bytes
}

// ============================================================================
// AUDIO VALIDATION INTERFACES
// ============================================================================

export interface AudioValidationConfig {
    maxFileSize: number; // bytes
    minFileSize: number; // bytes
    maxDuration: number; // seconds
    minDuration: number; // seconds
    allowedFormats: string[]; // mime types
    allowedExtensions: string[];
    minSampleRate?: number; // Hz
    maxChannels?: number;
}

export interface AudioValidationResult {
    isValid: boolean;
    errors: AudioValidationError[];
    warnings: AudioValidationWarning[];
    metadata: AudioMetadata;
}

export interface AudioValidationError {
    code: AudioValidationErrorCode;
    message: string;
    field: string;
    value: any;
    constraint: any;
}

export interface AudioValidationWarning {
    code: AudioValidationWarningCode;
    message: string;
    recommendation: string;
}

export type AudioValidationErrorCode =
    | 'FILE_TOO_LARGE'
    | 'FILE_TOO_SMALL'
    | 'DURATION_TOO_LONG'
    | 'DURATION_TOO_SHORT'
    | 'UNSUPPORTED_FORMAT'
    | 'UNSUPPORTED_EXTENSION'
    | 'CORRUPTED_FILE'
    | 'NO_AUDIO_CONTENT'
    | 'SAMPLE_RATE_TOO_LOW'
    | 'TOO_MANY_CHANNELS'
    | 'VALIDATION_ERROR';

export type AudioValidationWarningCode =
    | 'LOW_SAMPLE_RATE'
    | 'MONO_AUDIO'
    | 'COMPRESSED_FORMAT'
    | 'UNUSUAL_DURATION'
    | 'LARGE_FILE_SIZE'
    | 'LONG_DURATION';

// ============================================================================
// SPEECH-TO-TEXT SERVICE INTERFACES
// ============================================================================

export interface SpeechToTextRequest {
    audioFile: AudioFile;
    config: SpeechRecognitionConfig;
}

export interface SpeechRecognitionConfig {
    encoding: AudioEncoding;
    sampleRateHertz: number;
    languageCode: string;
    alternativeLanguageCodes?: string[];
    maxAlternatives?: number;
    profanityFilter?: boolean;
    speechContexts?: SpeechContext[];
    enableWordTimeOffsets?: boolean;
    enableAutomaticPunctuation?: boolean;
    diarizationConfig?: SpeakerDiarizationConfig;
    model?: RecognitionModel;
    useEnhanced?: boolean;
}

export interface SpeechContext {
    phrases: string[];
    boost?: number; // -20.0 to 20.0
}

export interface SpeakerDiarizationConfig {
    enableSpeakerDiarization: boolean;
    minSpeakerCount?: number;
    maxSpeakerCount?: number;
    speakerTag?: number;
}

export type RecognitionModel =
    | 'command_and_search'
    | 'phone_call'
    | 'video'
    | 'default'
    | 'medical_conversation'
    | 'medical_dictation'
    | 'latest_long'
    | 'latest_short'
    | string;

// ============================================================================
// SPEECH-TO-TEXT RESPONSE INTERFACES
// ============================================================================

export interface SpeechToTextResponse {
    results: any[];
    totalBilledTime: number;
    requestId?: string;
}

export interface SpeechRecognitionResult {
    alternatives: SpeechRecognitionAlternative[];
    channelTag?: number;
    languageCode?: string;
}

export interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
    words?: WordInfo[];
}

export interface WordInfo {
    startTime: number; // seconds
    endTime: number; // seconds
    word: string;
    confidence: number;
    speakerTag?: number;
}

// ============================================================================
// SPEAKER DIARIZATION INTERFACES
// ============================================================================

export interface DiarizationResult {
    segments: SpeakerSegment[];
    speakerCount: number;
    totalDuration: number;
}

export interface SpeakerSegment {
    speakerTag: number;
    startTime: number; // seconds
    endTime: number; // seconds
    confidence: number;
    transcript?: string;
    words?: WordInfo[];
}

export interface SpeakerProfile {
    tag: number;
    totalSpeakingTime: number;
    segmentCount: number;
    averageSegmentLength: number;
    characteristics?: {
        pitch?: 'low' | 'medium' | 'high';
        speakingRate?: number; // words per minute
        confidenceScore?: number;
    };
}

// ============================================================================
// AUDIO PROCESSING PIPELINE INTERFACES
// ============================================================================

export interface AudioProcessingPipeline {
    steps: ProcessingStep[];
    currentStep: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime?: Date;
    endTime?: Date;
    errors?: ProcessingStepError[];
}

export interface ProcessingStep {
    name: string;
    description: string;
    status: ProcessingStepStatus;
    startTime?: Date;
    endTime?: Date;
    duration?: number; // milliseconds
    progress?: number; // 0-100
    result?: any;
    error?: ProcessingStepError;
}

export type ProcessingStepStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped';

export interface ProcessingStepError {
    code: string;
    message: string;
    details?: Record<string, any>;
    retryable: boolean;
    stack?: string;
}

// ============================================================================
// AUDIO STORAGE INTERFACES
// ============================================================================

export interface StorageConfig {
    provider: 'google' | 'aws' | 'azure' | 'local';
    bucket: string;
    region?: string;
    publicRead?: boolean;
    encryption?: boolean;
    lifecycle?: StorageLifecycleConfig;
}

export interface StorageLifecycleConfig {
    deleteAfterDays?: number;
    archiveAfterDays?: number;
    transitionToIA?: number; // Infrequent Access after days
}

export interface StoredAudioFile {
    id: string;
    conversationId: string;
    originalName: string;
    storageKey: string;
    url?: string; // Public URL if available
    signedUrl?: string; // Temporary signed URL
    size: number;
    uploadedAt: Date;
    metadata: AudioMetadata;
}

export interface StorageUploadResult {
    success: boolean;
    file?: StoredAudioFile;
    error?: {
        code: string;
        message: string;
    };
}

// ============================================================================
// AUDIO PREPROCESSING INTERFACES
// ============================================================================

export interface AudioPreprocessingConfig {
    normalize?: boolean; // Normalize audio levels
    denoise?: boolean; // Reduce background noise
    resample?: {
        targetSampleRate: number;
        quality: 'fast' | 'medium' | 'high';
    };
    format?: {
        targetFormat: AudioEncoding;
        quality?: number; // 0-100
    };
    channels?: {
        convert: 'mono' | 'stereo' | 'keep';
    };
}

export interface PreprocessingResult {
    originalFile: AudioFile;
    processedFile: AudioFile;
    changes: PreprocessingChange[];
    processingTime: number; // milliseconds
}

export interface PreprocessingChange {
    operation: string;
    before: any;
    after: any;
    improvement?: string;
}

// ============================================================================
// AUDIO ANALYSIS INTERFACES
// ============================================================================

export interface AudioAnalysisResult {
    duration: number; // seconds
    sampleRate: number;
    channels: number;
    averageVolume: number; // dB
    peakVolume: number; // dB
    silenceDetection: SilenceSegment[];
    speechSegments: SpeechSegment[];
    quality: AudioQualityAssessment;
}

export interface SilenceSegment {
    startTime: number;
    endTime: number;
    duration: number;
}

export interface SpeechSegment {
    startTime: number;
    endTime: number;
    duration: number;
    averageVolume: number;
    estimatedSpeakers?: number;
}

export interface AudioQualityAssessment {
    overall: 'excellent' | 'good' | 'fair' | 'poor';
    score: number; // 0-100
    issues: AudioQualityIssue[];
    recommendations: string[];
}

export interface AudioQualityIssue {
    type: 'low_volume' | 'noise' | 'distortion' | 'clipping' | 'echo';
    severity: 'low' | 'medium' | 'high';
    description: string;
    timeRanges?: Array<{start: number; end: number}>;
}
