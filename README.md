# Conversation Parser Backend

A powerful Node.js backend service that converts conversation recordings into structured chat messages with intelligent speaker identification and message parsing.

## 🚀 Features

- **Audio Upload & Processing**: Support for multiple audio formats (WAV, MP3, M4A, WebM, OGG)
- **Speaker Diarization**: Automatic speaker identification and separation
- **Speech-to-Text**: High-accuracy transcription using Google Cloud Speech-to-Text
- **Message Parsing**: Intelligent conversation parsing with question/response detection
- **Structured Output**: Clean JSON format with speakers, messages, and insights
- **RESTful API**: Complete REST API with comprehensive documentation
- **Cloud Ready**: Designed for Google Cloud Run deployment
- **Extensible Architecture**: Interface-driven design for easy enhancements

## 📋 Prerequisites

- **Node.js** 18+
- **npm** 8+
- **Google Cloud Account** with billing enabled
- **Firebase Project**

## 🛠️ Installation

### 1. Clone and Setup

```bash
git clone https://github.com/yourusername/conversation-parser-backend.git
cd conversation-parser-backend

# Install dependencies
npm install
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 3. Google Cloud Setup

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable speech.googleapis.com
gcloud services enable storage.googleapis.com

# Create service account
gcloud iam service-accounts create conversation-parser \
    --display-name="Conversation Parser Service"

# Download credentials
gcloud iam service-accounts keys create ./config/service-account.json \
    --iam-account=conversation-parser@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## 🏃‍♂️ Quick Start

### Development Mode
```bash
# Start development server with hot reload
npm run dev

# Server will start on http://localhost:8080
```

### Build for Production
```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📡 API Endpoints

### Upload and Process Conversation
```bash
POST /api/conversations/parse
Content-Type: multipart/form-data

# Example using curl
curl -X POST http://localhost:8080/api/conversations/parse \
  -F "recording=@conversation.wav" \
  -F "title=Team Meeting" \
  -F "language=en-US"
```

### Check Processing Status
```bash
GET /api/conversations/{conversationId}/status
```

### Get Conversation Results
```bash
GET /api/conversations/{conversationId}
```

### List All Conversations
```bash
GET /api/conversations
```

## 🏗️ Project Structure

```
conversation-parser-backend/
├── src/
│   ├── controllers/         # API route controllers
│   ├── services/           # Business logic services
│   ├── interfaces/         # TypeScript interfaces
│   ├── middleware/         # Express middleware
│   ├── utils/             # Utility functions
│   ├── config/            # Configuration files
│   └── server.ts          # Main server file
├── tests/                 # Test files
├── docs/                  # Documentation
├── scripts/               # Build and deployment scripts
├── config/                # Configuration files
├── dist/                  # Compiled JavaScript (generated)
└── coverage/              # Test coverage reports (generated)
```

## 🔧 Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run deploy` | Deploy to Google Cloud Run |

## 🐳 Docker Support

```bash
# Build Docker image
npm run docker:build

# Run in container
npm run docker:run
```

## ☁️ Deployment

### Google Cloud Run
```bash
# Deploy to Cloud Run
npm run deploy

# Or manually
gcloud run deploy conversation-parser \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## 🧪 Testing

The project includes comprehensive testing:

- **Unit Tests**: Individual component testing
- **Integration Tests**: API endpoint testing
- **Coverage Reports**: Automated coverage reporting

```bash
# Run specific test file
npm test -- --testPathPattern=conversation.test.ts

# Run tests with verbose output
npm test -- --verbose
```

## 📊 Monitoring

- **Health Check**: `GET /health`
- **Metrics**: Built-in request/response logging
- **Error Tracking**: Comprehensive error handling

## 🔒 Security Features

- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: API rate limiting protection
- **File Validation**: Secure file upload handling
- **CORS Protection**: Configurable CORS policies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `/docs` folder
- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Use GitHub Discussions for questions

## 🗺️ Roadmap

- [ ] Real-time processing status updates
- [ ] Multiple language support
- [ ] Advanced conversation analytics
- [ ] Speaker name identification
- [ ] Export to different formats
- [ ] WebSocket support for real-time features

---

Built with ❤️ using Node.js, TypeScript, and Google Cloud Platform
