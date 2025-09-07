import { databaseConfig } from '../config/database.config';
import { conversationRepository } from '../repositories/conversation.repository';
import { logger } from '../utils/logger.util';
import {userRepository} from "../repositories/user.repository";
import {recordingRepository} from "../repositories/recording.repository";

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

    get users() {
        return userRepository;
    }


    get recordings() {
        return recordingRepository;
    }
}

export const databaseService = DatabaseService.getInstance();
