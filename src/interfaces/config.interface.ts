// src/interfaces/config.interface.ts

/**
 * Application configuration interfaces
 */

// ============================================================================
// APPLICATION CONFIGURATION
// ============================================================================

export interface AppConfig {
    server: ServerConfig;
    database: DatabaseConfig;
    storage: AppStorageConfig; // Renamed from StorageConfig
    speechToText: SpeechToTextServiceConfig;
    processing: AppProcessingConfig; // Renamed from ProcessingConfig
    security: SecurityConfig;
    logging: LoggingConfig;
    monitoring: MonitoringConfig;
}

// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

export interface ServerConfig {
    port: number;
    host: string;
    environment: Environment;
    corsOrigins: string[];
    maxRequestSize: string; // e.g., '100mb'
    requestTimeout: number; // milliseconds
    rateLimiting: RateLimitConfig;
}

export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface RateLimitConfig {
    enabled: boolean;
    windowMs: number; // time window in milliseconds
    maxRequests: number; // max requests per window
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
}

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

export interface DatabaseConfig {
    provider: 'firebase' | 'postgresql' | 'mongodb';
    connectionString?: string;
    firebase?: FirebaseConfig;
    postgresql?: PostgreSQLConfig;
    mongodb?: MongoDBConfig;
}

export interface FirebaseConfig {
    projectId: string;
    serviceAccountPath: string;
    databaseURL?: string;
    storageBucket: string;
}

export interface PostgreSQLConfig {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    poolSize: number;
}

export interface MongoDBConfig {
    uri: string;
    database: string;
    options: {
        maxPoolSize: number;
        serverSelectionTimeoutMS: number;
    };
}

// ============================================================================
// STORAGE CONFIGURATION
// ============================================================================

export interface AppStorageConfig { // Renamed from StorageConfig
    provider: StorageProvider;
    defaultBucket: string;
    region: string;
    publicAccess: boolean;
    encryption: boolean;
    lifecycle: AppStorageLifecycleConfig; // Renamed from StorageLifecycleConfig
    credentials: StorageCredentials;
}

export type StorageProvider = 'google-cloud' | 'aws-s3' | 'azure-blob' | 'local';

export interface AppStorageLifecycleConfig { // Renamed from StorageLifecycleConfig
    deleteOriginalAfterDays?: number;
    archiveAfterDays?: number;
    cleanupFailedUploads: boolean;
}

export interface StorageCredentials {
    googleCloud?: {
        projectId: string;
        keyFilename: string;
    };
    aws?: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
    };
    azure?: {
        connectionString: string;
    };
}

// ============================================================================
// SPEECH-TO-TEXT SERVICE CONFIGURATION
// ============================================================================

export interface SpeechToTextServiceConfig {
    provider: SpeechProvider;
    google?: GoogleSpeechConfig;
    aws?: AWSTranscribeConfig;
    azure?: AzureSpeechConfig;
    openai?: OpenAISpeechConfig;
    defaultLanguage: string;
    fallbackLanguages: string[];
    retryPolicy: RetryPolicyConfig;
}

export type SpeechProvider = 'google' | 'aws' | 'azure' | 'openai';

export interface GoogleSpeechConfig {
    projectId: string;
    keyFilename: string;
    model: string;
    useEnhanced: boolean;
    enableAutomaticPunctuation: boolean;
    enableWordTimeOffsets: boolean;
    maxAlternatives: number;
}

export interface AWSTranscribeConfig {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    outputBucket: string;
}

export interface AzureSpeechConfig {
    subscriptionKey: string;
    region: string;
    endpoint: string;
}

export interface OpenAISpeechConfig {
    apiKey: string;
    model: string;
    temperature: number;
}

export interface RetryPolicyConfig {
    maxRetries: number;
    initialDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
}

// ============================================================================
// PROCESSING CONFIGURATION
// ============================================================================

export interface AppProcessingConfig { // Renamed from ProcessingConfig
    maxConcurrentJobs: number;
    defaultTimeout: number; // milliseconds
    queueConfig: QueueConfig;
    validation: AppValidationConfig; // Renamed from ValidationConfig
    preprocessing: PreprocessingConfig;
    postprocessing: PostprocessingConfig;
}

export interface QueueConfig {
    provider: 'memory' | 'redis' | 'sqs' | 'pubsub';
    redis?: {
        host: string;
        port: number;
        password?: string;
        db: number;
    };
    sqs?: {
        region: string;
        queueUrl: string;
    };
    pubsub?: {
        projectId: string;
        topicName: string;
        subscriptionName: string;
    };
}

export interface AppValidationConfig { // Renamed from ValidationConfig
    audio: AppAudioValidationConfig; // Renamed from AudioValidationConfig
    strictValidation: boolean;
    autoFixIssues: boolean;
}

export interface AppAudioValidationConfig { // Renamed from AudioValidationConfig
    maxFileSizeMB: number;
    minFileSizeMB: number;
    maxDurationMinutes: number;
    minDurationSeconds: number;
    allowedFormats: string[];
    requiredSampleRate?: number;
    maxChannels: number;
}

export interface PreprocessingConfig {
    enabled: boolean;
    normalize: boolean;
    denoise: boolean;
    resample: {
        enabled: boolean;
        targetSampleRate: number;
    };
    format: {
        convert: boolean;
        targetFormat: string;
    };
}

export interface PostprocessingConfig {
    enabled: boolean;
    enhanceTranscription: boolean;
    detectSentiment: boolean;
    extractTopics: boolean;
    generateSummary: boolean;
}

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

export interface SecurityConfig {
    authentication: AuthenticationConfig;
    authorization: AuthorizationConfig;
    encryption: EncryptionConfig;
    apiSecurity: APISecurityConfig;
}

export interface AuthenticationConfig {
    provider: 'firebase' | 'jwt' | 'oauth' | 'none';
    firebase?: {
        projectId: string;
        serviceAccountPath: string;
    };
    jwt?: {
        secret: string;
        expiresIn: string;
        algorithm: string;
    };
    oauth?: {
        providers: OAuthProvider[];
    };
}

export interface OAuthProvider {
    name: string;
    clientId: string;
    clientSecret: string;
    scope: string[];
}

export interface AuthorizationConfig {
    enabled: boolean;
    defaultRole: string;
    adminRoles: string[];
    guestAccess: boolean;
}

export interface EncryptionConfig {
    atRest: boolean;
    inTransit: boolean;
    algorithm: string;
    keyRotationDays: number;
}

export interface APISecurityConfig {
    apiKeys: {
        enabled: boolean;
        header: string;
        queryParam: string;
    };
    rateLimiting: RateLimitConfig;
    cors: {
        enabled: boolean;
        origins: string[];
        methods: string[];
        headers: string[];
    };
    helmet: {
        enabled: boolean;
        options: Record<string, any>;
    };
}

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

export interface LoggingConfig {
    level: LogLevel;
    format: LogFormat;
    destinations: LogDestination[];
    rotation: LogRotationConfig;
    structured: boolean;
    includeStackTrace: boolean;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type LogFormat = 'json' | 'simple' | 'combined';

export interface LogDestination {
    type: 'console' | 'file' | 'cloud' | 'database';
    config: Record<string, any>;
}

export interface LogRotationConfig {
    enabled: boolean;
    maxFiles: number;
    maxSize: string; // e.g., '10MB'
    frequency: 'daily' | 'weekly' | 'monthly';
}

// ============================================================================
// MONITORING CONFIGURATION
// ============================================================================

export interface MonitoringConfig {
    enabled: boolean;
    metrics: MetricsConfig;
    healthChecks: HealthCheckConfig;
    alerts: AlertConfig;
    tracing: TracingConfig;
}

export interface MetricsConfig {
    provider: 'prometheus' | 'statsd' | 'cloudwatch' | 'stackdriver';
    endpoint?: string;
    interval: number; // seconds
    customMetrics: string[];
}

export interface HealthCheckConfig {
    enabled: boolean;
    endpoint: string;
    interval: number; // seconds
    checks: HealthCheck[];
}

export interface HealthCheck {
    name: string;
    type: 'database' | 'storage' | 'external-api' | 'custom';
    config: Record<string, any>;
    timeout: number; // milliseconds
    critical: boolean;
}

export interface AlertConfig {
    enabled: boolean;
    channels: AlertChannel[];
    rules: AlertRule[];
}

export interface AlertChannel {
    type: 'email' | 'slack' | 'sms' | 'webhook' | 'discord';
    config: {
        email?: {
            to: string[];
            smtp: {
                host: string;
                port: number;
                secure: boolean;
                auth: {
                    user: string;
                    pass: string;
                };
            };
        };
        slack?: {
            webhookUrl: string;
            channel: string;
            username: string;
        };
        sms?: {
            provider: 'twilio' | 'aws-sns';
            credentials: Record<string, any>;
            numbers: string[];
        };
        webhook?: {
            url: string;
            method: 'POST' | 'PUT';
            headers: Record<string, string>;
            authentication?: {
                type: 'bearer' | 'basic' | 'apikey';
                credentials: Record<string, any>;
            };
        };
        discord?: {
            webhookUrl: string;
            username: string;
            avatar?: string;
        };
    };
}

export interface AlertRule {
    name: string;
    condition: AlertCondition;
    severity: AlertSeverity;
    channels: string[]; // Channel names to notify
    cooldown: number; // seconds between alerts
    enabled: boolean;
}

export interface AlertCondition {
    metric: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'ne';
    threshold: number;
    duration: number; // seconds the condition must be true
}

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TracingConfig {
    enabled: boolean;
    provider: 'jaeger' | 'zipkin' | 'opentelemetry' | 'datadog';
    samplingRate: number; // 0.0 to 1.0
    endpoint?: string;
    serviceName: string;
    environment: string;
    tags: Record<string, string>;
}

// ============================================================================
// FEATURE FLAGS CONFIGURATION
// ============================================================================

export interface FeatureFlagsConfig {
    enabled: boolean;
    provider: 'local' | 'launchdarkly' | 'flagsmith' | 'optimizely';
    refreshInterval: number; // seconds
    flags: Record<string, FeatureFlag>;
}

export interface FeatureFlag {
    enabled: boolean;
    description: string;
    rolloutPercentage?: number; // 0-100
    userSegments?: string[];
    environments?: Environment[];
    expiration?: string; // ISO date
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

export interface CacheConfig {
    enabled: boolean;
    provider: 'memory' | 'redis' | 'memcached';
    defaultTtl: number; // seconds
    redis?: {
        host: string;
        port: number;
        password?: string;
        db: number;
        keyPrefix: string;
    };
    memcached?: {
        servers: string[];
        options: Record<string, any>;
    };
    strategies: {
        conversations: CacheStrategy;
        speechResults: CacheStrategy;
        userSessions: CacheStrategy;
    };
}

export interface CacheStrategy {
    enabled: boolean;
    ttl: number; // seconds
    strategy: 'write-through' | 'write-behind' | 'cache-aside';
    invalidateOn?: string[]; // Events that should invalidate cache
}

// ============================================================================
// WEBHOOK CONFIGURATION
// ============================================================================

export interface AppWebhookConfig { // Renamed from WebhookConfig
    enabled: boolean;
    endpoints: AppWebhookEndpoint[]; // Renamed from WebhookEndpoint
    retryPolicy: {
        maxRetries: number;
        backoffMultiplier: number;
        initialDelay: number; // milliseconds
        maxDelay: number; // milliseconds
    };
    security: {
        signRequests: boolean;
        secret?: string;
        algorithm: 'sha256' | 'sha1';
    };
}

export interface AppWebhookEndpoint { // Renamed from WebhookEndpoint
    name: string;
    url: string;
    events: AppWebhookEvent[]; // Renamed from WebhookEvent
    headers?: Record<string, string>;
    authentication?: {
        type: 'bearer' | 'basic' | 'apikey';
        credentials: Record<string, any>;
    };
    enabled: boolean;
}

export type AppWebhookEvent = // Renamed from WebhookEvent
    | 'conversation.created'
    | 'conversation.processing.started'
    | 'conversation.processing.progress'
    | 'conversation.processing.completed'
    | 'conversation.processing.failed'
    | 'conversation.deleted'
    | 'user.created'
    | 'user.updated'
    | 'system.health.degraded'
    | 'system.error.critical';

// ============================================================================
// BACKUP AND RECOVERY CONFIGURATION
// ============================================================================

export interface BackupConfig {
    enabled: boolean;
    schedule: string; // Cron expression
    retention: {
        daily: number; // Keep daily backups for N days
        weekly: number; // Keep weekly backups for N weeks
        monthly: number; // Keep monthly backups for N months
    };
    storage: {
        provider: 'google-cloud' | 'aws-s3' | 'azure-blob';
        bucket: string;
        region: string;
        encryption: boolean;
    };
    notifications: {
        success: boolean;
        failure: boolean;
        channels: string[]; // Alert channel names
    };
}

// ============================================================================
// RATE LIMITING EXTENDED CONFIGURATION
// ============================================================================

export interface ExtendedRateLimitConfig extends RateLimitConfig {
    strategies: Record<string, RateLimitStrategy>;
    whitelist: string[]; // IP addresses or user IDs to exempt
    blacklist: string[]; // IP addresses or user IDs to block
}

export interface RateLimitStrategy {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    keyGenerator?: 'ip' | 'user' | 'apikey' | 'custom';
    customKeyGenerator?: string; // Function name for custom key generation
}
