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
    subscription: {
        status: 'trial' | 'active' | 'canceled' | 'expired';
        plan: 'basic' | 'premium' | 'enterprise';
        startDate: string;
        endDate: string;
        trialMinutesUsed: number;
        trialMinutesLimit: number;
        // iOS subscription metadata
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        lastSyncedFromApp?: string;
    };

    // Twilio assignment (received from iOS app)
    twilio: {
        assignedNumber?: string;
        numberSid?: string;
        assignedAt?: string;
        // iOS managed metadata
        lastSyncedFromApp?: string;
    };

    // Timestamps
    createdAt: string;
    updatedAt: string;
    lastLoginAt?: string;
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
    uid: string; // From iOS app
    phoneNumber: string;
    profile?: {
        firstName?: string;
        lastName?: string;
        email?: string;
        timezone?: string;
    };
    subscription: {
        status: 'trial' | 'active' | 'canceled' | 'expired';
        plan: 'basic' | 'premium' | 'enterprise';
        startDate: string;
        endDate: string;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
    };
    twilio: {
        assignedNumber: string;
        numberSid: string;
    };
}

export interface UpdateUserSubscriptionRequest {
    uid: string;
    subscription: {
        status: 'trial' | 'active' | 'canceled' | 'expired';
        plan: 'basic' | 'premium' | 'enterprise';
        startDate: string;
        endDate: string;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
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
