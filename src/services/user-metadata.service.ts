// src/services/user-metadata.service.ts

import { databaseService } from './database.service';
import { logger } from '../utils/logger.util';
import {
    User,
    Recording,
    CreateUserRequest,
    UpdateUserSubscriptionRequest,
    UpdateUserTwilioRequest,
    CallAuthorizationRequest,
    CallAuthorizationResponse, SubscriptionHelper
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
    async createOrUpdateUser(userData: CreateUserRequest): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            logger.info('Creating/updating user with RevenueCat data:', {
                uid: userData.uid,
                entitlementId: userData.subscription.entitlementId,
                isActive: userData.subscription.isActive
            });

            // Check if user already exists by UID
            const existingUser = await databaseService.users.findByUid(userData.uid);

            // Derive backend subscription data from RevenueCat
            const derivedStatus = SubscriptionHelper.deriveStatus(userData.subscription);
            const derivedPlan = SubscriptionHelper.derivePlan(userData.subscription.entitlementId);
            const trialLimits = SubscriptionHelper.getTrialLimits(derivedPlan);

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
                        // RevenueCat data (direct from iOS)
                        entitlementId: userData.subscription.entitlementId,
                        isActive: userData.subscription.isActive,
                        expiresAt: userData.subscription.expiresAt,
                        willRenew: userData.subscription.willRenew,
                        lastEventType: userData.subscription.lastEventType,
                        revenueCatUserId: userData.subscription.revenueCatUserId,
                        originalAppUserId: userData.subscription.originalAppUserId,

                        // Derived backend data
                        status: derivedStatus,
                        plan: derivedPlan,

                        // Preserve existing trial usage, update limits
                        trialMinutesUsed: existingUser.subscription?.trialMinutesUsed || 0,
                        trialMinutesLimit: trialLimits.minutes,

                        // Sync metadata
                        lastSyncedFromApp: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    },
                    twilio: {
                        ...existingUser.twilio,
                        assignedNumber: userData.twilio.assignedNumber,
                        numberSid: userData.twilio.numberSid,
                        assignedAt: existingUser.twilio?.assignedAt || new Date().toISOString(),
                        lastSyncedFromApp: new Date().toISOString()
                    },
                    // Update or preserve usage stats
                    usage: existingUser.usage || {
                        totalRecordings: 0,
                        totalMinutesRecorded: 0,
                        monthlyMinutesUsed: 0,
                        lastMonthlyReset: new Date().toISOString()
                    },
                    updatedAt: new Date().toISOString(),
                    lastLoginAt: new Date().toISOString()
                };

                // Fix: Use document ID for update, not UID
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
                        // RevenueCat data (direct from iOS)
                        entitlementId: userData.subscription.entitlementId,
                        isActive: userData.subscription.isActive,
                        expiresAt: userData.subscription.expiresAt,
                        willRenew: userData.subscription.willRenew,
                        lastEventType: userData.subscription.lastEventType,
                        revenueCatUserId: userData.subscription.revenueCatUserId,
                        originalAppUserId: userData.subscription.originalAppUserId,

                        // Derived backend data
                        status: derivedStatus,
                        plan: derivedPlan,

                        // Initial trial usage
                        trialMinutesUsed: 0,
                        trialMinutesLimit: trialLimits.minutes,

                        // Sync metadata
                        lastSyncedFromApp: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    },
                    twilio: {
                        assignedNumber: userData.twilio.assignedNumber,
                        numberSid: userData.twilio.numberSid,
                        assignedAt: new Date().toISOString(),
                        lastSyncedFromApp: new Date().toISOString()
                    },
                    usage: {
                        totalRecordings: 0,
                        totalMinutesRecorded: 0,
                        monthlyMinutesUsed: 0,
                        lastMonthlyReset: new Date().toISOString()
                    },
                    lastLoginAt: new Date().toISOString()
                };

                const userId = await databaseService.users.createUser(newUserData);
                const createdUser = await databaseService.users.findById(userId);

                logger.info(`User created from iOS app: ${userData.uid}`);
                return { success: true, user: createdUser! };
            }

        } catch (error) {
            logger.error('Error creating/updating user with RevenueCat data:', error);
            return { success: false, error: `Failed to save user data: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    /**
     * Check if user is authorized to make calls (corrected for RevenueCat)
     */
    async authorizeCall(authRequest: CallAuthorizationRequest): Promise<CallAuthorizationResponse> {
        try {
            logger.info('Authorizing call with RevenueCat subscription check:', {
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
                status: user.subscription.status,
                expiresAt: user.subscription.expiresAt
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

            // Use RevenueCat-aware subscription helper for authorization
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
                    expiresAt: user.subscription.expiresAt,
                    trialMinutesUsed: user.subscription.trialMinutesUsed,
                    trialMinutesLimit: user.subscription.trialMinutesLimit
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
     * Process recording and update user trial minutes usage
     */
    async processRecordingWebhook(twilioData: any): Promise<{ success: boolean; conversationId?: string; error?: string }> {
        try {
            // Find user by toNumber (their assigned Twilio number)
            const user = await databaseService.users.findByTwilioNumber(twilioData.To || twilioData.toNumber);
            if (!user) {
                logger.warn(`Recording received for unassigned number: ${twilioData.To || twilioData.toNumber}`);
                return { success: false, error: 'Number not assigned to any user' };
            }

            // Create recording record
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
                callDirection: 'inbound',
                callStartTime: new Date().toISOString(),
                callEndTime: new Date().toISOString(),
                callStatus: twilioData.CallStatus || 'completed',
                callDuration: parseInt(twilioData.CallDuration) || parseInt(twilioData.RecordingDuration) || 0,
                processed: false,
                transcriptionStatus: 'pending',
                callPrice: 0,
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
            await databaseService.recordings.create(recording);

            // Update user usage statistics and trial minutes (only for trial users)
            const minutesUsed = Math.ceil(recording.recordingDuration / 60);
            if (user.subscription.status === 'trial') {
                await databaseService.users.updateSubscription(user.uid!, {
                    trialMinutesUsed: user.subscription.trialMinutesUsed + minutesUsed
                });
            }

            // Update usage statistics
            if (user.usage) {
                const updatedUsage = {
                    ...user.usage,
                    totalRecordings: user.usage.totalRecordings + 1,
                    totalMinutesRecorded: user.usage.totalMinutesRecorded + minutesUsed,
                    monthlyMinutesUsed: user.usage.monthlyMinutesUsed + minutesUsed
                };

                await databaseService.users.update(user.uid!, { usage: updatedUsage } as Partial<User>);
            }

            logger.info(`Recording processed for user ${user.uid}: ${recordingId}, minutes used: ${minutesUsed}`);

            // Create conversation ID for future processing
            const conversationId = `conv_${recording.callSid}`;
            return { success: true, conversationId };

        } catch (error) {
            logger.error('Error processing recording webhook:', error);
            return { success: false, error: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    async updateUserSubscription(subscriptionData: UpdateUserSubscriptionRequest): Promise<{ success: boolean; error?: string }> {
        try {
            const user = await databaseService.users.findByUid(subscriptionData.uid);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Derive backend data from RevenueCat update
            const derivedStatus = SubscriptionHelper.deriveStatus(subscriptionData.subscription);
            const derivedPlan = SubscriptionHelper.derivePlan(subscriptionData.subscription.entitlementId);
            const trialLimits = SubscriptionHelper.getTrialLimits(derivedPlan);

            // Update subscription with new RevenueCat data
            await databaseService.users.updateSubscription(user.uid!, {
                // RevenueCat data (direct from webhook/iOS)
                entitlementId: subscriptionData.subscription.entitlementId,
                isActive: subscriptionData.subscription.isActive,
                expiresAt: subscriptionData.subscription.expiresAt,
                willRenew: subscriptionData.subscription.willRenew,
                lastEventType: subscriptionData.subscription.lastEventType,
                revenueCatUserId: subscriptionData.subscription.revenueCatUserId,
                originalAppUserId: subscriptionData.subscription.originalAppUserId,

                // Derived backend data
                status: derivedStatus,
                plan: derivedPlan,

                // Update trial limits but preserve usage
                trialMinutesLimit: trialLimits.minutes,
                // Note: trialMinutesUsed is preserved (not overwritten)

                // Sync metadata
                lastSyncedFromApp: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            logger.info(`User subscription updated from RevenueCat: ${subscriptionData.uid}`, {
                entitlementId: subscriptionData.subscription.entitlementId,
                status: derivedStatus,
                plan: derivedPlan,
                isActive: subscriptionData.subscription.isActive,
                expiresAt: subscriptionData.subscription.expiresAt
            });

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
