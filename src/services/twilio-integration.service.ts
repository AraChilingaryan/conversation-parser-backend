// src/services/twilio-integration.service.ts

import axios from 'axios';
import {logger} from '../utils/logger.util';
import {processingService} from './processing.service';
import {Recording} from "@/interfaces/user.interface";
import {userMetadataService} from "../services/user-metadata.service";
import {recordingRepository} from "../repositories/recording.repository";

export interface TwilioRecordingData {
    CallSid: string;
    RecordingSid: string;
    RecordingUrl: string;
    RecordingDuration: string;
    // Additional Twilio fields can be added
}

export interface TwilioCallData {
    from: string;
    to: string;
    status: string;
    direction: string;
    start_time?: string;
    end_time?: string;
    duration?: string;
    price?: string;
    price_unit?: string;
    parent_call_sid?: string;
}

export class TwilioIntegrationService {
    private static instance: TwilioIntegrationService;

    private constructor() {
    }

    static getInstance(): TwilioIntegrationService {
        if (!TwilioIntegrationService.instance) {
            TwilioIntegrationService.instance = new TwilioIntegrationService();
        }
        return TwilioIntegrationService.instance;
    }

    /**
     * Simple method to store recording metadata in Firebase
     */
    async storeRecordingMetadata(twilioData: TwilioRecordingData, webhookBody: any): Promise<{
        success: boolean;
        recordingId?: string;
        error?: string;
    }> {
        try {
            logger.info(`Storing recording metadata for CallSid: ${twilioData.CallSid}`);

            const callData = await this.fetchTwilioCallData(twilioData.CallSid);

            const fromNumber = callData.from;
            const toNumber = callData.to;
            const {AccountSid} = webhookBody;

            // Find user by their phone number (the caller)
            const userResult = await userMetadataService.getUserByPhone(fromNumber);

            if (!userResult.success || !userResult.user) {
                logger.warn(`No user found for phone number: ${fromNumber}`);
                return {
                    success: false,
                    error: `No user found for phone number: ${fromNumber}`
                };
            }

            const user = userResult.user;

            // Calculate call timing
            const recordingDuration = parseInt(twilioData.RecordingDuration) || 0;
            const callDuration = callData.duration ? parseInt(callData.duration) : 0;
            const callStartTime = callData.start_time || new Date().toISOString();
            const callEndTime = callData.end_time || new Date().toISOString();
            const callPrice = Math.abs(parseFloat(callData.price || '0')); // Make price positive
            const callPriceUnit = callData.price_unit || 'USD';

            // Create Recording object with simple data mapping
            const recording: Omit<Recording, 'id' | 'createdAt' | 'updatedAt'> = {
                userId: user.uid,

                // Twilio data (from webhook)
                callSid: twilioData.CallSid,
                recordingSid: twilioData.RecordingSid,
                recordingUrl: twilioData.RecordingUrl,
                recordingDuration: recordingDuration,

                // Call details (from Twilio API)
                fromNumber: fromNumber,
                toNumber: toNumber,
                callDirection: callData.direction as 'inbound' | 'outbound',
                callStartTime: callStartTime,
                callEndTime: callEndTime,
                callStatus: callData.status,
                callDuration: callDuration,

                // Processing status (defaults)
                processed: false,
                transcriptionStatus: 'pending',
                conversationId: undefined,

                // Billing (from Twilio API)
                callPrice: callPrice,
                callPriceUnit: callPriceUnit,

                // Metadata
                metadata: {
                    twilioAccountSid: AccountSid,
                    callDirection: callData.direction,
                    parentCallSid: callData.parent_call_sid || undefined,
                    source: 'twilio'
                },

                // Flags
                deleted: false
            };

            // Store in Firebase using repository
            await recordingRepository.createRecording(recording as Recording);

            logger.info(`Recording metadata stored successfully for CallSid: ${twilioData.CallSid}`);

            return {
                success: true,
                recordingId: twilioData.CallSid
            };

        } catch (error) {
            logger.error('Failed to store recording metadata:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Fetch call details from Twilio API
     */
    private async fetchTwilioCallData(callSid: string): Promise<TwilioCallData> {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials not configured');
        }

        try {
            const response = await axios.get(
                `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
                {
                    auth: {
                        username: accountSid,
                        password: authToken
                    },
                    timeout: 10000
                }
            );

            return response.data;
        } catch (error) {
            logger.error('Failed to fetch Twilio call data:', error);
            throw new Error(`Twilio API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Download recording from Twilio
     */
    public async downloadRecording(recordingUrl: string): Promise<Buffer> {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        try {
            const response = await axios.get(recordingUrl, {
                auth: {
                    username: accountSid!,
                    password: authToken!
                },
                responseType: 'arraybuffer',
                timeout: 30000 // 30 second timeout for audio download
            });

            return Buffer.from(response.data);
        } catch (error) {
            logger.error('Failed to download Twilio recording:', error);
            throw new Error(`Recording download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Format phone number for display
     */
    private formatPhoneNumber(phoneNumber: string): string {
        // Remove +1 country code for US numbers for cleaner display
        if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
            const number = phoneNumber.substring(2);
            return `(${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`;
        }
        return phoneNumber;
    }

    /**
     * Trigger background processing
     */
    private async triggerBackgroundProcessing(conversationId: string): Promise<void> {
        try {
            // Don't await - run in background
            processingService.processConversation(conversationId).catch(error => {
                logger.error(`Background processing failed for Twilio recording ${conversationId}:`, error);
            });
        } catch (error) {
            logger.error('Failed to trigger background processing:', error);
        }
    }

    /**
     * Save error record for debugging
     */
    private async saveErrorRecord(twilioData: TwilioRecordingData, error: any): Promise<void> {
        try {
            const errorRecord = {
                type: 'twilio_webhook_error',
                twilioData,
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                },
                timestamp: new Date().toISOString()
            };

            // Save to a separate errors collection for debugging
            // You might want to implement this in your database service
            logger.error('Twilio webhook error record:', errorRecord);
        } catch (saveError) {
            logger.error('Failed to save error record:', saveError);
        }
    }
}

export const twilioIntegrationService = TwilioIntegrationService.getInstance();
