// src/interfaces/user.interface.ts

export interface User {
    uid: string;
    phoneNumber: string;
    isVerified: boolean;

    // Profile (received from iOS)
    profile: {
        firstName?: string;
        lastName?: string;
        email?: string;
        timezone?: string;
    };

    // Subscription metadata (received from iOS app)
    // RevenueCat subscription metadata (received from iOS app)
    subscription: {
        // RevenueCat entitlement data
        entitlementId: string; // "premium", "basic", "trial"
        isActive: boolean;
        expiresAt: string; // ISO timestamp
        willRenew: boolean;
        lastEventType: string; // "LOG_IN", "PURCHASE", "RENEWAL", "CANCELLATION", etc.

        // Derived status for backend logic
        status: 'trial' | 'active' | 'canceled' | 'expired' | 'grace_period';
        plan: 'basic' | 'premium' | 'enterprise';

        // Trial usage tracking (backend managed)
        trialMinutesUsed: number;
        trialMinutesLimit: number;

        // RevenueCat metadata
        revenueCatUserId?: string;
        originalAppUserId?: string;

        // Sync tracking
        lastSyncedFromApp?: string;
        updatedAt: string; // From RevenueCat
    };
    // Twilio assignment (received from iOS app)
    twilio: {
        assignedNumber?: string;
        numberSid?: string;
        assignedAt?: string;
        lastSyncedFromApp?: string;
    };

    usage?: {
        totalRecordings: number;
        totalMinutesRecorded: number;
        monthlyMinutesUsed: number;
        lastMonthlyReset: string;
    };
    // Timestamps
    createdAt: string;
    updatedAt: string;
    lastLoginAt?: string;
}

// Helper functions for subscription logic
export class SubscriptionHelper {
    /**
     * Derive backend status from RevenueCat data
     */
    static deriveStatus(subscription: CreateUserRequest['subscription']): 'trial' | 'active' | 'canceled' | 'expired' | 'grace_period' {
        const now = new Date();
        const expiresAt = new Date(subscription.expiresAt);

        // Check if expired
        if (now > expiresAt) {
            return 'expired';
        }

        // Check if active
        if (subscription.isActive) {
            // Check if it's a trial entitlement
            if (subscription.entitlementId === 'trial' || subscription.entitlementId.includes('trial')) {
                return 'trial';
            }
            return 'active';
        }

        // Check if canceled but still in valid period
        if (!subscription.willRenew && now <= expiresAt) {
            return 'canceled'; // Canceled but still has access
        }

        // Check for grace period (expired but might renew)
        const gracePeriodEnd = new Date(expiresAt.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days grace
        if (now <= gracePeriodEnd && subscription.lastEventType === 'BILLING_ISSUE') {
            return 'grace_period';
        }

        return 'expired';
    }

    /**
     * Derive plan from entitlement ID
     */
    static derivePlan(entitlementId: string): 'basic' | 'premium' | 'enterprise' {
        const lowercaseEntitlement = entitlementId.toLowerCase();

        if (lowercaseEntitlement.includes('premium') || lowercaseEntitlement.includes('pro')) {
            return 'premium';
        }

        if (lowercaseEntitlement.includes('enterprise') || lowercaseEntitlement.includes('business')) {
            return 'enterprise';
        }

        return 'basic'; // Default to basic (includes trial)
    }

    /**
     * Get trial limits based on plan
     */
    static getTrialLimits(plan: string): { minutes: number; recordings: number } {
        switch (plan) {
            case 'premium':
                return { minutes: 60, recordings: 10 };
            case 'enterprise':
                return { minutes: 120, recordings: 20 };
            default:
                return { minutes: 30, recordings: 5 };
        }
    }

    /**
     * Check if user can make calls
     */
    static canMakeCalls(subscription: User['subscription'], trialMinutesUsed: number = 0): {
        canCall: boolean;
        reason?: string;
        remainingMinutes?: number;
    } {
        const status = subscription.status;
        const now = new Date();
        const expiresAt = new Date(subscription.expiresAt);

        // Check if subscription is expired
        if (now > expiresAt) {
            return { canCall: false, reason: 'Subscription expired' };
        }

        // Check if subscription is active
        if (!subscription.isActive) {
            return { canCall: false, reason: 'Subscription not active' };
        }

        // For trial users, check minute limits
        if (status === 'trial') {
            const remainingMinutes = subscription.trialMinutesLimit - trialMinutesUsed;
            if (remainingMinutes <= 0) {
                return { canCall: false, reason: 'Trial minutes exceeded' };
            }
            return { canCall: true, remainingMinutes };
        }

        // For paid plans, check if canceled but still valid
        if (status === 'canceled' && now <= expiresAt) {
            return { canCall: true, reason: 'Access until period end' };
        }

        // Active subscription
        if (status === 'active') {
            return { canCall: true };
        }

        return { canCall: false, reason: 'Unknown subscription status' };
    }
}


export interface Recording {
    id: string;
    userId: string; // Link to user

    // Twilio data
    callSid: string;
    recordingSid: string;
    recordingUrl: string;
    recordingDuration: number;

    // Call details
    fromNumber: string;
    toNumber: string;
    callDirection: 'inbound' | 'outbound';
    callStartTime: string;
    callEndTime: string;
    callStatus: string;
    callDuration: number;

    // Processing status
    processed: boolean;
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    conversationId?: string; // Link to your conversation parser results

    // Billing
    callPrice: number;
    callPriceUnit: string;

    // Metadata
    metadata: {
        twilioAccountSid: string;
        callDirection: string;
        parentCallSid?: string;
    };

    // Flags
    deleted: boolean;
    createdAt: string;
    updatedAt: string;
}

// API Request types for iOS app integration
export interface CreateUserRequest {
    uid: string; // Firebase Auth UID
    phoneNumber: string;
    profile?: {
        firstName?: string;
        lastName?: string;
        email?: string;
        timezone?: string;
    };
    subscription: {
        entitlementId: string;
        isActive: boolean;
        expiresAt: string;
        willRenew: boolean;
        lastEventType: string;
        revenueCatUserId?: string;
        originalAppUserId?: string;
    };
    twilio: {
        assignedNumber: string;
        numberSid: string;
    };
}

export interface UpdateUserSubscriptionRequest {
    uid: string;
    subscription: {
        entitlementId: string;
        isActive: boolean;
        expiresAt: string;
        willRenew: boolean;
        lastEventType: string;
        revenueCatUserId?: string;
        originalAppUserId?: string;
    };
}

export interface UpdateUserTwilioRequest {
    uid: string;
    twilio: {
        assignedNumber: string;
        numberSid: string;
    };
}

export interface CallAuthorizationRequest {
    fromNumber: string;
    toNumber: string;
    callSid: string;
}

export interface CallAuthorizationResponse {
    authorized: boolean;
    reason?: string;
    userId?: string;
    remainingMinutes?: number;
}
