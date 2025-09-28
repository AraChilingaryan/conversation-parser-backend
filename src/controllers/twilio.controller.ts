import {Request, Response} from 'express';
import {twilioIntegrationService} from '../services/twilio-integration.service';
import {logger} from '../utils/logger.util';
import {v4 as uuidv4} from 'uuid';
import type {APIResponse} from '../interfaces/api.interface';
import {CallAuthorizationRequest} from "../interfaces/user.interface";
import {userMetadataService} from "../services/user-metadata.service";

/**
 * Handle Twilio recording webhook
 */
export const handleRecordingWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
        logger.info('Received Twilio recording webhook:', {
            method: req.method,
            headers: {
                'content-type': req.headers['content-type'],
                'user-agent': req.headers['user-agent']
            },
            body: req.body
        });

        const {
            CallSid,
            RecordingSid,
            RecordingUrl,
            RecordingDuration
        } = req.body;

        // Validate webhook data
        if (!CallSid || !RecordingUrl) {
            logger.warn('Invalid Twilio webhook data:', req.body);
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_WEBHOOK_DATA',
                    message: 'Missing required fields: CallSid and RecordingUrl are required',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
            return;
        }

        // Store recording metadata (simple approach)
        const result = await twilioIntegrationService.storeRecordingMetadata({
            CallSid,
            RecordingSid,
            RecordingUrl,
            RecordingDuration
        }, req.body);

        if (result.success) {
            logger.info(`Recording metadata stored successfully: ${result.recordingId}`);

            res.json({
                success: true,
                data: {
                    recordingId: result.recordingId,
                    message: 'Recording metadata stored successfully',
                    status: 'stored',
                    processingStatus: 'ready_for_processing'
                },
                metadata: {
                    requestId: uuidv4(),
                    timestamp: new Date().toISOString(),
                    processingTime: 0,
                    version: '1.0.0',
                    source: 'twilio_webhook'
                }
            } as APIResponse);
        } else {
            logger.error(`Recording metadata storage failed: ${result.error}`);

            res.status(500).json({
                success: false,
                error: {
                    code: 'STORAGE_FAILED',
                    message: result.error || 'Failed to store recording metadata',
                    timestamp: new Date().toISOString()
                }
            } as APIResponse);
        }

    } catch (error) {
        logger.error('Error in Twilio webhook handler:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'WEBHOOK_HANDLER_ERROR',
                message: 'Internal server error processing webhook',
                timestamp: new Date().toISOString()
            }
        } as APIResponse);
    }
};

/**
 * Test endpoint for Twilio integration
 */
export const testTwilioIntegration = async (req: Request, res: Response): Promise<void> => {
    try {
        // Mock Twilio webhook data for testing
        const mockWebhookData = {
            CallSid: 'CA' + Math.random().toString(36).substring(2, 15),
            RecordingSid: 'RE' + Math.random().toString(36).substring(2, 15),
            RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/test/Recordings/test.wav',
            RecordingDuration: '30'
        };

        logger.info('Testing Twilio integration with mock data:', mockWebhookData);

        res.json({
            success: true,
            data: {
                message: 'Twilio integration is configured and ready',
                mockWebhookData,
                webhookEndpoint: '/api/v1/webhooks/twilio/recording',
                instructions: 'Configure this endpoint in your Twilio Console under Phone Numbers > Manage > Active numbers > [Your Number] > Voice Configuration'
            }
        });

    } catch (error) {
        logger.error('Error testing Twilio integration:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'TEST_FAILED',
                message: 'Twilio integration test failed',
                timestamp: new Date().toISOString()
            }
        });
    }
};

/**
 * Get Twilio-sourced conversations
 */
export const getTwilioConversations = async (req: Request, res: Response): Promise<void> => {
    try {
        // This would use your existing conversation search but filter for Twilio sources
        // Implementation depends on how you want to structure this query

        res.json({
            success: true,
            data: {
                conversations: [], // Implement filtering logic
                message: 'Twilio conversations retrieved',
                filters: {
                    source: 'twilio',
                    hasPhoneNumbers: true
                }
            }
        });

    } catch (error) {
        logger.error('Error getting Twilio conversations:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'QUERY_FAILED',
                message: 'Failed to retrieve Twilio conversations',
                timestamp: new Date().toISOString()
            }
        });
    }
};

/**
 * Enhanced Twilio call authorization webhook
 */
export const authorizeCall = async (req: Request, res: Response): Promise<void> => {
    try {
        const {From: fromNumber, To: toNumber, CallSid: callSid} = req.body;

        const authRequest: CallAuthorizationRequest = {
            fromNumber,
            toNumber,
            callSid
        };
        logger.info('Call authorization request:', {fromNumber, toNumber, callSid});

        const authResult = await userMetadataService.authorizeCall(authRequest);
        // const authResult = {
        //         authorized: true,
        //         userId: 'test_user_1234',
        //         remainingMinutes: 120,
        //         reason: 'Authorized'
        //     }; // enable for testing

        if (authResult.authorized) {
            // Return TwiML to allow the call and record it
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Welcome to your conversation recorder. This call will be recorded.</Say>
          <Record action="/api/v1/twilio/recording" 
                  method="POST" 
                  recordingStatusCallback="/api/v1/twilio/recording"
                  maxLength="3600"
                  finishOnKey="#" />
        </Response>`;

            res.set('Content-Type', 'text/xml');
            res.send(twiml);
        } else {
            // Return TwiML to reject the call with appropriate message
            let message = 'This service is not available.';

            switch (authResult.reason) {
                case 'Number not assigned to any user':
                    message = 'This number is not registered with our service.';
                    break;
                case 'Subscription expired or canceled':
                    message = 'Your subscription has expired. Please renew to continue using this service.';
                    break;
                case 'Trial minutes exceeded':
                    message = 'Your trial minutes have been used up. Please upgrade your plan to continue.';
                    break;
                case 'Subscription period ended':
                    message = 'Your subscription period has ended. Please renew to continue.';
                    break;
            }

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>${message}</Say>
          <Hangup/>
        </Response>`;

            res.set('Content-Type', 'text/xml');
            res.send(twiml);
        }

    } catch (error) {
        logger.error('Error in call authorization:', error);

        // Return error TwiML
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Service temporarily unavailable. Please try again later.</Say>
        <Hangup/>
      </Response>`;

        res.set('Content-Type', 'text/xml');
        res.send(twiml);
    }
};
