import {BaseFirestoreRepository} from "../repositories/base.repository";
import {Recording} from "../interfaces/user.interface";
import {logger} from "../utils/logger.util";

export class RecordingRepository extends BaseFirestoreRepository<Recording> {
    constructor() {
        super('recordings');
    }

    /**
     * Create a new recording using the base repository method
     */
    async createRecording(recording: Omit<Recording, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        try {
            logger.info('Creating new recording:', {
                callSid: recording.callSid,
                userId: recording.userId,
                duration: recording.recordingDuration
            });

            // Use the base repository's create method which handles ID generation and timestamps
            const recordingId = await this.create(recording as Recording);

            logger.info(`Recording created successfully with ID: ${recordingId}`);
            return recordingId;
        } catch (error) {
            logger.error('Error creating recording:', error);
            throw new Error(`Failed to create recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find recordings by user ID
     */
    async findByUserId(userId: string, options: { limit?: number; offset?: number } = {}): Promise<Recording[]> {
        try {
            const result = await this.findMany({ userId }, options);
            return result.data;
        } catch (error) {
            logger.error('Error finding recordings by user ID:', error);
            throw new Error(`Failed to find recordings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find recording by call SID
     */
    async findByCallSid(callSid: string): Promise<Recording | null> {
        try {
            const result = await this.findMany({ callSid }, { limit: 1 });
            return result.data.length > 0 ? result.data[0] : null;
        } catch (error) {
            logger.error('Error finding recording by call SID:', error);
            throw new Error(`Failed to find recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update recording processing status
     */
    async updateProcessingStatus(
        recordingId: string,
        status: Recording['transcriptionStatus'],
        conversationId?: string
    ): Promise<void> {
        try {
            const updateData: Partial<Recording> = {
                transcriptionStatus: status,
                processed: status === 'completed',
                ...(conversationId && { conversationId })
            };

            await this.update(recordingId, updateData);
            logger.info(`Recording processing status updated: ${recordingId} -> ${status}`);
        } catch (error) {
            logger.error('Error updating recording processing status:', error);
            throw error;
        }
    }

    /**
     * Get recordings ready for processing (pending status)
     */
    async getPendingRecordings(limit: number = 10): Promise<Recording[]> {
        try {
            const result = await this.findMany(
                { transcriptionStatus: 'pending' },
                { limit, orderBy: 'createdAt', orderDirection: 'asc' }
            );
            return result.data;
        } catch (error) {
            logger.error('Error getting pending recordings:', error);
            throw new Error(`Failed to get pending recordings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find recordings by phone number
     */
    async findByFromNumber(fromNumber: string, options: { limit?: number; offset?: number } = {}): Promise<Recording[]> {
        try {
            const result = await this.findMany({ fromNumber }, options);
            return result.data;
        } catch (error) {
            logger.error('Error finding recordings by from number:', error);
            throw new Error(`Failed to find recordings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get recording statistics for a user
     */
    async getUserRecordingStats(userId: string): Promise<{
        totalRecordings: number;
        totalDuration: number;
        processedCount: number;
        pendingCount: number;
    }> {
        try {
            const recordings = await this.findByUserId(userId);

            const stats = recordings.reduce((acc, recording) => {
                acc.totalRecordings += 1;
                acc.totalDuration += recording.recordingDuration;
                if (recording.processed) acc.processedCount += 1;
                if (recording.transcriptionStatus === 'pending') acc.pendingCount += 1;
                return acc;
            }, {
                totalRecordings: 0,
                totalDuration: 0,
                processedCount: 0,
                pendingCount: 0
            });

            return stats;
        } catch (error) {
            logger.error('Error getting user recording stats:', error);
            throw new Error(`Failed to get recording stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

export const recordingRepository = new RecordingRepository();
