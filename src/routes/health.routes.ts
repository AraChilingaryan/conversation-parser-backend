import { Router } from 'express';
import { healthCheck, readinessCheck } from '../controllers/health.controller';

const router = Router();

/**
 * @route GET /health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/', healthCheck);

/**
 * @route GET /health/ready
 * @desc Readiness check endpoint
 * @access Public
 */
router.get('/ready', readinessCheck);

export { router as healthRoutes };

// src/routes/index.ts
export * from './health.routes';
