// src/config/database.config.ts

import admin from 'firebase-admin';
import { logger } from '../utils/logger.util';
import {getFirestore} from "firebase-admin/firestore";

/**
 * Firebase/Firestore database configuration and initialization
 */

interface FirebaseConfig {
    projectId: string;
    serviceAccountPath: string;
    storageBucket: string;
    databaseId?: string;
}

class DatabaseConfig {
    private static instance: DatabaseConfig;
    private _firestore: admin.firestore.Firestore | null = null;
    private _storage: admin.storage.Storage | null = null;
    private _initialized = false;

    private constructor() {}

    static getInstance(): DatabaseConfig {
        if (!DatabaseConfig.instance) {
            DatabaseConfig.instance = new DatabaseConfig();
        }
        return DatabaseConfig.instance;
    }

    /**
     * Initialize Firebase Admin SDK
     */
        // 3. Update your initialize method to use the databaseId
    initialize = async (): Promise<void> => {
        if (this._initialized) {
            logger.debug('Firebase already initialized');
            return;
        }

        try {
            const config = this.getConfig();

            // Check if Firebase app is already initialized
            if (admin.apps.length === 0) {
                admin.initializeApp({
                    credential: admin.credential.cert(require(config.serviceAccountPath)),
                    projectId: config.projectId,
                    storageBucket: config.storageBucket,
                });

                logger.info('Firebase Admin SDK initialized successfully');
            }

            // Use getFirestore with database ID - this is the correct way
            if (config.databaseId) {
                logger.info(`Using Firestore database ID: ${config.databaseId}`);
                this._firestore = getFirestore(admin.app(), config.databaseId);
                logger.info(`Connected to custom Firestore database: ${config.databaseId}`);
            } else {
                this._firestore = getFirestore(admin.app());
                logger.info('Connected to default Firestore database');
            }

            this._firestore.settings({
                ignoreUndefinedProperties: true,
            });

            // Initialize Storage
            this._storage = admin.storage();

            // Test the connection
            await this.testConnection();

            this._initialized = true;
            logger.info('Database layer initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Firebase:', error);
            throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    /**
     * Get Firestore instance
     */
    get firestore(): admin.firestore.Firestore {
        if (!this._firestore) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this._firestore;
    }

    /**
     * Get Storage instance
     */
    get storage(): admin.storage.Storage {
        if (!this._storage) {
            throw new Error('Storage not initialized. Call initialize() first.');
        }
        return this._storage;
    }

    /**
     * Test database connection
     */
    private async testConnection(): Promise<void> {
        try {
            if (!this._firestore) {
                throw new Error('Firestore not initialized');
            }

            // Try to read from a test collection
            const testDoc = this._firestore.collection('_health_check').doc('test');
            await testDoc.get();

            logger.debug('Database connection test successful');
        } catch (error) {
            logger.error('Database connection test failed:', error);
            throw error;
        }
    }

    /**
     * Get configuration from environment variables
     */
// 2. Update your getConfig method
    private getConfig(): FirebaseConfig {
        const projectId = process.env['GOOGLE_CLOUD_PROJECT_ID'];
        const serviceAccountPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
        const storageBucket = process.env['FIREBASE_STORAGE_BUCKET'];
        const databaseId = process.env['FIRESTORE_DATABASE_ID']; // Add this line

        if (!projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is required');
        }

        if (!serviceAccountPath) {
            throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is required');
        }

        if (!storageBucket) {
            throw new Error('FIREBASE_STORAGE_BUCKET environment variable is required');
        }

        // Make databaseId required since you don't have a default database
        if (!databaseId) {
            throw new Error('FIRESTORE_DATABASE_ID environment variable is required');
        }

        return {
            projectId,
            serviceAccountPath,
            storageBucket,
            databaseId, // Add this line
        };
    }

    /**
     * Get health status of database
     */
    async getHealthStatus(): Promise<{
        status: 'up' | 'down' | 'degraded';
        responseTime: number;
        error?: string;
    }> {
        const startTime = Date.now();

        try {
            await this.testConnection();
            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 1000 ? 'up' : 'degraded',
                responseTime,
            };
        } catch (error) {
            return {
                status: 'down',
                responseTime: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Close database connections (for graceful shutdown)
     */
    async close(): Promise<void> {
        try {
            // Firebase Admin SDK doesn't need explicit closing
            this._initialized = false;
            this._firestore = null;
            this._storage = null;
            logger.info('Database connections closed');
        } catch (error) {
            logger.error('Error closing database connections:', error);
        }
    }
}

// Export singleton instance
export const databaseConfig = DatabaseConfig.getInstance();
