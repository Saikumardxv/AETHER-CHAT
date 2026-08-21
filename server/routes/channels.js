import express from 'express';
import Channel from '../models/Channel.js';
import Message from '../models/Message.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Helper: fully populate a channel
const populateChannel = (query) =>
  query
    .populate('members', '-password')
    .populate('createdBy', '-password')
    .populate({
      path: 'pinnedMessages',
      populate: { path: 'sender', select: 'username avatarUrl' },
    });

// @desc    Get user's channels (both groups and DMs)
// @route   GET /api/channels
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const channels = await populateChannel(
      Channel.find({ members: { $in: [req.user._id] } }).sort({ updatedAt: -1 })
    );
    res.json(channels);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a new group channel
// @route   POST /api/channels
// @access  Private
router.post('/', protect, async (req, res) => {
  const { name, description, members } = req.body;
  try {
    if (!name) {
      return res.status(400).json({ message: 'Channel name is required' });
    }
    const memberIds = new Set(members || []);
    memberIds.add(req.user._id.toString());

    const channel = await Channel.create({
      name,
      description: description || '',
      isGroup: true,
      members: Array.from(memberIds),
      createdBy: req.user._id,
    });

    const populated = await populateChannel(Channel.findById(channel._id));
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get or create a 1-to-1 DM channel
// @route   POST /api/channels/dm
// @access  Private
router.post('/dm', protect, async (req, res) => {
  const { userId } = req.body;
  console.log(`[DM] Channel request: ${req.user.username} -> user ${userId}`);
  try {
    if (!userId) {
      console.warn(`[DM] Rejected: missing recipient for ${req.user.username}`);
      return res.status(400).json({ message: 'User ID is required' });
    }

    let dm = await Channel.findOne({
      isGroup: false,
      members: { $all: [req.user._id, userId], $size: 2 },
    }).populate('members', '-password');

    if (!dm) {
      console.log(`[DM] Creating new 1-to-1 channel for ${req.user.username} and user ${userId}`);
      dm = await Channel.create({
        name: '',
        isGroup: false,
        members: [req.user._id, userId],
      });
      dm = await Channel.findById(dm._id).populate('members', '-password');
    } else {
      console.log(`[DM] Reusing existing 1-to-1 channel ${dm._id} for ${req.user.username} and user ${userId}`);
    }
    console.log(`[DM] Channel ready: ${dm._id}`);
    res.json(dm);
  } catch (error) {
    console.error(`[DM] Channel request failed for ${req.user.username}:`, error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete a direct chat for the current user
// @route   DELETE /api/channels/:channelId
// @access  Private (channel member)
router.delete('/:channelId', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ message: 'Chat not found' });
    if (!channel.members.map(member => member.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Message.deleteMany({ channel: channel._id });
    await Channel.findByIdAndDelete(channel._id);
    res.json({ channelId: channel._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Add a user to a channel
// @route   POST /api/channels/:channelId/members
// @access  Private (member of channel)
router.post('/:channelId/members', protect, async (req, res) => {
  const { userId } = req.body;
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    if (!channel.isGroup) return res.status(400).json({ message: 'Cannot add members to a DM' });
    if (!channel.members.map(m => m.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }
    if (channel.members.map(m => m.toString()).includes(userId)) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    channel.members.push(userId);
    await channel.save();

    const populated = await populateChannel(Channel.findById(channel._id));
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Remove a user from a channel
// @route   DELETE /api/channels/:channelId/members/:userId
// @access  Private (channel creator only)
router.delete('/:channelId/members/:userId', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    if (!channel.isGroup) return res.status(400).json({ message: 'Cannot remove from a DM' });

    const isCreator = channel.createdBy?.toString() === req.user._id.toString();
    const isSelf = req.params.userId === req.user._id.toString();

    if (!isCreator && !isSelf) {
      return res.status(403).json({ message: 'Only the channel creator can remove members' });
    }

    channel.members = channel.members.filter(m => m.toString() !== req.params.userId);
    await channel.save();

    const populated = await populateChannel(Channel.findById(channel._id));
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Pin or unpin a message in a channel (toggle)
// @route   POST /api/channels/:channelId/pin/:messageId
// @access  Private (member)
router.post('/:channelId/pin/:messageId', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });

    const memberIds = channel.members.map(m => m.toString());
    if (!memberIds.includes(req.user._id.toString())) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }

    const msgId = req.params.messageId;
    const alreadyPinned = channel.pinnedMessages.map(p => p.toString()).includes(msgId);

    if (alreadyPinned) {
      channel.pinnedMessages = channel.pinnedMessages.filter(p => p.toString() !== msgId);
    } else {
      channel.pinnedMessages.push(msgId);
    }

    await channel.save();

    const populated = await populateChannel(Channel.findById(channel._id));
    res.json({ pinnedMessages: populated.pinnedMessages, isPinned: !alreadyPinned });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Join a channel (self)
// @route   POST /api/channels/:channelId/join
// @access  Private
router.post('/:channelId/join', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    if (!channel.isGroup) return res.status(400).json({ message: 'Cannot add members to a DM' });
    if (channel.members.map(m => m.toString()).includes(req.user._id.toString())) {
      return res.status(400).json({ message: 'Already a member' });
    }

    channel.members.push(req.user._id);
    await channel.save();

    const populated = await populateChannel(Channel.findById(channel._id));
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
