import mongoose from '../config/db.js';

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: '',
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  avatarUrl: {
    type: String,
    default: '',
  },
  isGroup: {
    type: Boolean,
    default: true, // true: Channel/Group, false: 1-to-1 Direct Message (DM)
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  // Phase 3: Pinned messages
  pinnedMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
  }],
}, {
  timestamps: true
});

const Channel = mongoose.model('Channel', channelSchema);
export default Channel;
