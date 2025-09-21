// test-user-subscription-flow.ts
// Complete flow test: User creation -> RevenueCat webhook simulation

import axios from 'axios';

// Configuration
const API_BASE_URL = 'http://localhost:8080/api/v1'; // Adjust to your server
const REVENUECAT_SHARED_SECRET = '9e11d77adde049c1a8531da67f5e78b6'; // Should match your env variable

interface TestUser {
    uid: string;
    phoneNumber: string;
    profile: {
        firstName: string;
        lastName: string;
        email: string;
        timezone: string;
    };
    twilio: {
        assignedNumber: string;
        numberSid: string;
    };
}

interface RevenueCatWebhookEvent {
    api_version: string;
    event: {
        id: string;
        timestamp_ms: number;
        updated_at_ms: number;
        type: string;
        app_user_id: string;
        original_app_user_id: string;
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
            }>;
        };
    };
}

class UserSubscriptionFlowTester {
    private baseUrl: string;
    private sharedSecret: string;

    constructor(baseUrl: string, sharedSecret: string) {
        this.baseUrl = baseUrl;
        this.sharedSecret = sharedSecret;
    }

    /**
     * Step 1: Create a new user
     */
    async createUser(userData: TestUser): Promise<any> {
        console.log('🔵 Step 1: Creating user...');
        console.log('User data:', JSON.stringify(userData, null, 2));

        try {
            const response = await axios.post(`${this.baseUrl}/users`, userData, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ User created successfully');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return response.data;
        } catch (error) {
            // @ts-ignore
            console.error('❌ Failed to create user:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Step 2: Simulate RevenueCat webhook for trial subscription
     */
    async triggerTrialWebhook(userId: string): Promise<any> {
        console.log('\n🔵 Step 2: Triggering trial subscription webhook...');

        const webhookData: RevenueCatWebhookEvent = {
            api_version: "1.0",
            event: {
                id: `evt_${Date.now()}`,
                timestamp_ms: Date.now(),
                updated_at_ms: Date.now(),
                type: "INITIAL_PURCHASE",
                app_user_id: userId,
                original_app_user_id: userId,
                subscriber: {
                    subscriber_id: `sub_${userId}`,
                    original_app_user_id: userId,
                    entitlements: {
                        "premium": {
                            expires_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days trial
                            purchase_date: new Date().toISOString(),
                            product_identifier: "trial_premium",
                            is_active: true,
                            will_renew: false,
                            period_type: "trial",
                            store: "app_store"
                        }
                    }
                }
            }
        };

        try {
            const response = await axios.post(
                `${this.baseUrl}/revenuecat?token=${this.sharedSecret}`,
                webhookData,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Trial webhook processed successfully');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return response.data;
        } catch (error) {
            // @ts-ignore
            console.error('❌ Failed to process trial webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Step 3: Simulate RevenueCat webhook for premium subscription
     */
    async triggerPremiumWebhook(userId: string): Promise<any> {
        console.log('\n🔵 Step 3: Triggering premium subscription webhook...');

        const webhookData: RevenueCatWebhookEvent = {
            api_version: "1.0",
            event: {
                id: `evt_${Date.now()}`,
                timestamp_ms: Date.now(),
                updated_at_ms: Date.now(),
                type: "RENEWAL",
                app_user_id: userId,
                original_app_user_id: userId,
                subscriber: {
                    subscriber_id: `sub_${userId}`,
                    original_app_user_id: userId,
                    entitlements: {
                        "premium": {
                            expires_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
                            purchase_date: new Date().toISOString(),
                            product_identifier: "premium_monthly",
                            is_active: true,
                            will_renew: true,
                            period_type: "normal",
                            store: "app_store"
                        }
                    }
                }
            }
        };

        try {
            const response = await axios.post(
                `${this.baseUrl}/revenuecat?token=${this.sharedSecret}`,
                webhookData,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Premium webhook processed successfully');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return response.data;
        } catch (error) {
            // @ts-ignore
            console.error('❌ Failed to process premium webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Step 4: Simulate RevenueCat webhook for cancellation
     */
    async triggerCancellationWebhook(userId: string): Promise<any> {
        console.log('\n🔵 Step 4: Triggering cancellation webhook...');

        const webhookData: RevenueCatWebhookEvent = {
            api_version: "1.0",
            event: {
                id: `evt_${Date.now()}`,
                timestamp_ms: Date.now(),
                updated_at_ms: Date.now(),
                type: "CANCELLATION",
                app_user_id: userId,
                original_app_user_id: userId,
                subscriber: {
                    subscriber_id: `sub_${userId}`,
                    original_app_user_id: userId,
                    entitlements: {
                        "premium": {
                            expires_date: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(), // Still valid for 25 days
                            purchase_date: new Date().toISOString(),
                            product_identifier: "premium_monthly",
                            is_active: true,
                            will_renew: false, // Canceled but still active
                            period_type: "normal",
                            store: "app_store"
                        }
                    }
                }
            }
        };

        try {
            const response = await axios.post(
                `${this.baseUrl}/revenuecat?token=${this.sharedSecret}`,
                webhookData,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Cancellation webhook processed successfully');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return response.data;
        } catch (error) {
            // @ts-ignore
            console.error('❌ Failed to process cancellation webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Run complete flow test
     */
    async runCompleteFlow(): Promise<void> {
        console.log('🚀 Starting complete user subscription flow test...\n');

        // Generate test user data
        const testUser: TestUser = {
            uid: `test_user_${Date.now()}`,
            phoneNumber: '+1234567890',
            profile: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                timezone: 'America/New_York'
            },
            twilio: {
                assignedNumber: '+15551234567',
                numberSid: 'PN1234567890abcdef'
            }
        };

        try {
            // Step 1: Create user
            await this.createUser(testUser);
            await this.delay(1000); // Wait 1 second

            // Step 2: Trigger trial subscription
            await this.triggerTrialWebhook(testUser.uid);
            await this.delay(1000);

            // Step 3: Upgrade to premium
            await this.triggerPremiumWebhook(testUser.uid);
            await this.delay(1000);

            // Step 4: Cancel subscription
            await this.triggerCancellationWebhook(testUser.uid);

            console.log('\n🎉 Complete flow test finished successfully!');

        } catch (error) {
            // @ts-ignore
            console.error('\n💥 Flow test failed:', error.message);
            process.exit(1);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Test runner
async function main() {
    const tester = new UserSubscriptionFlowTester(API_BASE_URL, REVENUECAT_SHARED_SECRET);

    try {
        await tester.runCompleteFlow();
    } catch (error) {
        console.error('Test execution failed:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

export { UserSubscriptionFlowTester };
