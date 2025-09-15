// src/services/user-metadata.service.ts

import {databaseService} from './database.service';
import {logger} from '../utils/logger.util';
import {
    CallAuthorizationRequest,
    CallAuthorizationResponse,
    CreateUserRequest,
    Recording,
    SubscriptionHelper,
    UpdateUserTwilioRequest,
    User
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
     * Create or update user from iOS app data (corrected for RevenueCat)
     */
    async createUserBasic(userData: CreateUserRequest): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            logger.info('Creating user without subscription:', {
                uid: userData.uid,
                phoneNumber: userData.phoneNumber
            });

            // Check if user already exists
            const existingUser = await databaseService.users.findByUid(userData.uid);
            if (existingUser) {
                return { success: false, error: 'User already exists' };
            }

            // Create user with default subscription
            const newUserData: Omit<User, 'id' | 'createdAt' | 'updatedAt'> = {
                uid: userData.uid,
                phoneNumber: userData.phoneNumber,
                isVerified: true, // Assuming verified since coming from iOS app
                profile: userData.profile || {},

                // Create default subscription using helper
                subscription: SubscriptionHelper.createDefaultSubscription(),

                twilio: userData.twilio ? {
                    assignedNumber: userData.twilio.assignedNumber,
                    numberSid: userData.twilio.numberSid,
                    assignedAt: new Date().toISOString(),
                    lastSyncedFromApp: new Date().toISOString()
                } : {},

                usage: {
                    totalRecordings: 0,
                    totalMinutesRecorded: 0,
                    monthlyMinutesUsed: 0,
                    lastMonthlyReset: new Date().toISOString()
                },

                lastLoginAt: new Date().toISOString()
            };

            const userId = await databaseService.users.createUser(newUserData);
            const createdUser = await databaseService.users.findByUid(userData.uid);

            logger.info(`User created without subscription: ${userData.uid}`);
            return { success: true, user: createdUser! };

        } catch (error) {
            logger.error('Error creating user:', error);
            return { success: false, error: `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Check if user is authorized to make calls (corrected for RevenueCat)
     */
    async authorizeCall(authRequest: CallAuthorizationRequest): Promise<CallAuthorizationResponse> {
        try {
            logger.info('Authorizing call:', {
                fromNumber: authRequest.fromNumber,
                toNumber: authRequest.toNumber,
                callSid: authRequest.callSid
            });

            // Find user by their assigned Twilio number
            const user = await databaseService.users.findByTwilioNumber(authRequest.toNumber);
            if (!user) {
                logger.warn('Call attempt to unassigned number:', { toNumber: authRequest.toNumber });
                return {
                    authorized: false,
                    reason: 'Number not assigned to any user'
                };
            }

            logger.info('Found user for call authorization:', {
                userId: user.uid,
                entitlementId: user.subscription.entitlementId,
                isActive: user.subscription.isActive,
                status: user.subscription.status
            });

            // Check if user account is verified
            if (!user.isVerified) {
                logger.warn('Call attempt from unverified user:', { userId: user.uid });
                return {
                    authorized: false,
                    reason: 'User account not verified',
                    userId: user.uid
                };
            }

            // Use updated helper for authorization check
            const authCheck = SubscriptionHelper.canMakeCalls(
                user.subscription,
                user.subscription.trialMinutesUsed
            );

            if (!authCheck.canCall) {
                logger.warn('Call authorization denied:', {
                    userId: user.uid,
                    reason: authCheck.reason,
                    entitlementId: user.subscription.entitlementId,
                    isActive: user.subscription.isActive,
                    expiresAt: user.subscription.expiresAt
                });

                return {
                    authorized: false,
                    reason: authCheck.reason,
                    userId: user.uid,
                    remainingMinutes: authCheck.remainingMinutes
                };
            }

            logger.info('Call authorized:', {
                userId: user.uid,
                remainingMinutes: authCheck.remainingMinutes,
                entitlementId: user.subscription.entitlementId,
                plan: user.subscription.plan
            });

            return {
                authorized: true,
                userId: user.uid,
                remainingMinutes: authCheck.remainingMinutes
            };

        } catch (error) {
            logger.error('Error authorizing call:', error, {
                fromNumber: authRequest.fromNumber,
                toNumber: authRequest.toNumber,
                callSid: authRequest.callSid
            });
            return {
                authorized: false,
                reason: 'Authorization check failed'
            };
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
