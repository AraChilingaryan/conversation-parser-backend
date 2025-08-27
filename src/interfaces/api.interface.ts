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
