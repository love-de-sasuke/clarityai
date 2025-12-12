import mongoose from 'mongoose';

const savedItemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: String,
  featureType: {
    type: String,
    enum: ['explain', 'roadmap', 'rewrite', 'document'],
    required: true
  },
  content: mongoose.Schema.Types.Mixed,
  tags: [String],
  isPublic: {
    type: Boolean,
    default: false
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

export default mongoose.model('SavedItem', savedItemSchema);
