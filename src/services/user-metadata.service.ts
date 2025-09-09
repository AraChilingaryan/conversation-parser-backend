// src/services/user-metadata.service.ts

import { databaseService } from './database.service';
import { logger } from '../utils/logger.util';
import type {
    User,
    Recording,
    CreateUserRequest,
    UpdateUserSubscriptionRequest,
    UpdateUserTwilioRequest,
    CallAuthorizationRequest,
    CallAuthorizationResponse
} from '../interfaces/user.interface';

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
            // Check if user already exists by UID
            const existingUser = await databaseService.users.findByUid(userData.uid);

            if (existingUser) {
                // Update existing user
                const updatedUser: User = {
                    ...existingUser,
                    phoneNumber: userData.phoneNumber,
                    isVerified: true, // Since iOS app sends this, user is already verified
                    profile: {
                        ...existingUser.profile,
                        ...userData.profile
                    },
                    subscription: {
                        ...existingUser.subscription,
                        ...userData.subscription,
                        trialMinutesUsed: existingUser.subscription.trialMinutesUsed, // Preserve existing usage
                        trialMinutesLimit: existingUser.subscription.trialMinutesLimit || 30, // Keep existing or default
                        lastSyncedFromApp: new Date().toISOString()
                    },
                    twilio: {
                        ...existingUser.twilio,
                        ...userData.twilio,
                        assignedAt: existingUser.twilio.assignedAt || new Date().toISOString(),
                        lastSyncedFromApp: new Date().toISOString()
                    },
                    updatedAt: new Date().toISOString(),
                    lastLoginAt: new Date().toISOString()
                };

                await databaseService.users.update(existingUser.uid!, updatedUser);
                logger.info(`User updated from iOS app: ${userData.uid}`);

                return { success: true, user: updatedUser };
            } else {
                // Create new user
                const newUserData: Omit<User, 'id' | 'createdAt' | 'updatedAt'> = {
                    uid: userData.uid,
                    phoneNumber: userData.phoneNumber,
                    isVerified: true, // Since iOS app sends this, user is already verified
                    profile: userData.profile || {},
                    subscription: {
                        status: userData.subscription.status,
                        plan: userData.subscription.plan,
                        startDate: userData.subscription.startDate,
                        endDate: userData.subscription.endDate,
                        trialMinutesUsed: 0,
                        trialMinutesLimit: 30, // Default trial limit
                        stripeCustomerId: userData.subscription.stripeCustomerId,
                        stripeSubscriptionId: userData.subscription.stripeSubscriptionId,
                        lastSyncedFromApp: new Date().toISOString()
                    },
                    twilio: {
                        assignedNumber: userData.twilio.assignedNumber,
                        numberSid: userData.twilio.numberSid,
                        assignedAt: new Date().toISOString(),
                        lastSyncedFromApp: new Date().toISOString()
                    },
                    lastLoginAt: new Date().toISOString()
                };

                const userId = await databaseService.users.createUser(newUserData);
                const createdUser = await databaseService.users.findById(userId);

                logger.info(`User created from iOS app: ${userData.uid}`);
                return { success: true, user: createdUser! };
            }

        } catch (error) {
            logger.error('Error creating/updating user:', error);
            return { success: false, error: `Failed to save user data: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Update user subscription from iOS app
     */
    async updateUserSubscription(subscriptionData: UpdateUserSubscriptionRequest): Promise<{ success: boolean; error?: string }> {
        try {
            const user = await databaseService.users.findByUid(subscriptionData.uid);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Use the specialized subscription update method
            await databaseService.users.updateSubscription(user.uid!, subscriptionData.subscription);

            logger.info(`User subscription updated from iOS app: ${subscriptionData.uid}`);
            return { success: true };

        } catch (error) {
            logger.error('Error updating user subscription:', error);
            return { success: false, error: `Failed to update subscription: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Update user Twilio number from iOS app
     */
    async updateUserTwilio(twilioData: UpdateUserTwilioRequest): Promise<{ success: boolean; error?: string }> {
        try {
            const user = await databaseService.users.findByUid(twilioData.uid);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Use the specialized Twilio update method
            await databaseService.users.updateTwilioAssignment(user.uid!, twilioData.twilio);

            logger.info(`User Twilio data updated from iOS app: ${twilioData.uid}`);
            return { success: true };

        } catch (error) {
            logger.error('Error updating user Twilio data:', error);
            return { success: false, error: `Failed to update Twilio data: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Check if user is authorized to make calls
     */
    async authorizeCall(authRequest: CallAuthorizationRequest): Promise<CallAuthorizationResponse> {
        try {
            // Find user by their assigned Twilio number
            const user = await databaseService.users.findByTwilioNumber(authRequest.toNumber);
            if (!user) {
                return {
                    authorized: false,
                    reason: 'Number not assigned to any user'
                };
            }

            // Check subscription status
            if (user.subscription.status === 'expired' || user.subscription.status === 'canceled') {
                return {
                    authorized: false,
                    reason: 'Subscription expired or canceled',
                    userId: user.uid
                };
            }

            // Check trial limits for trial users
            if (user.subscription.status === 'trial') {
                const remainingMinutes = user.subscription.trialMinutesLimit - user.subscription.trialMinutesUsed;
                if (remainingMinutes <= 0) {
                    return {
                        authorized: false,
                        reason: 'Trial minutes exceeded',
                        userId: user.uid,
                        remainingMinutes: 0
                    };
                }

                return {
                    authorized: true,
                    userId: user.uid,
                    remainingMinutes
                };
            }

            // For active subscriptions, check if subscription period is valid
            if (user.subscription.status === 'active') {
                const now = new Date();
                const endDate = new Date(user.subscription.endDate);

                if (now > endDate) {
                    return {
                        authorized: false,
                        reason: 'Subscription period ended',
                        userId: user.uid
                    };
                }
            }

            return {
                authorized: true,
                userId: user.uid
            };

        } catch (error) {
            logger.error('Error authorizing call:', error);
            return {
                authorized: false,
                reason: 'Authorization check failed'
            };
        }
    }

    /**
     * Process recording webhook and link to user
     */
    async processRecordingWebhook(twilioData: any): Promise<{ success: boolean; conversationId?: string; error?: string }> {
        try {
            // Find user by toNumber (their assigned Twilio number)
            const user = await databaseService.users.findByTwilioNumber(twilioData.To || twilioData.toNumber);
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

            // Save recording (using your recording repository)
            await databaseService.recordings.create(recording);

            // Update user usage (convert seconds to minutes, round up)
            const minutesUsed = Math.ceil(recording.recordingDuration / 60);
            await this.updateUserUsage(user.uid, minutesUsed);

            // Trigger conversation processing
            const conversationId = await this.createConversationFromRecording(recording);

            logger.info(`Recording processed for user ${user.uid}: ${recordingId}`);
            return { success: true, conversationId };

        } catch (error) {
            logger.error('Error processing recording webhook:', error);
            return { success: false, error: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Get user by phone number for iOS verification
     */
    async getUserByPhone(phoneNumber: string): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            const user = await databaseService.users.findByPhoneNumber(phoneNumber);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return { success: true, user };

        } catch (error) {
            logger.error('Error getting user by phone:', error);
            return { success: false, error: `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Get user by UID
     */
    async getUserByUid(uid: string): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            const user = await databaseService.users.findByUid(uid);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return { success: true, user };

        } catch (error) {
            logger.error('Error getting user by UID:', error);
            return { success: false, error: `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Get user's remaining trial minutes
     */
    async getRemainingTrialMinutes(uid: string): Promise<{ success: boolean; remainingMinutes?: number; error?: string }> {
        try {
            const user = await databaseService.users.findByUid(uid);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            if (user.subscription.status !== 'trial') {
                return { success: true, remainingMinutes: 0 };
            }

            const remainingMinutes = Math.max(0, user.subscription.trialMinutesLimit - user.subscription.trialMinutesUsed);
            return { success: true, remainingMinutes };

        } catch (error) {
            logger.error('Error getting remaining trial minutes:', error);
            return { success: false, error: `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Update user trial minutes usage
     */
    private async updateUserUsage(userId: string, minutesUsed: number): Promise<void> {
        try {
            const user = await databaseService.users.findByUid(userId);
            if (user && user.subscription.status === 'trial') {
                await databaseService.users.updateSubscription(user.uid!, {
                    trialMinutesUsed: user.subscription.trialMinutesUsed + minutesUsed
                });
                logger.info(`Updated trial usage for user ${userId}: +${minutesUsed} minutes`);
            }
        } catch (error) {
            logger.error('Error updating user usage:', error);
            throw error;
        }
    }

    /**
     * Create conversation from recording
     */
    private async createConversationFromRecording(recording: Recording): Promise<string> {
        // This triggers your existing conversation parser
        const conversationId = `conv_${recording.callSid}`;

        // TODO: Implement conversation creation logic, use already existing logic from the /services/processing.service class
        // 1. Download audio from recording.recordingUrl
        // 2. Create conversation record in your existing system
        // 3. Trigger speech-to-text processing

        logger.info(`Created conversation: ${conversationId}`);
        return conversationId;
    }
}

export const userMetadataService = UserMetadataService.getInstance();
