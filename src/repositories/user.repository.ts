// src/repositories/user.repository.ts
import {BaseFirestoreRepository} from "./base.repository";
import {User} from "../interfaces/user.interface";
import {logger} from "../utils/logger.util";

export class UserRepository extends BaseFirestoreRepository<User> {
    constructor() {
        super('users');
    }

    /**
     * Find user by phone number
     */
    async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
        try {
            const snapshot = await this.firestore.collection(this.collectionName)
                .where('phoneNumber', '==', phoneNumber)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return this.transformFromStorage(doc.data());
        } catch (error) {
            logger.error('Error finding user by phone number:', error);
            throw new Error(`Failed to find user by phone number: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find user by Twilio assigned number
     */
    async findByTwilioNumber(twilioNumber: string): Promise<User | null> {
        try {
            const snapshot = await this.firestore.collection(this.collectionName)
                .where('twilio.assignedNumber', '==', twilioNumber)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return this.transformFromStorage(doc.data());
        } catch (error) {
            logger.error('Error finding user by Twilio number:', error);
            throw new Error(`Failed to find user by Twilio number: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find user by uid
     */
    async findByUid(uid: string): Promise<User | null> {
        try {
            const snapshot = await this.firestore.collection(this.collectionName)
                .where('uid', '==', uid)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return this.transformFromStorage(doc.data());
        } catch (error) {
            logger.error('Error finding user by UID:', error);
            throw new Error(`Failed to find user by UID: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<User | null> {
        try {
            const snapshot = await this.firestore.collection(this.collectionName)
                .where('profile.email', '==', email)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return this.transformFromStorage(doc.data());
        } catch (error) {
            logger.error('Error finding user by email:', error);
            throw new Error(`Failed to find user by email: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find user by Stripe customer ID
     */
    async findByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
        try {
            const snapshot = await this.firestore.collection(this.collectionName)
                .where('subscription.stripeCustomerId', '==', stripeCustomerId)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return this.transformFromStorage(doc.data());
        } catch (error) {
            logger.error('Error finding user by Stripe customer ID:', error);
            throw new Error(`Failed to find user by Stripe customer ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create user with validation
     */
    async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        try {
            // Check if user with phone number already exists
            const existingUserByPhone = await this.findByPhoneNumber(userData.phoneNumber);
            if (existingUserByPhone) {
                throw new Error('User with this phone number already exists');
            }

            // Check if user with UID already exists
            const existingUserByUid = await this.findByUid(userData.uid);
            if (existingUserByUid) {
                throw new Error('User with this UID already exists');
            }

            // Check if user with email already exists (if email provided)
            if (userData.profile?.email) {
                const existingUserByEmail = await this.findByEmail(userData.profile.email);
                if (existingUserByEmail) {
                    throw new Error('User with this email already exists');
                }
            }

            // Create the user using the base repository method
            const userId = await this.create(userData as User);
            logger.info(`User created successfully with ID: ${userId}`);

            return userId;
        } catch (error) {
            logger.error('Error creating user:', error);
            throw error;
        }
    }

    /**
     * Update user profile
     */
    async updateProfile(userId: string, updates: Partial<User>): Promise<void> {
        try {
            // Remove fields that shouldn't be updated
            const {id, createdAt, updatedAt, ...updateData} = updates as any;

            // If updating phone number, check for conflicts
            if (updateData.phoneNumber) {
                const existingUser = await this.findByPhoneNumber(updateData.phoneNumber);
                if (existingUser && existingUser.uid !== updateData.uid) {
                    throw new Error('Phone number is already in use by another user');
                }
            }

            // If updating email, check for conflicts
            if (updateData.profile?.email) {
                const existingUser = await this.findByEmail(updateData.profile.email);
                if (existingUser && existingUser.uid !== updateData.uid) {
                    throw new Error('Email is already in use by another user');
                }
            }

            await this.update(userId, updateData);
            logger.info(`User profile updated successfully for ID: ${userId}`);
        } catch (error) {
            logger.error('Error updating user profile:', error);
            throw error;
        }
    }

    /**
     * Update user's last login timestamp
     */
    async updateLastLogin(userId: string): Promise<void> {
        try {
            await this.update(userId, {
                lastLoginAt: new Date().toISOString()
            } as Partial<User>);
        } catch (error) {
            logger.error('Error updating last login:', error);
            throw error;
        }
    }

    /**
     * Update user verification status
     */
    async updateVerificationStatus(userId: string, isVerified: boolean): Promise<void> {
        try {
            await this.update(userId, {
                isVerified
            } as Partial<User>);
            logger.info(`User verification status updated for ID: ${userId}`);
        } catch (error) {
            logger.error('Error updating verification status:', error);
            throw error;
        }
    }

    /**
     * Update user subscription
     */
    async updateSubscription(userId: string, subscriptionUpdates: Partial<User['subscription']>): Promise<void> {
        try {
            const user = await this.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const updatedSubscription = {
                ...user.subscription,
                ...subscriptionUpdates,
                lastSyncedFromApp: new Date().toISOString()
            };

            await this.update(userId, {
                subscription: updatedSubscription
            } as Partial<User>);

            logger.info(`User subscription updated for ID: ${userId}`);
        } catch (error) {
            logger.error('Error updating subscription:', error);
            throw error;
        }
    }

    /**
     * Update Twilio assignment
     */
    async updateTwilioAssignment(userId: string, twilioUpdates: Partial<User['twilio']>): Promise<void> {
        try {
            const user = await this.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const updatedTwilio = {
                ...user.twilio,
                ...twilioUpdates,
                lastSyncedFromApp: new Date().toISOString()
            };

            if (twilioUpdates.assignedNumber && !user.twilio.assignedAt) {
                updatedTwilio.assignedAt = new Date().toISOString();
            }

            await this.update(userId, {
                twilio: updatedTwilio
            } as Partial<User>);

            logger.info(`User Twilio assignment updated for ID: ${userId}`);
        } catch (error) {
            logger.error('Error updating Twilio assignment:', error);
            throw error;
        }
    }

    /**
     * Find users by subscription status
     */
    async findBySubscriptionStatus(status: User['subscription']['status']): Promise<User[]> {
        try {
            const result = await this.findMany({ 'subscription.status': status });
            return result.data;
        } catch (error) {
            logger.error('Error finding users by subscription status:', error);
            throw error;
        }
    }

    /**
     * Find users by subscription plan
     */
    async findBySubscriptionPlan(plan: User['subscription']['plan']): Promise<User[]> {
        try {
            const result = await this.findMany({ 'subscription.plan': plan });
            return result.data;
        } catch (error) {
            logger.error('Error finding users by subscription plan:', error);
            throw error;
        }
    }

    /**
     * Find verified users
     */
    async findVerifiedUsers(): Promise<User[]> {
        try {
            const result = await this.findMany({ isVerified: true });
            return result.data;
        } catch (error) {
            logger.error('Error finding verified users:', error);
            throw error;
        }
    }

    /**
     * Find users with trial subscriptions
     */
    async findTrialUsers(): Promise<User[]> {
        try {
            const result = await this.findMany({ 'subscription.status': 'trial' });
            return result.data;
        } catch (error) {
            logger.error('Error finding trial users:', error);
            throw error;
        }
    }

    /**
     * Search users by name, email, or phone
     */
    async searchUsers(searchTerm: string, options: {limit?: number; offset?: number} = {}): Promise<User[]> {
        try {
            const result = await this.search(
                searchTerm,
                ['profile.firstName', 'profile.lastName', 'profile.email', 'phoneNumber'],
                options
            );
            return result.data;
        } catch (error) {
            logger.error('Error searching users:', error);
            throw error;
        }
    }

    /**
     * Get remaining trial minutes for a user
     */
    async getRemainingTrialMinutes(userId: string): Promise<number> {
        try {
            const user = await this.findById(userId);
            if (!user || user.subscription.status !== 'trial') {
                return 0;
            }
            return Math.max(0, user.subscription.trialMinutesLimit - user.subscription.trialMinutesUsed);
        } catch (error) {
            logger.error('Error getting remaining trial minutes:', error);
            return 0;
        }
    }

    /**
     * Check if user subscription is active
     */
    async isSubscriptionActive(userId: string): Promise<boolean> {
        try {
            const user = await this.findById(userId);
            if (!user) {
                return false;
            }

            const now = new Date();
            const endDate = new Date(user.subscription.expiresAt);

            return user.subscription.status === 'active' && now <= endDate;
        } catch (error) {
            logger.error('Error checking subscription status:', error);
            return false;
        }
    }
}

export const userRepository = new UserRepository();
