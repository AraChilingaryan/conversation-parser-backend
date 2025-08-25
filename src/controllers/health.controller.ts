import { Request, Response } from 'express';
import { logger } from '../utils/logger.util';

export const healthCheck = (req: Request, res: Response): void => {
    const healthInfo = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env['NODE_ENV'] || 'development',
        version: '1.0.0',
        services: {
            database: 'not_configured', // Will be updated when we add Firebase
            storage: 'not_configured',   // Will be updated when we add Google Cloud Storage
            speechAPI: 'not_configured'  // Will be updated when we add Speech-to-Text
        }
    };

    logger.debug('Health check requested', { healthInfo });
    res.status(200).json(healthInfo);
};

export const readinessCheck = (req: Request, res: Response): void => {
    // This will be expanded to check if all services are ready
    const readiness = {
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
            database: false,  // Will be implemented
            storage: false,   // Will be implemented
            speechAPI: false  // Will be implemented
        }
    };

    const allReady = Object.values(readiness.checks).every(check => check === true);

    res.status(allReady ? 200 : 503).json(readiness);
};
