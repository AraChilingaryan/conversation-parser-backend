import { databaseConfig } from '../config/database.config';
import { conversationRepository } from '../repositories/conversation.repository';
import { logger } from '../utils/logger.util';

export class DatabaseService {
    private static instance: DatabaseService;

    private constructor() {}

    static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    async initialize(): Promise<void> {
        try {
            await databaseConfig.initialize();
            logger.info('Database service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize database service:', error);
            throw error;
        }
    }

    get conversations() {
        return conversationRepository;
    }
}

export const databaseService = DatabaseService.getInstance();
