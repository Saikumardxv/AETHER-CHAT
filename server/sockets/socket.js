import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Channel from '../models/Channel.js';

// Map of userId -> Set of socket.id
const onlineUsers = new Map();

// Helper: fully populate a message
const populateMessage = (query) =>
  query
    .populate('sender', 'username email avatarUrl status')
    .populate('readBy.user', 'username avatarUrl')
    .populate('reactions.users', 'username avatarUrl')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'username avatarUrl' } });

// Extract @mentions from content — returns array of usernames
const extractMentions = (content) => {
  const matches = content.match(/@(\w+)/g) || [];
  return matches.map(m => m.slice(1));
};

export const initSocket = (io) => {
  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    console.log(`[AUTH] Socket authentication attempt: ${socket.id}`);
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        console.warn(`[AUTH] Socket authentication rejected: no token (${socket.id})`);
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_123');
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        console.warn(`[AUTH] Socket authentication rejected: user ${decoded.id} not found`);
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      console.log(`[AUTH] Socket authentication successful: ${user.username} (${user._id})`);
      next();
    } catch (err) {
      console.error(`[AUTH] Socket authentication failed (${socket.id}):`, err.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`[AUTH] Authorized socket connected: ${socket.user.username} (${socket.id})`);

    // Track online users
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
      try {
        await User.findByIdAndUpdate(userId, { status: 'online' });
        socket.broadcast.emit('user_status', { userId, status: 'online' });
      } catch (err) {
        console.error('Error updating user online status:', err);
      }
    }
    onlineUsers.get(userId).add(socket.id);

    // Join all channel rooms
    try {
      const userChannels = await Channel.find({ members: socket.user._id });
      userChannels.forEach(ch => socket.join(ch._id.toString()));
    } catch (err) {
      console.error('Error joining rooms on connect:', err);
    }

    // Join a specific channel room
    socket.on('join_channel', (channelId) => {
      console.log(`[DM] ${socket.user.username} joined message room ${channelId}`);
      socket.join(channelId);
    });

    // ── Send message ───────────────────────────────────────────────────
    socket.on('send_message', async (data) => {
      const { channelId, content, fileUrl, fileName, fileType, replyTo } = data;
      console.log(`[DM] Message received from ${socket.user.username}: channel=${channelId}, textLength=${content?.length || 0}`);
      try {
        const channel = await Channel.findById(channelId);
        if (!channel || !channel.members.map(m => m.toString()).includes(userId)) {
          console.warn(`[AUTH] Socket message denied: ${socket.user.username} is not a member of channel ${channelId}`);
          return socket.emit('error_message', { message: 'Not authorized' });
        }

        let validReplyTo = null;
        if (replyTo) {
          const parentMessage = await Message.findOne({
            _id: replyTo,
            channel: channelId,
            isDeleted: false,
          }).select('_id');
          validReplyTo = parentMessage?._id || null;
        }

        let message = await Message.create({
          sender: socket.user._id,
          channel: channelId,
          content: content || '',
          fileUrl: fileUrl || '',
          fileName: fileName || '',
          fileType: fileType || '',
          replyTo: validReplyTo,
          readBy: [{ user: socket.user._id, readAt: new Date() }],
        });

        channel.updatedAt = new Date();
        await channel.save();

        message = await populateMessage(Message.findById(message._id));
        console.log(`[DM] Message stored: ${message._id}, sender=${socket.user.username}, channel=${channelId}`);

        // Broadcast to room
        io.to(channelId).emit('receive_message', message);
        console.log(`[DM] Message delivered to channel room ${channelId}: ${message._id}`);

        // Notify other members for channel list update + unread
        channel.members.forEach(memberId => {
          const idStr = memberId.toString();
          if (idStr !== userId) {
            const memberSockets = onlineUsers.get(idStr);
            if (memberSockets) {
              memberSockets.forEach(sockId => {
                io.to(sockId).emit('channel_updated', {
                  channelId,
                  messageSnippet: content || (fileUrl ? 'Shared an attachment' : ''),
                  updatedAt: channel.updatedAt,
                });
              });
            }
          }
        });

        // Phase 3: @mention notifications
        if (content) {
          const mentionedUsernames = extractMentions(content);
          if (mentionedUsernames.length > 0) {
            const mentionedUsers = await User.find({
              username: { $in: mentionedUsernames },
              _id: { $ne: socket.user._id },
            });

            mentionedUsers.forEach(mu => {
              const muId = mu._id.toString();
              // Only notify if they are in the channel
              if (channel.members.map(m => m.toString()).includes(muId)) {
                const muSockets = onlineUsers.get(muId);
                if (muSockets) {
                  muSockets.forEach(sockId => {
                    io.to(sockId).emit('mention_notification', {
                      channelId,
                      messageId: message._id,
                      from: socket.user.username,
                      content: content.substring(0, 80),
                    });
                  });
                }
              }
            });
          }
        }
      } catch (err) {
        console.error(`[DM] Message send failed for ${socket.user.username}:`, err.message);
        socket.emit('error_message', { message: 'Failed to send message' });
      }
    });

    // ── Typing indicators ──────────────────────────────────────────────
    socket.on('typing', ({ channelId }) => {
      socket.to(channelId).emit('typing', {
        channelId,
        userId: socket.user._id,
        username: socket.user.username,
      });
    });

    socket.on('stop_typing', ({ channelId }) => {
      socket.to(channelId).emit('stop_typing', {
        channelId,
        userId: socket.user._id,
        username: socket.user.username,
      });
    });

    // ── Read receipts ──────────────────────────────────────────────────
    socket.on('read_message', async ({ channelId, messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        const alreadyRead = message.readBy.some(r => r.user.toString() === userId);
        if (!alreadyRead) {
          message.readBy.push({ user: socket.user._id, readAt: new Date() });
          await message.save();

          io.to(channelId).emit('message_read', {
            channelId, messageId, userId,
            username: socket.user.username,
            readAt: new Date(),
          });
        }
      } catch (err) {
        console.error('Error processing read receipt:', err);
      }
    });

    // ── React to message ───────────────────────────────────────────────
    socket.on('react_message', async ({ channelId, messageId, emoji }) => {
      try {
        if (typeof emoji !== 'string' || !emoji.trim() || [...emoji].length > 16) {
          return socket.emit('error_message', { message: 'Invalid reaction' });
        }
        const message = await Message.findById(messageId);
        if (!message || message.isDeleted || message.channel.toString() !== channelId) return;

        const channel = await Channel.findById(channelId);
        if (!channel || !channel.members.map(m => m.toString()).includes(userId)) {
          return socket.emit('error_message', { message: 'Not authorized' });
        }

        const reactionIdx = message.reactions.findIndex(r => r.emoji === emoji);
        if (reactionIdx === -1) {
          message.reactions.push({ emoji, users: [socket.user._id] });
        } else {
          const userIdx = message.reactions[reactionIdx].users.findIndex(u => u.toString() === userId);
          if (userIdx === -1) {
            message.reactions[reactionIdx].users.push(socket.user._id);
          } else {
            message.reactions[reactionIdx].users.splice(userIdx, 1);
            if (message.reactions[reactionIdx].users.length === 0) {
              message.reactions.splice(reactionIdx, 1);
            }
          }
        }

        await message.save();
        const updatedMessage = await populateMessage(Message.findById(messageId));
        io.to(channelId).emit('message_reaction', {
          messageId,
          channelId,
          reactions: updatedMessage.reactions,
        });
      } catch (err) {
        console.error('Error processing reaction:', err);
      }
    });

    // ── Edit message ───────────────────────────────────────────────────
    socket.on('edit_message', async ({ channelId, messageId, content }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message || message.isDeleted) return;
        if (message.sender.toString() !== userId) {
          console.warn(`[AUTH] Socket edit denied: ${socket.user.username} does not own message ${messageId}`);
          return socket.emit('error_message', { message: 'Not authorized' });
        }

        message.content = content;
        message.isEdited = true;
        await message.save();

        io.to(channelId).emit('message_edited', { messageId, channelId, content, isEdited: true });
      } catch (err) {
        console.error('Error editing message:', err);
      }
    });

    // ── Delete message ─────────────────────────────────────────────────
    socket.on('delete_message', async ({ channelId, messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;
        if (message.sender.toString() !== userId) {
          console.warn(`[AUTH] Socket delete denied: ${socket.user.username} does not own message ${messageId}`);
          return socket.emit('error_message', { message: 'Not authorized' });
        }

        message.isDeleted = true;
        message.content = '';
        message.fileUrl = '';
        message.fileName = '';
        message.fileType = '';
        await message.save();

        io.to(channelId).emit('message_deleted', { messageId, channelId });
      } catch (err) {
        console.error('Error deleting message:', err);
      }
    });

    // ── Phase 3: Pin message ───────────────────────────────────────────
    socket.on('pin_message', async ({ channelId, messageId }) => {
      try {
        const channel = await Channel.findById(channelId)
          .populate({ path: 'pinnedMessages', populate: { path: 'sender', select: 'username avatarUrl' } });
        if (!channel) return;
        if (!channel.members.map(m => m.toString()).includes(userId)) return;

        const alreadyPinned = channel.pinnedMessages.map(p => p._id.toString()).includes(messageId);
        if (alreadyPinned) {
          channel.pinnedMessages = channel.pinnedMessages.filter(p => p._id.toString() !== messageId);
        } else {
          channel.pinnedMessages.push(messageId);
        }
        await channel.save();

        const updated = await Channel.findById(channelId)
          .populate({ path: 'pinnedMessages', populate: { path: 'sender', select: 'username avatarUrl' } });

        io.to(channelId).emit('channel_pins_updated', {
          channelId,
          pinnedMessages: updated.pinnedMessages,
        });
      } catch (err) {
        console.error('Error pinning message:', err);
      }
    });

    // ── Phase 3: Member added/removed broadcast ────────────────────────
    socket.on('member_added', ({ channelId, userId: addedId }) => {
      const addedSockets = onlineUsers.get(addedId);
      if (addedSockets) {
        addedSockets.forEach(sockId => {
          io.to(sockId).emit('added_to_channel', { channelId });
        });
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[AUTH] Socket disconnected: ${socket.user.username} (${socket.id})`);
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          try {
            const lastSeen = new Date();
            await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen });
            io.emit('user_status', { userId, status: 'offline', lastSeen });
            console.log(`User offline: ${socket.user.username}`);
          } catch (err) {
            console.error('Error updating offline status:', err);
          }
        }
      }
    });
  });
};
