// src/repositories/conversation.repository.ts

import {BaseFirestoreRepository} from './base.repository';
import type {
    ConversationData,
    ConversationSearchParams,
    ConversationStatus,
    ConversationSummary,
    ProcessingLogEntry
} from '../interfaces/conversation.interface';
import {logger} from '../utils/logger.util';
import admin from "firebase-admin";

/**
 * Repository for conversation data operations
 */
export class ConversationRepository extends BaseFirestoreRepository<ConversationData> {
    constructor() {
        super('conversations');
    }

    /**
     * Find conversations with search and filter options
     */
    async findConversations(
        searchParams: ConversationSearchParams
    ): Promise<{
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
    }> {
        try {
            const {
                page = 1,
                limit = 20,
                sortBy = 'createdAt',
                sortOrder = 'desc',
                status,
                language,
                dateFrom,
                dateTo,
                minDuration,
                maxDuration,
                searchTerm,
            } = searchParams;

            // Build filters
            const filters: Record<string, any> = {};
            if (status) filters.status = status;
            if (language) filters['metadata.language'] = language;

            // Date range filtering (needs special handling in Firestore)
            let query: admin.firestore.Query<admin.firestore.DocumentData> = this.firestore.collection(this.collectionName);


            // Apply basic filters
            Object.entries(filters).forEach(([key, value]) => {
                query = query.where(key, '==', value);
            });

            // Apply date range filters
            if (dateFrom) {
                query = query.where('createdAt', '>=', new Date(dateFrom));
            }
            if (dateTo) {
                query = query.where('createdAt', '<=', new Date(dateTo));
            }

            // Apply ordering
            query = query.orderBy(sortBy, sortOrder);

            // Apply pagination
            const offset = (page - 1) * limit;
            query = query.offset(offset).limit(limit + 1); // +1 to check hasMore

            const snapshot = await query.get();
            let conversations = snapshot.docs.map(doc => this.transformFromStorage(doc.data()));

            // Check if there are more results
            const hasMore = conversations.length > limit;
            if (hasMore) {
                conversations.pop(); // Remove the extra item
            }

            // Apply duration filters (post-query filtering)
            if (minDuration !== undefined || maxDuration !== undefined) {
                conversations = conversations.filter(conv => {
                    const duration = conv.metadata.duration;
                    if (minDuration !== undefined && duration < minDuration) return false;
                    if (maxDuration !== undefined && duration > maxDuration) return false;
                    return true;
                });
            }

            // Apply search term filtering (post-query filtering)
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                conversations = conversations.filter(conv =>
                    conv.metadata.title.toLowerCase().includes(searchLower) ||
                    (conv.metadata.description?.toLowerCase().includes(searchLower))
                );
            }

            // Transform to ConversationSummary
            const summaries: ConversationSummary[] = conversations.map(conv => ({
                conversationId: conv.conversationId,
                title: conv.metadata.title,
                status: conv.status,
                duration: conv.metadata.duration,
                speakerCount: conv.speakers.length,
                messageCount: conv.messages.length,
                createdAt: conv.createdAt,
                language: conv.metadata.language,
            }));

            // Get total count for pagination (this requires a separate query)
            const totalQuery = this.firestore.collection(this.collectionName);
            const totalSnapshot = await totalQuery.count().get();
            const totalItems = totalSnapshot.data().count;

            // Get filter data
            const filtersData = await this.getFilterData();

            return {
                data: summaries,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalItems / limit),
                    totalItems,
                    itemsPerPage: limit,
                    hasNextPage: hasMore,
                    hasPreviousPage: page > 1,
                },
                filters: filtersData,
            };
        } catch (error) {
            logger.error('Error finding conversations:', error);
            throw new Error(`Failed to find conversations: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update conversation status
     */
    async updateStatus(
        conversationId: string,
        status: ConversationStatus,
        processingLogEntry?: ProcessingLogEntry
    ): Promise<void> {
        try {
            const updateData: Partial<ConversationData> = {
                status,
            };

            // Add processing log entry if provided
            if (processingLogEntry) {
                const conversation = await this.findById(conversationId);
                if (conversation) {
                    const currentLog = conversation.processingLog || [];
                    updateData.processingLog = [...currentLog, processingLogEntry];
                }
            }

            await this.update(conversationId, updateData);
            logger.debug(`Updated conversation status: ${conversationId} -> ${status}`);
        } catch (error) {
            logger.error('Error updating conversation status:', error);
            throw new Error(`Failed to update conversation status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Add processing log entry
     */
    async addProcessingLogEntry(
        conversationId: string,
        logEntry: ProcessingLogEntry
    ): Promise<void> {
        try {
            const conversation = await this.findById(conversationId);
            if (!conversation) {
                throw new Error(`Conversation not found: ${conversationId}`);
            }

            const currentLog = conversation.processingLog || [];
            await this.update(conversationId, {
                processingLog: [...currentLog, logEntry],
            });

            logger.debug(`Added processing log entry for conversation: ${conversationId}`);
        } catch (error) {
            logger.error('Error adding processing log entry:', error);
            throw error;
        }
    }

    /**
     * Update conversation metadata
     */
    async updateMetadata(
        conversationId: string,
        metadata: Partial<ConversationData['metadata']>
    ): Promise<void> {
        try {
            const conversation = await this.findById(conversationId);
            if (!conversation) {
                throw new Error(`Conversation not found: ${conversationId}`);
            }

            await this.update(conversationId, {
                metadata: {...conversation.metadata, ...metadata},
            });

            logger.debug(`Updated conversation metadata: ${conversationId}`);
        } catch (error) {
            logger.error('Error updating conversation metadata:', error);
            throw error;
        }
    }

    /**
     * Get conversations by status
     */
    async findByStatus(status: ConversationStatus): Promise<ConversationData[]> {
        try {
            const result = await this.findMany({status});
            return result.data;
        } catch (error) {
            logger.error('Error finding conversations by status:', error);
            throw error;
        }
    }

    /**
     * Get processing statistics
     */
    async getProcessingStats(): Promise<{
        total: number;
        byStatus: Record<ConversationStatus, number>;
        avgProcessingTime: number;
        recentFailures: number;
    }> {
        try {
            const allConversations = await this.findMany({}, {limit: 1000});
            const conversations = allConversations.data;

            const stats = {
                total: conversations.length,
                byStatus: {} as Record<ConversationStatus, number>,
                avgProcessingTime: 0,
                recentFailures: 0,
            };

            // Count by status
            const statusCounts: Record<string, number> = {};
            let totalProcessingTime = 0;
            let completedCount = 0;
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            conversations.forEach(conv => {
                statusCounts[conv.status] = (statusCounts[conv.status] || 0) + 1;

                // Calculate processing time for completed conversations
                if (conv.status === 'completed' && conv.processingLog) {
                    const startEntry = conv.processingLog.find(log => log.stage === 'upload');
                    const endEntry = conv.processingLog.find(log => log.stage === 'completion');

                    if (startEntry && endEntry) {
                        const processingTime = new Date(endEntry.timestamp).getTime() - new Date(startEntry.timestamp).getTime();
                        totalProcessingTime += processingTime;
                        completedCount++;
                    }
                }

                // Count recent failures
                if (conv.status === 'failed' && new Date(conv.updatedAt) > oneDayAgo) {
                    stats.recentFailures++;
                }
            });

            stats.byStatus = statusCounts as Record<ConversationStatus, number>;
            stats.avgProcessingTime = completedCount > 0 ? totalProcessingTime / completedCount : 0;

            return stats;
        } catch (error) {
            logger.error('Error getting processing stats:', error);
            throw error;
        }
    }

    /**
     * Clean up old conversations (for maintenance)
     */
    async cleanupOldConversations(olderThanDays: number): Promise<number> {
        try {
            const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

            const query = this.firestore.collection(this.collectionName)
                .where('createdAt', '<', cutoffDate)
                .where('status', 'in', ['completed', 'failed']);

            const snapshot = await query.get();

            if (snapshot.empty) {
                return 0;
            }

            // Delete in batches
            const batch = this.firestore.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();

            logger.info(`Cleaned up ${snapshot.docs.length} old conversations`);
            return snapshot.docs.length;
        } catch (error) {
            logger.error('Error cleaning up old conversations:', error);
            throw error;
        }
    }

    /**
     * Get filter data for search interface
     */
    private async getFilterData(): Promise<{
        availableLanguages: string[];
        statusCounts: Record<ConversationStatus, number>;
    }> {
        try {
            // This is a simplified version. In production, you might want to cache this data
            const allConversations = await this.findMany({}, {limit: 1000});

            const languages = new Set<string>();
            const statusCounts: Record<string, number> = {};

            allConversations.data.forEach(conv => {
                languages.add(conv.metadata.language);
                statusCounts[conv.status] = (statusCounts[conv.status] || 0) + 1;
            });

            return {
                availableLanguages: Array.from(languages),
                statusCounts: statusCounts as Record<ConversationStatus, number>,
            };
        } catch (error) {
            logger.error('Error getting filter data:', error);
            return {
                availableLanguages: [],
                statusCounts: {} as Record<ConversationStatus, number>,
            };
        }
    }

    /**
     * Override storage transformation for conversations
     */
    /**
     * Override storage transformation for conversations
     */
    protected override prepareForStorage(data: ConversationData): Record<string, any> {
        // Convert ISO date strings to Firestore timestamps for proper querying
        const storageData = {...data} as any;

        if (storageData.createdAt && typeof storageData.createdAt === 'string') {
            storageData.createdAt = new Date(storageData.createdAt);
        }

        if (storageData.updatedAt && typeof storageData.updatedAt === 'string') {
            storageData.updatedAt = new Date(storageData.updatedAt);
        }

        // Convert processing log timestamps
        if (storageData.processingLog) {
            storageData.processingLog = storageData.processingLog.map((entry: any) => ({
                ...entry,
                timestamp: typeof entry.timestamp === 'string' ? new Date(entry.timestamp) : entry.timestamp,
            }));
        }

        // Convert metadata dates
        if (storageData.metadata) {
            if (storageData.metadata.recordingDate && typeof storageData.metadata.recordingDate === 'string') {
                storageData.metadata.recordingDate = new Date(storageData.metadata.recordingDate);
            }
            if (storageData.metadata.processingDate && typeof storageData.metadata.processingDate === 'string') {
                storageData.metadata.processingDate = new Date(storageData.metadata.processingDate);
            }
        }

        return storageData;
    }

    /**
     * Override retrieval transformation for conversations
     */
    protected override transformFromStorage(data: Record<string, any>): ConversationData {
        const transformed = super.transformFromStorage(data);

        // Ensure all required fields have default values
        return {
            ...transformed,
            speakers: transformed.speakers || [],
            messages: transformed.messages || [],
            processingLog: transformed.processingLog || [],
            insights: transformed.insights || {
                totalMessages: 0,
                questionCount: 0,
                responseCount: 0,
                statementCount: 0,
                averageMessageLength: 0,
                longestMessage: {messageId: '', length: 0},
                conversationFlow: 'unknown',
                speakingTimeDistribution: [],
            },
        } as ConversationData;
    }
}

// Export singleton instance for dependency injection
export const conversationRepository = new ConversationRepository();
