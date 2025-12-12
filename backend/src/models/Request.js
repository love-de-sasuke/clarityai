import mongoose from 'mongoose';

const requestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    nullable: true
  },
  featureType: {
    type: String,
    enum: ['explain', 'roadmap', 'rewrite', 'document'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'complete', 'failed'],
    default: 'pending'
  },
  input: mongoose.Schema.Types.Mixed,
  result: mongoose.Schema.Types.Mixed,
  errorMessage: String,
  metrics: {
    promptTokens: Number,
    completionTokens: Number,
    totalTokens: Number,
    duration_ms: Number,
    modelProvider: String,
    modelVersion: String,
    confidence: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Request', requestSchema);
