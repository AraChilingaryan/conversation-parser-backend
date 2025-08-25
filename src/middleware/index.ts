export * from './error-handler.middleware';

export interface ConversationMetadata {
    title: string;
    duration: number;
    language: string;
    recordingDate: string;
    processingDate: string;
    confidence: number;
}

export interface Speaker {
    id: string;
    label: string;
    identifiedName: string | null;
    totalSpeakingTime: number;
    characteristics?: {
        averagePitch?: string;
        estimatedGender?: string;
    };
}

export interface Message {
    messageId: string;
    speakerId: string;
    content: string;
    startTime: number;
    endTime: number;
    confidence: number;
    messageType: 'question' | 'response' | 'statement';
    order: number;
}

export interface ConversationInsights {
    totalMessages: number;
    questionCount: number;
    responseCount: number;
    averageMessageLength: number;
    conversationFlow: string;
}

export interface ConversationData {
    conversationId: string;
    metadata: ConversationMetadata;
    speakers: Speaker[];
    conversation: Message[];
    insights: ConversationInsights;
}
