import { Router } from 'express';
import {
    createOrUpdateUser,
    updateUserSubscription,
    updateUserTwilio,
    getUserByPhone,
    authorizeCall
} from '../controllers/user-metadata.controller';
import {
    handleRecordingWebhook
} from '../controllers/twilio.controller';

const router = Router();

// User metadata management (called by iOS app)
router.post('/users', createOrUpdateUser);
router.patch('/users/subscription', updateUserSubscription);
router.patch('/users/twilio', updateUserTwilio);
router.get('/users/phone/:phoneNumber', getUserByPhone);

// Twilio webhooks
router.post('/webhooks/call-auth', authorizeCall);
router.post('/webhooks/recording', handleRecordingWebhook);

export { router as userMetadataRoutes };
