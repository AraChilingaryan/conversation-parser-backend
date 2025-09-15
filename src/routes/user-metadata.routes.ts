import {Router} from 'express';
import {
    createOrUpdateUser,
    getUserByPhone,
    updateUserTwilio,
} from '../controllers/user-metadata.controller';

const router = Router();

// User metadata management (called by iOS app)
router.post('/users', createOrUpdateUser);
router.patch('/users/twilio', updateUserTwilio);
router.get('/users/phone/:phoneNumber', getUserByPhone);

export {router as userMetadataRoutes};
