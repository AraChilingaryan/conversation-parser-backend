// src/controllers/revenuecat.controller.ts - RevenueCat webhook adaptation

import {Request, Response} from 'express';
import {v4 as uuidv4} from 'uuid';
import {databaseService} from '../services/database.service';
import {SubscriptionHelper} from '../interfaces/user.interface';
import {logger} from '../utils/logger.util';
import {APIErrorCodes, APIResponse} from '../interfaces/api.interface';

// Configuration - move to environment variables
// const RC_SHARED_SECRET = process.env.REVENUECAT_SHARED_SECRET || 'someId';
const RC_SHARED_SECRET = '9e11d77adde049c1a8531da67f5e78b6';
const DEFAULT_ENTITLEMENT_ID = 'premium';

/**
 * Adapted RevenueCat webhook handler
 */
export const handleRevenueCatWebhook = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
        const webhookData = req.body
        const event = webhookData.event

        logger.info('RevenueCat webhook received:', {
            eventType: event.type,
            appUserId: event.app_user_id,
            requestId,
            hasEntitlements: !!event.entitlements || !!event.subscriber?.entitlements
        });

        // 1. Validate shared secret (same as your Firebase function)
        if (RC_SHARED_SECRET && req.query?.token !== RC_SHARED_SECRET) {
            logger.warn('RevenueCat webhook unauthorized access attempt', {requestId});
            res.status(401).json({
                success: false,
                error: {
                    code: APIErrorCodes.UNAUTHORIZED,
                    message: 'Unauthorized webhook access',
                    timestamp: new Date().toISOString(),
                    requestId
                }
            } as APIResponse);
            return;
        }

        // 2. Extract user ID (same logic as your Firebase function)
        const uid = event.app_user_id || event.subscriber?.app_user_id;
        if (!uid) {
            logger.error('RevenueCat webhook missing app_user_id', {requestId});
            res.status(400).json({
                success: false,
                error: {
                    code: APIErrorCodes.REVENUECAT_WEBHOOK_INVALID,
                    message: 'Missing app_user_id in webhook data',
                    timestamp: new Date().toISOString(),
                    requestId
                }
            } as APIResponse);
            return;
        }

        // 3. Find user in our database
        const user = await databaseService.users.findByUid(uid);
        if (!user) {
            logger.warn('RevenueCat webhook for unknown user:', {appUserId: uid, requestId});
            // Still return 200 to RevenueCat so they don't retry
            res.status(200).json({
                success: false,
                error: {
                    code: APIErrorCodes.USER_NOT_FOUND,
                    message: 'User not found',
                    timestamp: new Date().toISOString(),
                    requestId
                }
            } as APIResponse);
            return;
        }

        // 4. Extract entitlement data (adapted from your Firebase logic)
        const entitlements = event.entitlements || event.subscriber?.entitlements || {};
        const entitlement = entitlements[DEFAULT_ENTITLEMENT_ID] || Object.values(entitlements)[0] || null;

        if (!entitlement) {
            logger.info('No entitlements found in webhook, treating as cancellation/expiration', {uid, requestId});
        }

        // 5. Process subscription data (using your existing logic)
        const expiresISO = entitlement?.expires_date || entitlement?.expires_at || null;
        const expiresAt = expiresISO ? new Date(expiresISO) : new Date(); // Default to now if no expiry
        const now = new Date();

        const isActive = entitlement ? (!expiresAt || expiresAt > now) : false;
        const willRenew = entitlement?.will_renew !== undefined ? Boolean(entitlement.will_renew) : false;
        const entitlementId = entitlement?.product_identifier || entitlement?.productId || 'none';

        // 6. Create subscription data in our format
        const revenueCatData = {
            entitlementId,
            isActive,
            expiresAt: expiresAt.toISOString(),
            willRenew,
            eventType: event.type || 'UNKNOWN',
            revenueCatUserId: event.subscriber?.subscriber_id || uid,
            originalAppUserId: event.subscriber?.original_app_user_id || uid,
            store: entitlement?.store || 'app_store',
            periodType: entitlement?.period_type || 'normal'
        };

        // 7. Update subscription using our helper
        const updatedSubscription = SubscriptionHelper.updateSubscriptionFromRevenueCat(
            user.subscription,
            revenueCatData
        );

        // 8. Save to database
        await databaseService.users.updateSubscription(user.uid, updatedSubscription);

        // 9. Log the update
        logger.info('RevenueCat subscription updated successfully:', {
            uid,
            entitlementId,
            isActive,
            status: updatedSubscription.status,
            plan: updatedSubscription.plan,
            eventType: event.type,
            requestId
        });

        // 10. Return success response to RevenueCat
        res.status(200).json({
            success: true,
            data: {
                message: 'Subscription updated successfully',
                userId: uid,
                eventType: event.type,
                subscriptionStatus: updatedSubscription.status
            },
            metadata: {
                requestId,
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - startTime,
                version: '1.0.0'
            }
        } as APIResponse);

    } catch (error) {
        logger.error('RevenueCat webhook processing error:', error);

        // Return 500 so RevenueCat retries
        res.status(500).json({
            success: false,
            error: {
                code: APIErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Webhook processing failed',
                timestamp: new Date().toISOString(),
                requestId
            },
            metadata: {
                requestId,
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - startTime,
                version: '1.0.0'
            }
        } as APIResponse);
    }
};
