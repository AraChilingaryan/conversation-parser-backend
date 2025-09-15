// src/routes/revenuecat.routes.ts
import {Router} from 'express';
import {handleRevenueCatWebhook} from '../controllers/revenuecat.controller';

const router = Router();

// RevenueCat webhook endpoint
router.post('/', handleRevenueCatWebhook);

export {router as revenuecatRoutes};
