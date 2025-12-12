# ClarityAI - Full Stack Web Application

A modern AI-powered web application built with React (frontend) and Node.js/Express (backend) that provides four core AI features: Explain Anything, Roadmap Generator, Rewrite Text, and Document Summarizer.

## Project Structure

```
ClarityAI/
├── markdown.md                 # Complete AI specifications & requirements
├── README.md                   # This file
├── backend/                    # Node.js/Express backend
│   ├── src/
│   │   ├── server.js           # Main Express app
│   │   ├── modules/            # AI services (prompt manager, model adapter, postprocessor)
│   │   ├── routes/             # API endpoints
│   │   ├── models/             # MongoDB schemas
│   │   ├── middleware/         # Authentication & middleware
│   │   └── utils/              # Helpers & logger
│   ├── package.json
│   └── .env.example
└── frontend/                   # React web application
    ├── src/
    │   ├── main.jsx            # Entry point
    │   ├── App.jsx             # Main app component
    │   ├── pages/              # Page components
    │   ├── components/         # Feature components
    │   ├── services/           # API client
    │   └── styles.css          # Global styles
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Features

### 1. Explain Anything (📚)
- Input: A topic or concept
- Output: 
  - One-paragraph summary (60-120 words)
  - 3 real-world examples
  - 5 key takeaway bullets
  - 6-10 keywords
  - 5-question MCQ with answers

### 2. Roadmap Generator (🗺️)
- Input: Goal, timeframe (weeks), experience level
- Output:
  - Week-by-week breakdown with tasks and milestones
  - 1-3 recommended resources with links
  - Confidence score (0.0-1.0)

### 3. Rewrite Text (✏️)
- Input: Text and desired tone (formal/friendly/short/assertive/persuasive)
- Output:
  - 3 rewrite variations
  - Subject line suggestions
  - 10-12 word social media caption
  - Summary of changes made
  - Confidence score

### 4. Document Summarizer (📄)
- Input: Document file (PDF, DOCX, images)
- Output:
  - Extracted text (stored in S3)
  - Short summary (60-120 words)
  - Key highlights
  - Action items
  - Keywords
  - Optional: Generated study roadmap

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **Authentication**: JWT + bcryptjs
- **AI Integration**: OpenAI API / Claude API
- **File Processing**: pdf-parse, tesseract.js, multer
- **Utilities**: axios, uuid, dotenv

### Frontend
- **Framework**: React 18
- **Bundler**: Vite
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Styling**: CSS3

## Setup Instructions

### Prerequisites
- Node.js (v16+) and npm
- MongoDB (local or Atlas)
- OpenAI API key (or Claude API key)

### Backend Setup

1. **Navigate to backend folder**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```

4. **Configure .env file**
   ```
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/clarityai
   JWT_SECRET=your_secret_key_here
   OPENAI_API_KEY=sk-your-key-here
   FRONTEND_URL=http://localhost:3000
   ```

5. **Start MongoDB** (if running locally)
   ```bash
   mongod
   ```

6. **Start the backend server**
   ```bash
   npm run dev
   ```

   Server will run at `http://localhost:5000`

### Frontend Setup

1. **Navigate to frontend folder** (in a new terminal)
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

   App will open at `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### AI Features
- `POST /api/ai/explain` - Explain a topic
- `POST /api/ai/rewrite` - Rewrite text
- `POST /api/ai/roadmap` - Generate learning roadmap

### Request & Response Format

All endpoints return structured JSON responses.

**Success Response:**
```json
{
  "status": "ok",
  "requestId": "req_xxx",
  "result": { ...feature-specific result... }
}
```

**Error Response:**
```json
{
  "status": "error",
  "requestId": "req_xxx",
  "error": "Error message"
}
```

## Development Workflow

### Day-by-Day Implementation

#### Day A: Backend Setup & Core Modules ✅
- [x] Express server configuration
- [x] MongoDB models (User, Request, SavedItem)
- [x] Prompt Manager module
- [x] Model Adapter with retries
- [x] Post Processor for validation
- [x] Logger & utilities

#### Day B: Auth & Basic Endpoints ✅
- [x] Authentication routes (register, login)
- [x] Explain endpoint
- [x] Rewrite endpoint
- [ ] Unit tests

#### Day C: Roadmap Feature ✅
- [x] Roadmap endpoint
- [x] Confidence normalization
- [ ] Frontend roadmap viewer

#### Day D: Document Upload Pipeline
- [ ] File upload handler
- [ ] OCR/PDF extraction
- [ ] Async worker setup

#### Day E: Chunking & Map-Reduce
- [ ] Text chunking
- [ ] Map-reduce summarization
- [ ] Result polling endpoint

#### Day F: Advanced Features
- [ ] Document summarizer endpoint
- [ ] PDF export functionality
- [ ] Feedback collection

#### Day G: Testing & Deployment
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Metrics tracking
- [ ] Deploy to production

## Database Schema

### User
```javascript
{
  email: String (unique),
  password: String (hashed),
  fullName: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Request (for tracking AI calls)
```javascript
{
  requestId: String (unique),
  userId: ObjectId (ref: User),
  featureType: 'explain|roadmap|rewrite|document',
  status: 'pending|processing|complete|failed',
  input: Mixed,
  result: Mixed,
  metrics: {
    promptTokens: Number,
    completionTokens: Number,
    totalTokens: Number,
    duration_ms: Number,
    modelProvider: String,
    modelVersion: String,
    confidence: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

### SavedItem
```javascript
{
  userId: ObjectId (ref: User),
  title: String,
  featureType: 'explain|roadmap|rewrite|document',
  content: Mixed,
  tags: [String],
  isPublic: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## Security Features

- JWT token-based authentication
- Password hashing with bcryptjs
- Secret pattern detection and redaction
- Input validation and sanitization
- CORS configuration
- Environment variable management

## Monitoring & Metrics

The app tracks:
- Feature usage (which features are used most)
- Token consumption (for cost management)
- Response times
- Error rates
- User confidence scores

All metrics are logged and can be used for:
- Cost optimization
- Performance tuning
- Feature improvement
- Debugging

## Error Handling

- Automatic retries with exponential backoff for transient errors
- Graceful fallbacks for invalid AI responses
- Comprehensive error logging
- User-friendly error messages

## Next Steps

1. **Set up environment variables** with your API keys
2. **Start MongoDB** locally or use MongoDB Atlas
3. **Run backend and frontend** servers
4. **Test API endpoints** using REST client (Postman, VS Code REST Client)
5. **Build document processing pipeline** (Day D onwards)
6. **Deploy to production** (Vercel for frontend, Heroku/AWS for backend)

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod`
- Check connection string in `.env`
- Verify network access if using MongoDB Atlas

### API Key Issues
- Verify OpenAI API key is valid
- Check key has sufficient credits
- Ensure key is not expired

### CORS Errors
- Verify `FRONTEND_URL` in backend `.env`
- Check that backend server is running
- Clear browser cache and restart dev servers

## Performance Optimization Tips

1. **Token Management**: Monitor token usage to optimize costs
2. **Caching**: Cache frequently requested explanations
3. **Chunking**: Use proper chunk sizes for document processing
4. **Batching**: Batch multiple requests when possible
5. **Async Processing**: Use workers for long-running tasks

## Contributing

This is a learning project. Feel free to:
- Implement missing features
- Optimize performance
- Add more AI providers
- Build additional features
- Improve UI/UX

---

**Built with modern web technologies and best practices for production-grade AI applications.**
