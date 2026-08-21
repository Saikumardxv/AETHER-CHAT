import mongoose from '../config/db.js';

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  content: {
    type: String,
    trim: true,
    default: '',
  },
  fileUrl: {
    type: String,
    default: '',
  },
  fileName: {
    type: String,
    default: '',
  },
  fileType: {
    type: String,
    default: '',
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    readAt: {
      type: Date,
      default: Date.now,
    }
  }],
  // Phase 2: reactions — array of { emoji, users[] } 
  reactions: [{
    emoji: { type: String, required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  }],
  // Phase 2: reply threading
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  // Phase 2: edit tracking
  isEdited: {
    type: Boolean,
    default: false,
  },
  // Phase 2: soft-delete
  isDeleted: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: true
});

const Message = mongoose.model('Message', messageSchema);
export default Message;
