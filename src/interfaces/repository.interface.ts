/**
 * Repository interfaces for data access layer
 */

export interface BaseRepository<T> {
    create(data: T): Promise<string>;
    findById(id: string): Promise<T | null>;
    update(id: string, data: Partial<T>): Promise<void>;
    delete(id: string): Promise<void>;
    exists(id: string): Promise<boolean>;
}

export interface PaginatedQuery<T> {
    data: T[];
    hasMore: boolean;
    nextCursor?: string;
    totalCount?: number;
}

export interface QueryOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
    cursor?: string; // For cursor-based pagination
}

export interface FilterOptions {
    [key: string]: any;
}
