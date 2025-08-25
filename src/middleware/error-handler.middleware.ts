import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.util';

export interface CustomError extends Error {
    statusCode?: number;
    code?: string;
    details?: any;
}

export const errorHandler = (
    err: CustomError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    const statusCode = err.statusCode || 500;
    const message = process.env['NODE_ENV'] === 'production'
        ? 'Internal Server Error'
        : err.message;

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code: err.code || 'INTERNAL_SERVER_ERROR',
            ...(process.env['NODE_ENV'] !== 'production' && {
                stack: err.stack,
                details: err.details
            })
        },
        timestamp: new Date().toISOString(),
        path: req.path
    });
};

export const notFoundHandler = (req: Request, res: Response): void => {
    logger.warn('404 Not Found:', {
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        error: {
            message: 'Endpoint not found',
            code: 'NOT_FOUND',
            availableEndpoints: {
                health: '/health',
                api: '/api/v1'
            }
        },
        timestamp: new Date().toISOString(),
        path: req.path
    });
};
