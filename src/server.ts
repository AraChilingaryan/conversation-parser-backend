import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression = require('compression');
import { config } from 'dotenv';
import { healthRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware';
import { logger } from './utils/logger.util';
import { databaseService } from './services/database.service';
import { conversationRoutes } from './routes/conversation.routes';
import { handleUploadError } from './middleware/upload.middleware';
import { processingRoutes } from "./routes/processing.routes";
import { twilioRoutes } from './routes/twilio.routes';
import { userMetadataRoutes } from "./routes/user-metadata.routes";

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security and performance middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env['NODE_ENV'] === 'production'
        ? process.env['ALLOWED_ORIGINS']?.split(',') || []
        : '*',
    credentials: true
}));

// Logging
if (process.env['NODE_ENV'] !== 'test') {
    app.use(morgan('combined', {
        stream: { write: (message: string) => logger.info(message.trim()) }
    }));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes - SPECIFIC routes must come BEFORE general routes
app.use('/health', healthRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/processing', processingRoutes);
app.use('/api/v1/webhooks/twilio', twilioRoutes);
app.use('/api/v1', userMetadataRoutes);

app.use('/api/v1', (req, res) => {
    res.json({
        message: 'Conversation Parser API v1',
        version: '1.0.0',
        status: 'active',
        endpoints: {
            health: '/health',
            docs: '/api/docs',
            conversations: '/api/v1/conversations',
            processing: '/api/v1/processing'
        }
    });
});

app.use(handleUploadError);
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
async function startServer() {
    try {
        // Initialize database service FIRST
        logger.info('Initializing database service...');
        await databaseService.initialize();
        logger.info('Database service initialized successfully');

        // THEN start the HTTP server
        const server = app.listen(PORT, () => {
            logger.info(`🚀 Conversation Parser Backend started on port ${PORT}`);
            logger.info(`📱 Environment: ${process.env['NODE_ENV'] || 'development'}`);
            logger.info(`🌐 Health check: http://localhost:${PORT}/health`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            server.close(() => {
                logger.info('Process terminated');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            logger.info('SIGINT received, shutting down gracefully');
            server.close(() => {
                logger.info('Process terminated');
                process.exit(0);
            });
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;
