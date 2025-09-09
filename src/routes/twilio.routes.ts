import {Router} from 'express';
import {
    handleRecordingWebhook,
    testTwilioIntegration,
    getTwilioConversations
} from '../controllers/twilio.controller';
import { authorizeCall } from "../controllers/twilio.controller";

const router = Router();

/**
 * @route POST /api/v1/webhooks/twilio/recording
 * @desc Handle Twilio recording webhook
 * @access Public (Twilio webhook)
 */
router.post('/recording', handleRecordingWebhook);

/**
 * @route GET /api/v1/webhooks/twilio/test
 * @desc Test Twilio integration
 * @access Admin
 */
router.get('/test', testTwilioIntegration);

/**
 * @route GET /api/v1/webhooks/twilio/conversations
 * @desc Get conversations from Twilio
 * @access Admin
 */
router.get('/conversations', getTwilioConversations);

// Twilio webhooks
router.post('/webhooks/call-auth', authorizeCall);
router.post('/webhooks/recording', handleRecordingWebhook);

export {router as twilioRoutes};

