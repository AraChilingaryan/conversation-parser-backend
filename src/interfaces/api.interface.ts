// src/interfaces/api.interface.ts

/**
 * API request/response interfaces
 */

// ============================================================================
// GENERIC API RESPONSE WRAPPER
// ============================================================================

export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: APIError;
    metadata?: ResponseMetadata;
}

export interface APIError {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId?: string;
}

export enum APIErrorCodes {
    // Authentication & Authorization
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',

    // User Management
    USER_NOT_FOUND = 'USER_NOT_FOUND',
    USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
    USER_VALIDATION_ERROR = 'USER_VALIDATION_ERROR',

    // RevenueCat Webhook Specific
    REVENUECAT_WEBHOOK_INVALID = 'REVENUECAT_WEBHOOK_INVALID',
    REVENUECAT_PROCESSING_ERROR = 'REVENUECAT_PROCESSING_ERROR',
    SUBSCRIPTION_UPDATE_FAILED = 'SUBSCRIPTION_UPDATE_FAILED',

    // General Request Errors
    BAD_REQUEST = 'BAD_REQUEST',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
    INVALID_REQUEST_FORMAT = 'INVALID_REQUEST_FORMAT',

    // Database Errors
    DATABASE_ERROR = 'DATABASE_ERROR',
    TRANSACTION_FAILED = 'TRANSACTION_FAILED',
    DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

    // Server Errors
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',

    // External Service Errors
    THIRD_PARTY_SERVICE_ERROR = 'THIRD_PARTY_SERVICE_ERROR',
    PAYMENT_PROCESSING_ERROR = 'PAYMENT_PROCESSING_ERROR',

    // Rate Limiting
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',

    // Resource Errors
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
    INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS'
}

export interface APIError {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId?: string;
}

export interface ResponseMetadata {
    requestId: string;
    timestamp: string;
    processingTime: number; // in ms
    version: string;
    rateLimit?: RateLimitInfo;
}

export interface RateLimitInfo {
    limit: number;
    remaining: number;
    resetTime: string;
}

// ============================================================================
// PAGINATION INTERFACES
// ============================================================================

export interface PaginationParams {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        itemsPerPage: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
}

// ============================================================================
// HEALTH CHECK INTERFACES
// ============================================================================
export interface HealthCheckResponse {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: string;
    uptime: number;
    environment: string;
    version: string;
    services: ServiceHealthStatus;
}

export interface ServiceHealthStatus {
    database: ServiceStatus;
    storage: ServiceStatus;
    speechAPI: ServiceStatus;
}

export interface ServiceStatus {
    status: 'up' | 'down' | 'degraded';
    responseTime?: number; // ms
    lastChecked: string;
    error?: string;
}
