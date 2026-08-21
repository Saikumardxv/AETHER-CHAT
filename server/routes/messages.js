import express from 'express';
import Message from '../models/Message.js';
import Channel from '../models/Channel.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Helper: populate a message fully
const populateMessage = (query) =>
  query
    .populate('sender', 'username email avatarUrl status')
    .populate('readBy.user', 'username avatarUrl')
    .populate('reactions.users', 'username avatarUrl')
    .populate('replyTo', 'content sender fileUrl fileName fileType isDeleted')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'username avatarUrl' } });

// @desc    Get all messages for a channel
// @route   GET /api/messages/:channelId
// @access  Private
router.get('/:channelId', protect, async (req, res) => {
  try {
    const channelId = req.params.channelId;
    console.log(`[DM] Message history requested: ${req.user.username} <- channel ${channelId}`);

    const channel = await Channel.findById(channelId);
    if (!channel) {
      console.warn(`[DM] History denied: channel ${channelId} not found`);
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.members.includes(req.user._id)) {
      console.warn(`[DM] History denied: ${req.user.username} is not a member of ${channelId}`);
      return res.status(403).json({ message: 'Not authorized to view messages in this channel' });
    }

    const messages = await populateMessage(
      Message.find({ channel: channelId }).sort({ createdAt: 1 })
    );

    console.log(`[DM] Message history returned: ${messages.length} messages for ${req.user.username} in ${channelId}`);
    res.json(messages);
  } catch (error) {
    console.error(`[DM] Message history failed for ${req.user.username}:`, error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Search messages in a channel
// @route   GET /api/messages/:channelId/search
// @access  Private
router.get('/:channelId/search', protect, async (req, res) => {
  const { q } = req.query;

  try {
    if (!q) {
      return res.status(400).json({ message: 'Search query parameter (q) is required' });
    }

    const channelId = req.params.channelId;

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.members.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const messages = await populateMessage(
      Message.find({
        channel: channelId,
        content: { $regex: q, $options: 'i' },
        isDeleted: false,
      }).sort({ createdAt: 1 })
    );

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Edit a message
// @route   PUT /api/messages/:messageId
// @access  Private (sender only)
router.put('/:messageId', protect, async (req, res) => {
  try {
    const { content } = req.body;
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this message' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: 'Cannot edit a deleted message' });
    }

    message.content = content;
    message.isEdited = true;
    await message.save();

    const updated = await populateMessage(Message.findById(message._id));
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Soft-delete a message
// @route   DELETE /api/messages/:messageId
// @access  Private (sender only)
router.delete('/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    message.isDeleted = true;
    message.content = '';
    message.fileUrl = '';
    message.fileName = '';
    message.fileType = '';
    await message.save();

    res.json({ messageId: message._id, channelId: message.channel });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
