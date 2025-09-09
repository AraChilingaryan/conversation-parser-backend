// src/controllers/user-metadata.controller.ts

import {Request, Response} from 'express';
import {userMetadataService} from '../services/user-metadata.service';
import {logger} from '../utils/logger.util';
import {v4 as uuidv4} from 'uuid';
import type {APIResponse} from '../interfaces/api.interface';

/**
 * Create or update user from iOS app
 */
export const createOrUpdateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const userData = req.body;

        // Basic validation
        if (!userData.uid || !userData.phoneNumber) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_REQUIRED_FIELDS',
                    message: 'uid and phoneNumber are required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        const result = await userMetadataService.createOrUpdateUser(userData);

        if (result.success) {
            res.json({
                success: true,
                data: {
                    user: {
                        uid: result.user!.uid,
                        phoneNumber: result.user!.phoneNumber,
                        subscription: result.user!.subscription,
                        twilio: result.user!.twilio
                    },
                    message: 'User data saved successfully'
                },
                metadata: {
                    requestId: uuidv4(),
                    timestamp: new Date().toISOString(),
                    processingTime: 0,
                    version: '1.0.0'
                }
            } as APIResponse);
        } else {
            res.status(400).json({
                success: false,
                error: {
                    code: 'USER_SAVE_FAILED',
                    message: result.error || 'Failed to save user data',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
        }

    } catch (error) {
        logger.error('Error in createOrUpdateUser:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to process user data',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Update user subscription from iOS app
 */
export const updateUserSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
        const subscriptionData = req.body;

        if (!subscriptionData.uid || !subscriptionData.subscription) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_SUBSCRIPTION_DATA',
                    message: 'uid and subscription data are required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        const result = await userMetadataService.updateUserSubscription(subscriptionData);

        if (result.success) {
            res.json({
                success: true,
                data: {
                    message: 'Subscription updated successfully',
                    uid: subscriptionData.uid
                },
                metadata: {
                    requestId: uuidv4(),
                    timestamp: new Date().toISOString(),
                    processingTime: 0,
                    version: '1.0.0'
                }
            } as APIResponse);
        } else {
            res.status(400).json({
                success: false,
                error: {
                    code: 'SUBSCRIPTION_UPDATE_FAILED',
                    message: result.error || 'Failed to update subscription',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
        }

    } catch (error) {
        logger.error('Error in updateUserSubscription:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update subscription',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Update user Twilio number from iOS app
 */
export const updateUserTwilio = async (req: Request, res: Response): Promise<void> => {
    try {
        const twilioData = req.body;

        if (!twilioData.uid || !twilioData.twilio) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_TWILIO_DATA',
                    message: 'uid and twilio data are required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        const result = await userMetadataService.updateUserTwilio(twilioData);

        if (result.success) {
            res.json({
                success: true,
                data: {
                    message: 'Twilio data updated successfully',
                    uid: twilioData.uid
                },
                metadata: {
                    requestId: uuidv4(),
                    timestamp: new Date().toISOString(),
                    processingTime: 0,
                    version: '1.0.0'
                }
            } as APIResponse);
        } else {
            res.status(400).json({
                success: false,
                error: {
                    code: 'TWILIO_UPDATE_FAILED',
                    message: result.error || 'Failed to update Twilio data',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
        }

    } catch (error) {
        logger.error('Error in updateUserTwilio:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update Twilio data',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Get user by phone number (for iOS verification)
 */
export const getUserByPhone = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phoneNumber } = req.params;

        if (!phoneNumber) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_PHONE_NUMBER',
                    message: 'Phone number is required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        const result = await userMetadataService.getUserByPhone(phoneNumber);

        if (result.success && result.user) {
            res.json({
                success: true,
                data: {
                    user: {
                        uid: result.user.uid,
                        phoneNumber: result.user.phoneNumber,
                        subscription: result.user.subscription,
                        twilio: result.user.twilio,
                        profile: result.user.profile
                    }
                },
                metadata: {
                    requestId: uuidv4(),
                    timestamp: new Date().toISOString(),
                    processingTime: 0,
                    version: '1.0.0'
                }
            } as APIResponse);
        } else {
            res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
        }

    } catch (error) {
        logger.error('Error in getUserByPhone:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to retrieve user',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};
