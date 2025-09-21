// src/services/twilio-integration.service.ts

import axios from 'axios';
import { logger } from '../utils/logger.util';
import { databaseService } from './database.service';
import { storageService } from './storage.service';
import { processingService } from './processing.service';
import type { ConversationData } from '../interfaces/conversation.interface';
import { v4 as uuidv4 } from 'uuid';
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

    private constructor() {}

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
            const { AccountSid } = webhookBody;

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
                    parentCallSid: callData.parent_call_sid || undefined
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
     * Process Twilio recording webhook
     */
    async processRecordingWebhook(twilioData: TwilioRecordingData): Promise<{
        success: boolean;
        conversationId?: string;
        error?: string;
    }> {
        try {
            logger.info(`Processing Twilio recording: ${twilioData.CallSid}`);

            // Validate required fields
            if (!twilioData.CallSid || !twilioData.RecordingUrl) {
                throw new Error('Missing required fields: CallSid and RecordingUrl');
            }

            // Fetch call details from Twilio
            const callData = await this.fetchTwilioCallData(twilioData.CallSid);

            // Download and store the recording
            const conversationId = uuidv4();
            const audioBuffer = await this.downloadRecording(twilioData.RecordingUrl);

            // Upload to our storage
            const uploadResult = await storageService.uploadAudioFile(conversationId, {
                buffer: audioBuffer,
                originalName: `twilio_recording_${twilioData.RecordingSid}.wav`,
                mimeType: 'audio/wav',
                size: audioBuffer.length,
                duration: parseInt(twilioData.RecordingDuration) || 0
            });

            if (!uploadResult.success) {
                throw new Error(`Failed to upload recording: ${uploadResult.error?.message}`);
            }

            // Create conversation record with Twilio metadata
            const conversationData: ConversationData = {
                conversationId,
                status: 'uploaded',
                metadata: {
                    title: `Call Recording: ${this.formatPhoneNumber(callData.from)} → ${this.formatPhoneNumber(callData.to)}`,
                    description: `Twilio call recording from ${callData.start_time || 'unknown time'}`,
                    duration: parseInt(twilioData.RecordingDuration) || 0,
                    language: 'en-US', // Default, could be configurable
                    recordingDate: callData.start_time ? new Date(callData.start_time).toISOString() : new Date().toISOString(),
                    processingDate: new Date().toISOString(),
                    confidence: 0,
                    fileSize: audioBuffer.length,
                    originalFileName: `twilio_recording_${twilioData.RecordingSid}.wav`,
                    audioFormat: 'wav',
                    // Twilio-specific metadata
                    source: 'twilio',
                    twilioCallSid: twilioData.CallSid,
                    twilioRecordingSid: twilioData.RecordingSid,
                    fromNumber: callData.from,
                    toNumber: callData.to,
                    callDirection: callData.direction
                },
                speakers: [],
                messages: [],
                insights: {
                    totalMessages: 0,
                    questionCount: 0,
                    responseCount: 0,
                    statementCount: 0,
                    averageMessageLength: 0,
                    longestMessage: { messageId: '', length: 0 },
                    conversationFlow: 'unknown',
                    speakingTimeDistribution: []
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                processingLog: [
                    {
                        timestamp: new Date().toISOString(),
                        stage: 'upload',
                        message: 'Twilio recording received and stored',
                        duration: parseInt(twilioData.RecordingDuration) || 0
                    }
                ]
            };

            // Save to database
            await databaseService.conversations.createWithId(conversationId, conversationData);

            // Add validation log
            await databaseService.conversations.addProcessingLogEntry(conversationId, {
                timestamp: new Date().toISOString(),
                stage: 'validation',
                message: 'Twilio recording validated and ready for processing',
                duration: parseInt(twilioData.RecordingDuration) || 0
            });

            logger.info(`Twilio recording processed successfully: ${conversationId}`);

            // Optionally trigger automatic processing
            if (process.env.AUTO_PROCESS_TWILIO_RECORDINGS === 'true') {
                // Start processing in background
                this.triggerBackgroundProcessing(conversationId);
            }

            return {
                success: true,
                conversationId
            };

        } catch (error) {
            logger.error('Failed to process Twilio recording:', error);

            // Save error for debugging
            try {
                await this.saveErrorRecord(twilioData, error);
            } catch (saveError) {
                logger.error('Failed to save error record:', saveError);
            }

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
    private async downloadRecording(recordingUrl: string): Promise<Buffer> {
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
