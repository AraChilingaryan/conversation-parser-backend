// src/interfaces/user.interface.ts

export interface User {
    uid: string;
    id: string; // Internal DB ID
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
     * Create default subscription for new users
     */
    static createDefaultSubscription(): User['subscription'] {
        return {
            entitlementId: 'none',
            isActive: false,
            expiresAt: new Date().toISOString(),
            willRenew: false,
            lastEventType: 'USER_CREATED',
            status: 'trial',
            plan: 'basic',
            trialMinutesUsed: 0,
            trialMinutesLimit: 30,
            revenueCatUserId: '',
            originalAppUserId: '',
            lastSyncedFromApp: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    /**
     * Process RevenueCat webhook data into subscription format
     */
    static processRevenueCatWebhook(webhookData: RevenueCatWebhookData): RevenueCatSubscriptionData | null {
        const event = webhookData.event;

        if (!event.subscriber) {
            return null;
        }

        // Find active entitlement
        const entitlements = event.subscriber.entitlements || {};
        const activeEntitlement = Object.values(entitlements).find((ent: any) => ent.is_active);

        if (activeEntitlement) {
            return {
                entitlementId: activeEntitlement.product_identifier,
                isActive: activeEntitlement.is_active,
                expiresAt: activeEntitlement.expires_date,
                willRenew: activeEntitlement.will_renew,
                eventType: event.type,
                revenueCatUserId: event.subscriber.subscriber_id,
                originalAppUserId: event.subscriber.original_app_user_id,
                store: activeEntitlement.store,
                periodType: activeEntitlement.period_type
            };
        } else {
            // No active entitlement (cancellation/expiration)
            return {
                entitlementId: 'none',
                isActive: false,
                expiresAt: new Date().toISOString(),
                willRenew: false,
                eventType: event.type,
                revenueCatUserId: event.subscriber.subscriber_id,
                originalAppUserId: event.subscriber.original_app_user_id,
                store: 'app_store'
            };
        }
    }

    /**
     * Derive backend status from RevenueCat data
     */
    static deriveStatusFromRevenueCat(revenueCatData: RevenueCatSubscriptionData): 'trial' | 'active' | 'canceled' | 'expired' | 'grace_period' {
        const now = new Date();
        const expiresAt = new Date(revenueCatData.expiresAt);

        // Check if expired
        if (now > expiresAt) {
            return 'expired';
        }

        // Check if active
        if (revenueCatData.isActive) {
            // Check if it's a trial entitlement
            if (revenueCatData.entitlementId === 'trial' ||
                revenueCatData.entitlementId.includes('trial') ||
                revenueCatData.periodType === 'trial') {
                return 'trial';
            }
            return 'active';
        }

        // Check if canceled but still in valid period
        if (!revenueCatData.willRenew && now <= expiresAt) {
            return 'canceled'; // Canceled but still has access
        }

        // Check for grace period (expired but might renew)
        const gracePeriodEnd = new Date(expiresAt.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days grace
        if (now <= gracePeriodEnd && revenueCatData.eventType === 'BILLING_ISSUE') {
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
     * Update subscription from RevenueCat data
     */
    static updateSubscriptionFromRevenueCat(
        currentSubscription: User['subscription'],
        revenueCatData: RevenueCatSubscriptionData
    ): User['subscription'] {
        const derivedStatus = this.deriveStatusFromRevenueCat(revenueCatData);
        const derivedPlan = this.derivePlan(revenueCatData.entitlementId);
        const trialLimits = this.getTrialLimits(derivedPlan);

        return {
            // RevenueCat data
            entitlementId: revenueCatData.entitlementId,
            isActive: revenueCatData.isActive,
            expiresAt: revenueCatData.expiresAt,
            willRenew: revenueCatData.willRenew,
            lastEventType: revenueCatData.eventType,
            revenueCatUserId: revenueCatData.revenueCatUserId,
            originalAppUserId: revenueCatData.originalAppUserId,

            // Derived backend data
            status: derivedStatus,
            plan: derivedPlan,

            // Preserve existing trial usage, update limits
            trialMinutesUsed: currentSubscription.trialMinutesUsed,
            trialMinutesLimit: trialLimits.minutes,

            // Sync metadata
            lastSyncedFromApp: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
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

    /**
     * Check if subscription needs update (comparing timestamps)
     */
    static needsUpdate(currentSubscription: User['subscription'], webhookTimestamp: number): boolean {
        const currentUpdated = new Date(currentSubscription.updatedAt).getTime();
        return webhookTimestamp > currentUpdated;
    }
}

// TODO this is filter for recordings, user can separately create tags, then each recording can be assigned multiple tags
export interface Tag {

}


// TODO add here categoiry o
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

    // todo add here the logic
    // tag: Tag;

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
    twilio?: {
        assignedNumber?: string;
        numberSid?: string;
    };
}

// 3. NEW: Processed subscription data from RevenueCat
export interface RevenueCatSubscriptionData {
    entitlementId: string;
    isActive: boolean;
    expiresAt: string;
    willRenew: boolean;
    eventType: string;
    revenueCatUserId: string;
    originalAppUserId: string;
    store: string;
    transactionId?: string;
    periodType?: string;
}

export interface RevenueCatWebhookData {
    api_version: string;
    event: {
        id: string;
        timestamp_ms: number;
        updated_at_ms: number;
        type: string; // "INITIAL_PURCHASE", "RENEWAL", "CANCELLATION", etc.
        app_user_id: string;
        aliases?: string[];
        original_app_user_id: string;
        subscriber_attributes?: Record<string, any>;
        subscriber?: {
            subscriber_id: string;
            original_app_user_id: string;
            entitlements: Record<string, {
                expires_date: string;
                purchase_date: string;
                product_identifier: string;
                is_active: boolean;
                will_renew: boolean;
                period_type: string;
                store: string;
                unsubscribe_detected_at?: string;
                billing_issue_detected_at?: string;
            }>;
            subscriptions: Record<string, {
                id: string;
                store: string;
                transaction_id: string;
                original_transaction_id: string;
                purchased_at_ms: number;
                renewal_number: number;
                presented_offering_id?: string;
                expires_date: string;
                auto_resume_date?: string;
                is_sandbox: boolean;
                ownership_type: string;
                period_type: string;
                product_identifier: string;
                store_transaction_id: string;
                unsubscribe_detected_at?: string;
                billing_issue_detected_at?: string;
            }>;
        };
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
