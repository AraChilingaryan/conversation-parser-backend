// src/services/user-metadata.service.ts

import { databaseService } from './database.service';
import { logger } from '../utils/logger.util';
import type { User, Recording, CreateUserRequest, UpdateUserSubscriptionRequest, UpdateUserTwilioRequest } from '../interfaces/user.interface';

export class UserMetadataService {
    private static instance: UserMetadataService;

    private constructor() {}

    static getInstance(): UserMetadataService {
        if (!UserMetadataService.instance) {
            UserMetadataService.instance = new UserMetadataService();
        }
        return UserMetadataService.instance;
    }

    /**
     * Create or update user from iOS app data
     */
    async createOrUpdateUser(userData: CreateUserRequest): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            // Check if user already exists
            const existingUser = await this.findUserById(userData.uid);

            const user: User = {
                uid: userData.uid,
                phoneNumber: userData.phoneNumber,
                isVerified: true, // Since iOS app sends this, user is already verified
                profile: userData.profile || {},
                subscription: {
                    ...userData.subscription,
                    trialMinutesUsed: existingUser?.subscription.trialMinutesUsed || 0,
                    trialMinutesLimit: 60, // Default trial limit
                    lastSyncedFromApp: new Date().toISOString()
                },
                twilio: {
                    ...userData.twilio,
                    assignedAt: existingUser?.twilio.assignedAt || new Date().toISOString(),
                    lastSyncedFromApp: new Date().toISOString()
                },
                createdAt: existingUser?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString()
            };

            // Save or update user
            if (existingUser) {
                await this.updateUser(user);
                logger.info(`User updated from iOS app: ${userData.uid}`);
            } else {
                await this.saveUser(user);
                logger.info(`User created from iOS app: ${userData.uid}`);
            }

            return { success: true, user };

        } catch (error) {
            logger.error('Error creating/updating user:', error);
            return { success: false, error: 'Failed to save user data' };
        }
    }

    /**
     * Update user subscription from iOS app
     */
    async updateUserSubscription(subscriptionData: UpdateUserSubscriptionRequest): Promise<{ success: boolean; error?: string }> {
        try {
            const user = await this.findUserById(subscriptionData.uid);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            user.subscription = {
                ...subscriptionData.subscription,
                trialMinutesUsed: user.subscription.trialMinutesUsed, // Preserve existing usage
                trialMinutesLimit: user.subscription.trialMinutesLimit, // Preserve existing limit
                lastSyncedFromApp: new Date().toISOString()
            };
            user.updatedAt = new Date().toISOString();

            await this.updateUser(user);
            logger.info(`User subscription updated from iOS app: ${subscriptionData.uid}`);

            return { success: true };

        } catch (error) {
            logger.error('Error updating user subscription:', error);
            return { success: false, error: 'Failed to update subscription' };
        }
    }

    /**
     * Update user Twilio number from iOS app
     */
    async updateUserTwilio(twilioData: UpdateUserTwilioRequest): Promise<{ success: boolean; error?: string }> {
        try {
            const user = await this.findUserById(twilioData.uid);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            user.twilio = {
                ...twilioData.twilio,
                assignedAt: user.twilio.assignedAt || new Date().toISOString(),
                lastSyncedFromApp: new Date().toISOString()
            };
            user.updatedAt = new Date().toISOString();

            await this.updateUser(user);
            logger.info(`User Twilio data updated from iOS app: ${twilioData.uid}`);

            return { success: true };

        } catch (error) {
            logger.error('Error updating user Twilio data:', error);
            return { success: false, error: 'Failed to update Twilio data' };
        }
    }

    /**
     * Check if user is authorized to make calls
     */
    async authorizeCall(toNumber: string, callSid: string): Promise<{ authorized: boolean; reason?: string; userId?: string }> {
        try {
            // Find user by their assigned Twilio number
            const user = await this.findUserByTwilioNumber(toNumber);
            if (!user) {
                return { authorized: false, reason: 'Number not assigned to any user' };
            }

            // Check subscription status
            if (user.subscription.status === 'expired' || user.subscription.status === 'canceled') {
                return { authorized: false, reason: 'Subscription expired or canceled', userId: user.uid };
            }

            // Check trial limits for trial users
            if (user.subscription.status === 'trial') {
                if (user.subscription.trialMinutesUsed >= user.subscription.trialMinutesLimit) {
                    return { authorized: false, reason: 'Trial minutes exceeded', userId: user.uid };
                }
            }

            // For active subscriptions, assume iOS app manages limits
            if (user.subscription.status === 'active') {
                // Check if subscription period is valid
                const now = new Date();
                const endDate = new Date(user.subscription.endDate);

                if (now > endDate) {
                    return { authorized: false, reason: 'Subscription period ended', userId: user.uid };
                }
            }

            return { authorized: true, userId: user.uid };

        } catch (error) {
            logger.error('Error authorizing call:', error);
            return { authorized: false, reason: 'Authorization check failed' };
        }
    }

    /**
     * Process recording webhook and link to user
     */
    async processRecordingWebhook(twilioData: any): Promise<{ success: boolean; conversationId?: string; error?: string }> {
        try {
            // Find user by toNumber (their assigned Twilio number)
            const user = await this.findUserByTwilioNumber(twilioData.To || twilioData.toNumber);
            if (!user) {
                logger.warn(`Recording received for unassigned number: ${twilioData.To || twilioData.toNumber}`);
                return { success: false, error: 'Number not assigned to any user' };
            }

            // Create recording record linked to user
            const recordingId = twilioData.RecordingSid || `REC_${Date.now()}`;
            const recording: Recording = {
                id: recordingId,
                userId: user.uid,
                callSid: twilioData.CallSid,
                recordingSid: twilioData.RecordingSid,
                recordingUrl: twilioData.RecordingUrl,
                recordingDuration: parseInt(twilioData.RecordingDuration) || 0,
                fromNumber: twilioData.From || twilioData.fromNumber,
                toNumber: twilioData.To || twilioData.toNumber,
                callDirection: 'inbound', // Most calls to assigned numbers are inbound
                callStartTime: new Date().toISOString(), // Will be updated with actual data
                callEndTime: new Date().toISOString(),
                callStatus: twilioData.CallStatus || 'completed',
                callDuration: parseInt(twilioData.CallDuration) || parseInt(twilioData.RecordingDuration) || 0,
                processed: false,
                transcriptionStatus: 'pending',
                callPrice: 0, // Will be updated with actual billing data
                callPriceUnit: 'USD',
                metadata: {
                    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
                    callDirection: 'inbound',
                    parentCallSid: twilioData.ParentCallSid
                },
                deleted: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Save recording
            await this.saveRecording(recording);

            // Update user usage (convert seconds to minutes, round up)
            const minutesUsed = Math.ceil(recording.recordingDuration / 60);
            await this.updateUserUsage(user.uid, minutesUsed);

            // Trigger conversation processing
            const conversationId = await this.createConversationFromRecording(recording);

            logger.info(`Recording processed for user ${user.uid}: ${recordingId}`);
            return { success: true, conversationId };

        } catch (error) {
            logger.error('Error processing recording webhook:', error);
            return { success: false, error: 'Processing failed' };
        }
    }

    /**
     * Get user by phone number for iOS verification
     */
    async getUserByPhone(phoneNumber: string): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            const user = await this.findUserByPhone(phoneNumber);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return { success: true, user };

        } catch (error) {
            logger.error('Error getting user by phone:', error);
            return { success: false, error: 'Query failed' };
        }
    }

    // Private helper methods
    private async findUserById(uid: string): Promise<User | null> {
        return await databaseService.users.findById(uid);
    }

    private async findUserByPhone(phoneNumber: string): Promise<User | null> {
        return await databaseService.users.findByPhoneNumber(phoneNumber);
    }

    private async findUserByTwilioNumber(twilioNumber: string): Promise<User | null> {
        return await databaseService.users.findByTwilioNumber(twilioNumber);
    }

    private async saveUser(user: User): Promise<void> {
        await databaseService.users.create(user);
    }

    private async updateUser(user: User): Promise<void> {
        await databaseService.users.update(user.uid, user);
    }

    private async saveRecording(recording: Recording): Promise<void> {
        await databaseService.recordings.create(recording);
    }

    private async updateUserUsage(userId: string, minutesUsed: number): Promise<void> {
        const user = await this.findUserById(userId);
        if (user && user.subscription.status === 'trial') {
            user.subscription.trialMinutesUsed += minutesUsed;
            user.updatedAt = new Date().toISOString();
            await this.updateUser(user);
        }
    }

    private async createConversationFromRecording(recording: Recording): Promise<string> {
        // This triggers your existing conversation parser
        const conversationId = `conv_${recording.callSid}`;

        // TODO: Implement conversation creation logic, use already existing logic from the /services/processing.service class
        // 1. Download audio from recording.recordingUrl
        // 2. Create conversation record in your existing system
        // 3. Trigger speech-to-text processing

        return conversationId;
    }
}

export const userMetadataService = UserMetadataService.getInstance();
