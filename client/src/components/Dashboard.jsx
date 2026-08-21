import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Hash, Plus, MessageSquare, Send, Paperclip, Search, 
  Info, LogOut, X, FileText, Download, Check, CheckCheck, 
  Smile, Pencil, Trash2, CornerUpLeft, Sun, Moon, UserRound
} from 'lucide-react';
import EmojiPicker from './EmojiPicker';

const Dashboard = ({ user, socket, onLogout, theme, onToggleTheme }) => {
  // ── Channels & Users ─────────────────────────────────────────────────
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});

  // ── Messages ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [typingUsers, setTypingUsers] = useState({});
  const [isSocketOnline, setIsSocketOnline] = useState(Boolean(socket?.connected));
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [reactionNotice, setReactionNotice] = useState('');
  const [selectedReaction, setSelectedReaction] = useState(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState(() => new Set());

  // ── Reply ─────────────────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState(null); // { _id, content, sender }

  // ── Edit ──────────────────────────────────────────────────────────────
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');

  // ── Emoji picker ──────────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [actionMessageId, setActionMessageId] = useState(null);

  // ── UI ────────────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDMModal, setShowDMModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  // ── Profile editing ───────────────────────────────────────────────────
  const [profileUsername, setProfileUsername] = useState(user.username);
  const [profileAvatar, setProfileAvatar] = useState(user.avatarUrl || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ── Search ────────────────────────────────────────────────────────────
  const [msgSearchQuery, setMsgSearchQuery] = useState('');
  const [searchedMessages, setSearchedMessages] = useState(null);

  // ── File upload ───────────────────────────────────────────────────────
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const fileInputRef = useRef(null);
  const profileFileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const longPressTimerRef = useRef(null);

  // ── Initial data fetch ────────────────────────────────────────────────
  useEffect(() => {
    fetchChannels();
    fetchUsers();
  }, []);

  // ── Socket events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    setIsSocketOnline(socket.connected);
    socket.on('connect', () => {
      setIsSocketOnline(true);
      fetchChannels();
      fetchUsers();
      socket.emit('presence_request');
    });
    socket.on('disconnect', () => setIsSocketOnline(false));

    socket.on('presence_snapshot', ({ userIds }) => {
      setOnlineUserIds(new Set((userIds || []).map(String)));
    });

    socket.on('user_status', ({ userId, status }) => {
      const normalizedUserId = String(userId);
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        if (status === 'online') next.add(normalizedUserId);
        else next.delete(normalizedUserId);
        return next;
      });
      setAllUsers(prev => prev.map(u => String(u._id) === normalizedUserId ? { ...u, status } : u));
      setChannels(prev => prev.map(ch => {
        return { ...ch, members: ch.members.map(m => String(m._id) === normalizedUserId ? { ...m, status } : m) };
      }));
      setActiveChannel(prev => prev ? {
        ...prev,
        members: prev.members.map(m => String(m._id) === normalizedUserId ? { ...m, status } : m),
      } : prev);
    });

    socket.on('receive_message', (message) => {
      const msgChannelId = message.channel;
      console.log(`[DM] Message received in client: ${message._id}, sender=${message.sender?.username}, channel=${msgChannelId}`);
      if (activeChannel && activeChannel._id === msgChannelId) {
        setMessages(prev => [...prev, message]);
        console.log(`[DM] Message rendered in active conversation: ${message._id}`);
        scrollToBottom();
        if (message.sender._id !== user._id) {
          socket.emit('read_message', { channelId: msgChannelId, messageId: message._id });
        }
      } else {
        setUnreadCounts(prev => ({
          ...prev,
          [msgChannelId]: (prev[msgChannelId] || 0) + 1
        }));
        showNotification(message);
      }
    });

    socket.on('channel_updated', () => { fetchChannels(); });

    socket.on('typing', ({ channelId, userId, username }) => {
      if (userId === user._id) return;
      setTypingUsers(prev => ({
        ...prev,
        [channelId]: { ...(prev[channelId] || {}), [userId]: username }
      }));
    });

    socket.on('stop_typing', ({ channelId, userId }) => {
      setTypingUsers(prev => {
        const next = { ...(prev[channelId] || {}) };
        delete next[userId];
        return { ...prev, [channelId]: next };
      });
    });

    socket.on('message_read', ({ channelId, messageId, userId, readAt }) => {
      if (activeChannel && activeChannel._id === channelId) {
        setMessages(prev => prev.map(msg => {
          if (msg._id === messageId) {
            const exists = msg.readBy.some(r => r.user?._id === userId || r.user === userId);
            if (!exists) {
              return { ...msg, readBy: [...msg.readBy, { user: { _id: userId }, readAt }] };
            }
          }
          return msg;
        }));
      }
    });

    // Phase 2: reaction update
    socket.on('message_reaction', ({ messageId, reactions }) => {
      console.log(`[REACTION] Update received for message ${messageId}`);
      setMessages(prev => prev.map(msg =>
        msg._id === messageId ? { ...msg, reactions } : msg
      ));
    });

    // Phase 2: edit update
    socket.on('message_edited', ({ messageId, content, isEdited }) => {
      setMessages(prev => prev.map(msg =>
        msg._id === messageId ? { ...msg, content, isEdited } : msg
      ));
    });

    // Phase 2: delete update
    socket.on('message_deleted', ({ messageId }) => {
      setMessages(prev => prev.map(msg =>
        msg._id === messageId ? { ...msg, isDeleted: true, content: '', fileUrl: '', fileName: '', fileType: '' } : msg
      ));
      setActionMessageId(null);
    });

    socket.on('error_message', ({ message }) => {
      console.error('[DM] Message action failed:', message);
      if (activeChannel?._id) fetchMessages(activeChannel._id);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('presence_snapshot');
      socket.off('user_status');
      socket.off('receive_message');
      socket.off('channel_updated');
      socket.off('typing');
      socket.off('stop_typing');
      socket.off('message_read');
      socket.off('message_reaction');
      socket.off('message_edited');
      socket.off('message_deleted');
      socket.off('error_message');
    };
  }, [socket, activeChannel]);

  // ── Load messages when active channel changes ─────────────────────────
  useEffect(() => {
    if (!activeChannel) return;
    setMsgSearchQuery('');
    setSearchedMessages(null);
    setReplyingTo(null);
    setEditingMessageId(null);
    fetchMessages(activeChannel._id);
    setUnreadCounts(prev => ({ ...prev, [activeChannel._id]: 0 }));
    if (socket) socket.emit('join_channel', activeChannel._id);
  }, [activeChannel]);

  // ── Data Fetchers ─────────────────────────────────────────────────────
  const fetchChannels = async () => {
    try {
      const res = await axios.get('/api/channels', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setChannels(res.data);
      if (res.data.length > 0 && !activeChannel) {
        setActiveChannel(res.data[0]);
      }
    } catch (err) { console.error('Fetch channels failed:', err); }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/auth/users', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setAllUsers(res.data);
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        res.data.forEach(directoryUser => {
          if (directoryUser.status === 'online') next.add(String(directoryUser._id));
          else next.delete(String(directoryUser._id));
        });
        return next;
      });
    } catch (err) { console.error('Fetch users failed:', err); }
  };

  const fetchMessages = async (channelId) => {
    console.log(`[DM] Loading conversation history: ${channelId}`);
    try {
      const res = await axios.get(`/api/messages/${channelId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMessages(res.data);
      console.log(`[DM] Conversation history rendered: ${res.data.length} messages in ${channelId}`);
      scrollToBottom();
      if (socket && res.data.length > 0) {
        res.data.forEach(msg => {
          const isSender = msg.sender._id === user._id;
          const readByMe = msg.readBy.some(r => r.user?._id === user._id || r.user === user._id);
          if (!isSender && !readByMe && !msg.isDeleted) {
            socket.emit('read_message', { channelId, messageId: msg._id });
          }
        });
      }
    } catch (err) { console.error(`[DM] Conversation history failed for ${channelId}:`, err.response?.data?.message || err.message); }
  };

  const scrollToBottom = () => {
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 50);
  };

  // ── Toast Notification ────────────────────────────────────────────────
  const showNotification = (message) => {
    if (!document.getElementById('toast-root')) {
      const el = document.createElement('div');
      el.id = 'toast-root';
      el.className = 'toast-container';
      document.body.appendChild(el);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div style="font-weight: 600; font-size: 0.85rem; color: #171717;">@ ${message.sender.username}</div>
      <div style="font-size: 0.8rem; margin-top: 4px; color: #686763; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${message.content || 'Shared a file'}
      </div>
    `;
    document.getElementById('toast-root').appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // ── Create Channel ────────────────────────────────────────────────────
  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      const res = await axios.post('/api/channels', {
        name: newChannelName, description: newChannelDesc, members: selectedMembers
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setChannels(prev => [res.data, ...prev]);
      setActiveChannel(res.data);
      setShowCreateModal(false);
      setNewChannelName('');
      setNewChannelDesc('');
      setSelectedMembers([]);
      if (socket) socket.emit('join_channel', res.data._id);
    } catch (err) { console.error('Create channel failed:', err); }
  };

  // ── Start DM ──────────────────────────────────────────────────────────
  const handleStartDM = async (userId) => {
    console.log(`[DM] Opening direct conversation with user ${userId}`);
    try {
      const res = await axios.post('/api/channels/dm', { userId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!channels.some(c => c._id === res.data._id)) {
        setChannels(prev => [res.data, ...prev]);
      }
      setActiveChannel(res.data);
      console.log(`[DM] Direct conversation opened: channel ${res.data._id}`);
      setShowDMModal(false);
    } catch (err) { console.error('[DM] Direct conversation failed:', err.response?.data?.message || err.message); }
  };

  // ── Typing ────────────────────────────────────────────────────────────
  const handleMessageChange = (e) => {
    setMessageText(e.target.value);
    if (!socket || !activeChannel) return;
    socket.emit('typing', { channelId: activeChannel._id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { channelId: activeChannel._id });
    }, 2000);
  };

  // ── File Upload ───────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    await uploadFile(file);
  };

  const uploadFile = async (file) => {
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (socket && activeChannel) {
        socket.emit('send_message', {
          channelId: activeChannel._id,
          content: messageText || '',
          fileUrl: res.data.fileUrl,
          fileName: res.data.fileName,
          fileType: res.data.fileType,
          replyTo: replyingTo?._id || null,
        });
        setMessageText('');
        setSelectedFile(null);
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed: File size too large or incorrect path');
    } finally {
      setUploadingFile(false);
    }
  };

  // ── Send Message ──────────────────────────────────────────────────────
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() && !selectedFile) return;
    if (socket && activeChannel) {
      console.log(`[DM] Sending text from ${user.username}: channel=${activeChannel._id}, textLength=${messageText.length}`);
      socket.emit('send_message', {
        channelId: activeChannel._id,
        content: messageText,
        replyTo: replyingTo?._id || null,
      });
      socket.emit('stop_typing', { channelId: activeChannel._id });
      setMessageText('');
      setReplyingTo(null);
    }
  };

  // ── Emoji Picker ──────────────────────────────────────────────────────
  const handleEmojiSelect = (emoji) => {
    setMessageText(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // ── React to Message ──────────────────────────────────────────────────
  const handleReact = (messageId, emoji) => {
    if (!socket || !socket.connected || !activeChannel) {
      console.warn('[REACTION] Cannot react: socket is not connected');
      return;
    }

    console.log(`[REACTION] Sending ${emoji} for message ${messageId}`);

    setMessages(prev => prev.map(msg => {
      if (msg._id !== messageId) return msg;
      const reactions = Array.isArray(msg.reactions) ? msg.reactions.map(r => ({
        ...r,
        users: Array.isArray(r.users) ? [...r.users] : [],
      })) : [];
      const reactionIndex = reactions.findIndex(r => r.emoji === emoji);
      if (reactionIndex === -1) {
        reactions.push({ emoji, users: [user._id] });
      } else {
        const users = reactions[reactionIndex].users;
        const userIndex = users.findIndex(reactionUser => reactionUserId(reactionUser) === String(user._id));
        if (userIndex === -1) users.push(user._id);
        else users.splice(userIndex, 1);
        if (users.length === 0) reactions.splice(reactionIndex, 1);
      }
      return { ...msg, reactions };
    }));

    socket.timeout(5000).emit('react_message', {
      channelId: activeChannel._id,
      messageId,
      emoji,
    }, (timeoutError, result) => {
      if (timeoutError || !result?.ok) {
        console.error('[REACTION] Failed:', timeoutError?.message || result?.message || 'No server acknowledgement');
        fetchMessages(activeChannel._id);
        return;
      }
      setMessages(prev => prev.map(msg =>
        msg._id === result.messageId ? { ...msg, reactions: result.reactions } : msg
      ));
      console.log(`[REACTION] Saved ${emoji} for message ${messageId}`);
      setReactionNotice(`${emoji} reaction saved`);
      setTimeout(() => setReactionNotice(''), 1400);
    });
  };

  const reactionUserId = (reactionUser) => {
    if (!reactionUser) return '';
    if (typeof reactionUser === 'object') {
      return String(reactionUser._id || reactionUser.id || '');
    }
    return String(reactionUser);
  };

  // Quick-react picker (floating minimal set)
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '✅', '👏'];

  // ── Edit Message ──────────────────────────────────────────────────────
  const startEdit = (msg) => {
    setEditingMessageId(msg._id);
    setEditingText(msg.content);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const submitEdit = (messageId) => {
    if (!editingText.trim()) return;
    if (socket && activeChannel) {
      socket.emit('edit_message', {
        channelId: activeChannel._id,
        messageId,
        content: editingText,
      });
    }
    cancelEdit();
  };

  // ── Delete Message ────────────────────────────────────────────────────
  const handleDelete = (messageId) => {
    if (!socket || !activeChannel) return;
    setMessages(prev => prev.map(msg =>
      msg._id === messageId ? { ...msg, isDeleted: true, content: '', fileUrl: '', fileName: '', fileType: '' } : msg
    ));
    setActionMessageId(null);
    socket.emit('delete_message', { channelId: activeChannel._id, messageId });
  };

  const handleDeleteForMe = (messageId) => {
    setHiddenMessageIds(prev => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  };

  const handleDeleteChat = async () => {
    if (!activeChannel || !window.confirm('Delete this chat and its messages?')) return;
    try {
      await axios.delete(`/api/channels/${activeChannel._id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const remainingChannels = channels.filter(channel => channel._id !== activeChannel._id);
      setChannels(remainingChannels);
      setActiveChannel(remainingChannels[0] || null);
      setMessages([]);
    } catch (error) {
      console.error('Delete chat failed:', error);
      alert(error.response?.data?.message || 'Could not delete this chat');
    }
  };

  const startLongPress = (messageId) => {
    longPressTimerRef.current = setTimeout(() => setActionMessageId(messageId), 500);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // ── Search ────────────────────────────────────────────────────────────
  const handleMessageSearch = async (e) => {
    e.preventDefault();
    if (!msgSearchQuery.trim()) { setSearchedMessages(null); return; }
    try {
      const res = await axios.get(`/api/messages/${activeChannel._id}/search?q=${msgSearchQuery}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSearchedMessages(res.data);
    } catch (err) { console.error('Search failed:', err); }
  };

  const clearSearch = () => { setMsgSearchQuery(''); setSearchedMessages(null); };

  // ── Profile Save ──────────────────────────────────────────────────────
  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      await axios.put('/api/auth/profile', {
        username: profileUsername,
        avatarUrl: profileAvatar,
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

      // Update local user state in localStorage
      const updatedUser = { ...user, username: profileUsername, avatarUrl: profileAvatar };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setShowProfileModal(false);
      window.location.reload(); // Reload to reflect username changes
    } catch (err) {
      console.error('Profile save failed:', err);
      alert('Failed to save profile. The profile update endpoint may not exist yet.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleProfileAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      setProfileAvatar(response.data.fileUrl);
    } catch (error) {
      console.error('Avatar upload failed:', error);
      alert('Could not upload profile picture. Please try another image.');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const toggleMemberSelection = (uid) => {
    setSelectedMembers(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const getDMRecipient = (channel) => {
    if (!channel || channel.isGroup) return null;
    return channel.members.find(m => String(m._id) !== String(user._id));
  };

  const typingState = activeChannel ? typingUsers[activeChannel._id] || {} : {};
  const typingNames = Object.values(typingState);
  const currentUserOnline = isSocketOnline;
  const dmRecipient = activeChannel && !activeChannel.isGroup ? getDMRecipient(activeChannel) : null;
  const dmRecipientOnline = Boolean(dmRecipient && onlineUserIds.has(String(dmRecipient._id)));
  const isUserOnline = (userId) => onlineUserIds.has(String(userId));

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={`app-container ${showDetails ? 'with-drawer' : ''}`}>

      {/* ══ Sidebar ══════════════════════════════════════════════════════ */}
      <div className="sidebar" style={styles.sidebar}>
        {/* Brand */}
        <div className="sidebarHeader" style={styles.sidebarHeader}>
          <div style={styles.brandContainer}>
            <div style={styles.brandLogo}>A</div>
            <div>
              <h3 style={styles.brandTitle}>Aether Space</h3>
              <span style={styles.brandSub}>Network Connection</span>
            </div>
          </div>
        </div>

        {/* Channels */}
        <div style={styles.sidebarSection}>
          <div className="sectionTitleRow" style={styles.sectionTitleRow}>
            <span>CHANNELS</span>
            <button onClick={() => setShowCreateModal(true)} style={styles.iconButton}>
              <Plus size={16} />
            </button>
          </div>
          <div className="listContainer" style={styles.listContainer}>
            {channels.filter(c => c.isGroup).map(c => (
              <button
                key={c._id}
                onClick={() => setActiveChannel(c)}
                className="channelItem"
                style={{ ...styles.channelItem, ...(activeChannel?._id === c._id ? styles.activeItem : {}) }}
              >
                <Hash size={16} style={{ color: activeChannel?._id === c._id ? '#fff' : 'var(--text-dark)' }} />
                <span style={styles.channelName}>{c.name}</span>
                {unreadCounts[c._id] > 0 && (
                  <span className="badge unread">{unreadCounts[c._id]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Direct Messages */}
        <div style={styles.sidebarSection}>
          <div className="sectionTitleRow" style={styles.sectionTitleRow}>
            <span>DIRECT MESSAGES</span>
            <button onClick={() => setShowDMModal(true)} style={styles.iconButton}>
              <Plus size={16} />
            </button>
          </div>
          <div className="listContainer" style={styles.listContainer}>
            {channels.filter(c => !c.isGroup).map(c => {
              const recipient = getDMRecipient(c);
              if (!recipient) return null;
              const isOnline = onlineUserIds.has(String(recipient._id));
              return (
                <button
                  key={c._id}
                  onClick={() => setActiveChannel(c)}
                  className="channelItem"
                  style={{ ...styles.channelItem, ...(activeChannel?._id === c._id ? styles.activeItem : {}) }}
                >
                  <div className="avatar-wrapper">
                    <img
                      src={recipient.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${recipient.username}`}
                      alt=""
                      className="avatar sm"
                    />
                    <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} style={styles.statusInList}></div>
                  </div>
                  <span style={styles.channelName}>{recipient.username}</span>
                  {unreadCounts[c._id] > 0 && (
                    <span className="badge unread">{unreadCounts[c._id]}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* User profile at bottom */}
        <div className="sidebarFooter" style={styles.sidebarFooter}>
          <button
            style={styles.userProfile}
            onClick={() => setShowProfileModal(true)}
            title="Edit Profile"
          >
            <div className="avatar-wrapper">
              <img
                src={user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`}
                alt=""
                className="avatar"
              />
              <div className={`status-indicator ${currentUserOnline ? 'online' : 'offline'}`} style={styles.statusInList}></div>
            </div>
            <div style={styles.userInfo}>
              <div style={styles.userUsername}>{user.username}</div>
              <div style={styles.userEmail}>{currentUserOnline ? 'Online now' : 'Offline'}</div>
            </div>
          </button>
          <button onClick={onLogout} style={styles.logoutButton} title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* ══ Main Chat Area ════════════════════════════════════════════════ */}
      <div className="chat-area" style={styles.chatArea}>
        {activeChannel ? (
          <>
            {/* Chat header */}
            <div className="chatHeader" style={styles.chatHeader}>
              <div style={styles.headerInfo}>
                <h2 style={styles.headerTitle}>
                  {activeChannel.isGroup ? (
                    <><Hash size={20} style={styles.headerHash} /><span>{activeChannel.name}</span></>
                  ) : (
                    <span>{dmRecipient?.username}</span>
                  )}
                </h2>
                <span className="headerDesc" style={styles.headerDesc}>
                  {activeChannel.isGroup
                    ? activeChannel.description || 'No description set'
                    : (
                      <span className={`active-person-status ${dmRecipientOnline ? 'online' : ''}`}>
                        <span className="active-person-status-dot" />
                        {dmRecipientOnline ? 'online now' : 'offline'}
                      </span>
                    )
                  }
                </span>
              </div>
              <div style={styles.headerActions}>
                <button
                  type="button"
                  className="chat-header-action danger"
                  onClick={handleDeleteChat}
                  title="Delete chat"
                  aria-label="Delete chat"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  type="button"
                  className="chat-header-action"
                  onClick={() => setShowProfileModal(true)}
                  title="Open profile"
                  aria-label="Open profile"
                >
                  <UserRound size={18} />
                </button>
                <button
                  type="button"
                  className="chat-theme-toggle"
                  onClick={onToggleTheme}
                  aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                >
                  {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  style={{ ...styles.actionBtn, color: showDetails ? 'var(--color-primary-light)' : 'var(--text-muted)' }}
                >
                  <Info size={20} />
                </button>
              </div>
            </div>

            {/* Message List */}
            <div className="messageStream" style={styles.messageStream}>
              {reactionNotice && <div className="reaction-notice" role="status">{reactionNotice}</div>}
              <div style={styles.messageContainerInner}>

                {searchedMessages && (
                  <div style={styles.searchBanner}>
                    <div style={styles.searchBannerTxt}>
                      Found {searchedMessages.length} results for "{msgSearchQuery}"
                    </div>
                    <button onClick={clearSearch} style={styles.searchCloseBtn}>Clear</button>
                  </div>
                )}

                {(searchedMessages || messages).map((msg, idx, arr) => {
                  if (hiddenMessageIds.has(msg._id)) return null;
                  const isMe = msg.sender._id === user._id;
                  const isReadByAll = activeChannel.members.length > 1 &&
                    msg.readBy.length >= activeChannel.members.length;
                  const isDelivered = msg.readBy.length > 1;
                  const prevMsg = idx > 0 ? arr[idx - 1] : null;
                  const isCompact = prevMsg &&
                    prevMsg.sender._id === msg.sender._id &&
                    (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) < 5 * 60 * 1000;
                  const isEditing = editingMessageId === msg._id;

                  return (
                    <div
                      key={msg._id}
                      className={`message-row-wrapper ${isMe ? 'message-row-sent' : 'message-row-received'} animate-fade-in ${actionMessageId === msg._id ? 'actions-visible' : ''}`}
                      style={{
                        ...styles.messageRow,
                        ...(isMe ? styles.sentMessageRow : styles.receivedMessageRow),
                        ...(isCompact ? (isMe ? styles.compactSentRow : styles.compactRow) : {}),
                      }}
                      onTouchStart={() => startLongPress(msg._id)}
                      onTouchEnd={cancelLongPress}
                      onTouchMove={cancelLongPress}
                    >
                      {/* Context action toolbar (appears on hover) */}
                      {!msg.isDeleted && (
                        <div className="msg-actions">
                          {QUICK_EMOJIS.map(emoji => (
                            (() => {
                              const reaction = (Array.isArray(msg.reactions) ? msg.reactions : []).find(item => item.emoji === emoji);
                              const users = Array.isArray(reaction?.users) ? reaction.users : [];
                              const reactedByMe = users.some(reactionUser => reactionUserId(reactionUser) === String(user._id));
                              return (
                                <button
                                  key={emoji}
                                  className={`msg-action-btn emoji-action-btn ${reactedByMe ? 'active-reaction' : ''}`}
                                  type="button"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onPointerUp={(event) => event.stopPropagation()}
                                  onTouchStart={(event) => event.stopPropagation()}
                                  onTouchEnd={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    console.log(`[REACTION] ${reactedByMe ? 'Removing' : 'Adding'} ${emoji} on message ${msg._id}`);
                                    handleReact(msg._id, emoji);
                                    setSelectedReaction({ messageId: msg._id, emoji });
                                  }}
                                  title={`${reactedByMe ? 'Remove' : 'Add'} ${emoji} reaction${users.length ? ` (${users.length})` : ''}`}
                                >
                                  <span>{emoji}</span>
                                  {users.length > 0 && <span className="reaction-count">{users.length}</span>}
                                </button>
                              );
                            })()
                          ))}
                          <span className="msg-action-divider" />
                          {isMe ? (
                            <>
                              <button
                                className="msg-action-btn"
                                onClick={(event) => { event.stopPropagation(); startEdit(msg); }}
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                className="msg-action-btn danger"
                                onClick={(event) => { event.stopPropagation(); handleDelete(msg._id); }}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              className="msg-action-btn danger"
                              onClick={(event) => { event.stopPropagation(); handleDeleteForMe(msg._id); }}
                              title="Delete for me"
                              aria-label="Delete message for me"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Avatar (shown on first message in group) */}
                      {!isCompact && (
                        <img
                          src={msg.sender.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.sender.username}`}
                          alt=""
                          className="avatar"
                          style={{ flexShrink: 0 }}
                        />
                      )}

                      <div style={styles.messageContentBlock}>
                        {!isCompact && (
                          <div style={styles.messageMeta}>
                            <span style={styles.senderName}>{msg.sender.username}</span>
                            <span style={styles.messageTime}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}

                        {/* Reply quote */}
                        {msg.replyTo && !msg.replyTo.isDeleted && (
                          <div className="reply-quote">
                            <CornerUpLeft size={12} style={{ color: 'var(--color-primary-light)', flexShrink: 0, marginTop: 2 }} />
                            <div>
                              <div className="reply-quote-name">{msg.replyTo.sender?.username}</div>
                              <div className="reply-quote-text">
                                {msg.replyTo.content || (msg.replyTo.fileUrl ? '📎 Attachment' : '')}
                              </div>
                            </div>
                          </div>
                        )}

                        <div style={styles.messageTextBody}>
                          {msg.isDeleted ? (
                            <div className="deleted-message">
                              <Trash2 size={12} /> This message was deleted
                            </div>
                          ) : isEditing ? (
                            <div className="edit-input-wrap">
                              <textarea
                                className="edit-input"
                                value={editingText}
                                onChange={e => setEditingText(e.target.value)}
                                rows={2}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(msg._id); }
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                              />

                              <div className="edit-actions">
                                <button className="edit-save-btn" onClick={() => submitEdit(msg._id)}>Save</button>
                                <button className="edit-cancel-btn" onClick={cancelEdit}>Cancel</button>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-dark)' }}>Enter to save · Esc to cancel</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              {msg.content && (
                                <p style={styles.msgText}>
                                  {msg.content}
                                  {msg.isEdited && <span className="edited-badge">(edited)</span>}
                                </p>
                              )}

                              {msg.fileUrl && (
                                <div style={styles.attachmentCard} className="glass-card">
                                  {msg.fileType?.startsWith('image/') ? (
                                    <div style={styles.imageAttachment}>
                                      <img
                                        src={msg.fileUrl}
                                        alt={msg.fileName}
                                        style={styles.imagePreview}
                                        onClick={() => window.open(msg.fileUrl)}
                                      />
                                    </div>
                                  ) : (
                                    <div style={styles.fileAttachment}>
                                      <FileText size={24} style={{ color: 'var(--color-primary)' }} />
                                      <div style={styles.attachmentMeta}>
                                        <div style={styles.attachmentName}>{msg.fileName}</div>
                                        <div style={styles.attachmentSize}>Document Attachment</div>
                                      </div>
                                      <a
                                        href={msg.fileUrl}
                                        download={msg.fileName}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={styles.attachDl}
                                      >
                                        <Download size={18} />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {!msg.isDeleted && Array.isArray(msg.reactions) && msg.reactions.length > 0 && (
                          <div className="message-reaction-summary" aria-label="Message reactions">
                            {msg.reactions.map(reaction => (
                              <div key={reaction.emoji} className="message-reaction-summary-wrap">
                                <button
                                  type="button"
                                  className={`message-reaction-summary-item ${selectedReaction?.messageId === msg._id && selectedReaction.emoji === reaction.emoji ? 'selected-reaction' : ''}`}
                                  onClick={() => setSelectedReaction(current => (
                                    current?.messageId === msg._id && current.emoji === reaction.emoji
                                      ? null
                                      : { messageId: msg._id, emoji: reaction.emoji }
                                  ))}
                                  title="View people who reacted"
                                >
                                  {reaction.emoji} {Array.isArray(reaction.users) ? reaction.users.length : 0}
                                </button>
                                {selectedReaction?.messageId === msg._id && selectedReaction.emoji === reaction.emoji && (
                                  <div className="reaction-user-list">
                                    {(Array.isArray(reaction.users) ? reaction.users : []).map(reactionUser => (
                                      <div key={reactionUserId(reactionUser)} className="reaction-user-item">
                                        <img
                                          src={reactionUser.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${reactionUser.username || reactionUserId(reactionUser)}`}
                                          alt=""
                                          className="avatar xs"
                                        />
                                        <span>{reactionUser.username || 'User'}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Read receipts */}
                        {isMe && !isCompact && !msg.isDeleted && (
                          <div style={styles.receiptContainer}>
                            {isReadByAll ? (
                              <CheckCheck size={14} style={{ color: 'var(--color-success)' }} />
                            ) : isDelivered ? (
                              <CheckCheck size={14} style={{ color: 'var(--text-dark)' }} />
                            ) : (
                              <Check size={14} style={{ color: 'var(--text-dark)' }} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="input-area" style={styles.inputArea}>
              {/* Typing indicators */}
              {typingNames.length > 0 && (
                <div style={styles.typingIndicator}>
                  <div className="animate-pulse-soft" style={styles.typingDot}></div>
                  <span>{typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...</span>
                </div>
              )}

              {/* Reply strip */}
              {replyingTo && (
                <div className="reply-strip">
                  <CornerUpLeft size={14} style={{ color: 'var(--color-primary-light)', marginTop: 2, flexShrink: 0 }} />
                  <div className="reply-strip-content">
                    <div className="reply-strip-name">Replying to {replyingTo.sender.username}</div>
                    <div className="reply-strip-text">
                      {replyingTo.content || (replyingTo.fileUrl ? '📎 Attachment' : '')}
                    </div>
                  </div>
                  <button className="reply-strip-close" onClick={() => setReplyingTo(null)}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Emoji picker */}
              <div style={{ position: 'relative' }}>
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}
              </div>

              <form onSubmit={handleSendMessage} style={styles.inputForm} className="inputForm glass-panel">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inputButton"
                  style={styles.inputButton}
                  disabled={uploadingFile}
                >
                  <Paperclip size={20} className={uploadingFile ? 'animate-pulse-soft' : ''} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(p => !p)}
                  className="inputButton"
                  style={{ ...styles.inputButton, color: showEmojiPicker ? 'var(--color-primary-light)' : 'var(--text-muted)' }}
                >
                  <Smile size={20} />
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  placeholder={`Message ${activeChannel.isGroup ? '#' + activeChannel.name : getDMRecipient(activeChannel)?.username || ''}`}
                  value={messageText}
                  onChange={handleMessageChange}
                  style={{ ...styles.chatInput, color: 'var(--text-main)', background: 'transparent' }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e); }}
                />

                <button type="submit" className="inputButton" style={styles.inputButton} disabled={!messageText.trim() && !selectedFile}>
                  <Send size={20} style={{ color: 'var(--color-primary-light)' }} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div style={styles.noActiveChannel}>
            <MessageSquare size={64} style={{ color: 'var(--text-dark)', marginBottom: 16 }} />
            <h2>Welcome to AetherChat</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
              Select a channel or direct message from the sidebar to begin.
            </p>
          </div>
        )}
      </div>

      {/* ══ Details Drawer ════════════════════════════════════════════════ */}
      {showDetails && activeChannel && (
        <div className="details-drawer glass-panel" style={styles.detailsDrawer}>
          <div style={styles.drawerHeader}>
            <h3 style={styles.drawerTitle}>Details</h3>
            <button onClick={() => setShowDetails(false)} style={styles.drawerClose}><X size={18} /></button>
          </div>

          <div style={styles.drawerContent}>
            {/* Search */}
            <div style={styles.drawerSection}>
              <h4 style={styles.sectionHeader}>Search Messages</h4>
              <form onSubmit={handleMessageSearch} style={styles.searchForm}>
                <input
                  type="text"
                  placeholder="Find text..."
                  value={msgSearchQuery}
                  onChange={e => setMsgSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
                <button type="submit" style={styles.searchSubmit}><Search size={16} /></button>
              </form>
            </div>

            {/* About */}
            <div style={styles.drawerSection}>
              <h4 style={styles.sectionHeader}>About</h4>
              <div style={styles.aboutCard} className="glass-card">
                <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>Name</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {activeChannel.isGroup ? `# ${activeChannel.name}` : `DM session`}
                </div>
                {activeChannel.isGroup && (
                  <>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem', marginTop: 12 }}>Description</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      {activeChannel.description || 'No description provided'}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Members */}
            <div style={styles.drawerSection}>
              <h4 style={styles.sectionHeader}>Members ({activeChannel.members.length})</h4>
              <div style={styles.membersList}>
                {activeChannel.members.map(member => {
                  const isOnline = isUserOnline(member._id);
                  return (
                    <div key={member._id} style={styles.memberItem}>
                      <div className="avatar-wrapper">
                        <img
                          src={member.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${member.username}`}
                          alt=""
                          className="avatar sm"
                        />
                        <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} style={styles.statusInList}></div>
                      </div>
                      <span style={{ fontSize: '0.85rem' }}>{member.username}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Shared Files */}
            <div style={styles.drawerSection}>
              <h4 style={styles.sectionHeader}>Shared Files</h4>
              <div style={styles.sharedFiles}>
                {messages.filter(m => m.fileUrl && !m.isDeleted).length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dark)', textAlign: 'center', padding: '12px 0' }}>
                    No files shared yet
                  </div>
                ) : (
                  messages.filter(m => m.fileUrl && !m.isDeleted).map(m => (
                    <a
                      key={m._id}
                      href={m.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.fileLink}
                      className="glass-card"
                    >
                      <Paperclip size={14} style={{ color: 'var(--color-primary-light)' }} />
                      <span style={styles.fileLinkName}>{m.fileName}</span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Create Channel ═════════════════════════════════════════ */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3>Create Channel</h3>
              <button onClick={() => setShowCreateModal(false)} style={styles.modalClose}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateChannel} style={styles.modalForm}>
              <div style={styles.modalGroup}>
                <label style={styles.modalLabel}>Channel Name</label>
                <input
                  type="text"
                  placeholder="e.g. project-x"
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  style={styles.modalInput}
                  required
                />
              </div>
              <div style={styles.modalGroup}>
                <label style={styles.modalLabel}>Description</label>
                <textarea
                  placeholder="What is this channel about?"
                  value={newChannelDesc}
                  onChange={e => setNewChannelDesc(e.target.value)}
                  style={{ ...styles.modalInput, height: 80, resize: 'none' }}
                />
              </div>
              <div style={styles.modalGroup}>
                <label style={styles.modalLabel}>Add Members</label>
                <div style={styles.memberSelectorList}>
                  {allUsers.map(u => (
                    <label key={u._id} style={styles.selectMemberRow}>
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(u._id)}
                        onChange={() => toggleMemberSelection(u._id)}
                        style={styles.selectCheckbox}
                      />
                      <span>{u.username}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" style={styles.modalSubmit}>Create Channel</button>
            </form>
          </div>
        </div>
      )}

      {/* ══ Modal: New DM ══════════════════════════════════════════════════ */}
      {showDMModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3>New Conversation</h3>
              <button onClick={() => setShowDMModal(false)} style={styles.modalClose}><X size={18} /></button>
            </div>
            <div style={styles.usersListModal}>
              {allUsers.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>
                  No other active users on the grid
                </div>
              ) : (
                allUsers.map(u => {
                  const isOnline = isUserOnline(u._id);
                  return (
                    <button
                      key={u._id}
                      onClick={() => handleStartDM(u._id)}
                      style={styles.userDMRow}
                      className="glass-card"
                    >
                      <div className="avatar-wrapper">
                        <img
                          src={u.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`}
                          alt=""
                          className="avatar"
                        />
                        <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} style={styles.statusInList}></div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.username}</div>
                        <div style={{ fontSize: '0.75rem', color: isOnline ? 'var(--color-success)' : 'var(--text-muted)' }}>
                          {isOnline ? '● online' : '○ offline'}
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto', color: 'var(--text-dark)', fontSize: '1rem' }}>›</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Profile Editor ══════════════════════════════════════════ */}
      {showProfileModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={{ ...styles.modal, maxWidth: '400px' }}>
            <div style={styles.modalHeader}>
              <h3>Edit Profile</h3>
              <button onClick={() => setShowProfileModal(false)} style={styles.modalClose}><X size={18} /></button>
            </div>

            <div className="profile-avatar-edit">
              <img
                src={profileAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${profileUsername}`}
                alt=""
                className="avatar lg"
              />
              <div className={`active-person-status ${currentUserOnline ? 'online' : ''}`}>
                <span className="active-person-status-dot" />
                {currentUserOnline ? 'online now' : 'offline'}
              </div>
              <input
                ref={profileFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfileAvatarChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="profile-avatar-edit-button"
                onClick={() => profileFileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? 'Uploading...' : 'Change profile picture'}
              </button>
            </div>

            <div style={styles.modalForm}>
              <div style={styles.modalGroup}>
                <label style={styles.modalLabel} className="profile-section-label">Username</label>
                <input
                  type="text"
                  value={profileUsername}
                  onChange={e => setProfileUsername(e.target.value)}
                  style={styles.modalInput}
                  placeholder="Your display name"
                />
              </div>

              <div style={styles.modalGroup}>
                <label style={styles.modalLabel} className="profile-section-label">Avatar URL</label>
                <input
                  type="text"
                  value={profileAvatar}
                  onChange={e => setProfileAvatar(e.target.value)}
                  style={styles.modalInput}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <button
                onClick={handleProfileSave}
                style={{ ...styles.modalSubmit, opacity: profileSaving ? 0.7 : 1 }}
                disabled={profileSaving}
              >
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = {
  sidebar: {
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border-glass)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  sidebarHeader: {
    padding: '24px 20px',
    borderBottom: '1px solid var(--border-glass-light)',
  },
  brandContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  brandLogo: {
    width: '32px',
    height: '32px',
    borderRadius: '3px',
    background: 'var(--grad-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '1.2rem',
    color: '#fff',
  },
  brandTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--text-main)',
  },
  brandSub: {
    fontSize: '0.7rem',
    color: 'var(--color-primary-light)',
    letterSpacing: '0.5px',
  },
  sidebarSection: { padding: '20px 10px' },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 10px 8px 10px',
    fontSize: '0.7rem',
    fontWeight: '700',
    color: 'var(--text-dark)',
    letterSpacing: '1px',
  },
  iconButton: {
    color: 'var(--text-dark)',
    padding: '2px',
    borderRadius: '4px',
    transition: 'var(--transition-fast)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: { display: 'flex', flexDirection: 'column', gap: '4px' },
  channelItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: '3px',
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
    fontWeight: 500,
    transition: 'var(--transition-fast)',
    width: '100%',
    textAlign: 'left',
  },
  activeItem: {
    background: 'var(--grad-primary)',
    color: '#fff',
    boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.18), -4px -4px 10px rgba(255, 255, 255, 0.4)',
  },
  channelName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusInList: { position: 'absolute', bottom: '-2px', right: '-2px' },
  sidebarFooter: {
    marginTop: 'auto',
    padding: '16px 20px',
    borderTop: '1px solid var(--border-glass-light)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(0,0,0,0.1)',
  },
  userProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    textAlign: 'left',
    flex: 1,
    borderRadius: '3px',
    padding: '4px 8px 4px 4px',
    cursor: 'pointer',
    transition: 'var(--transition-fast)',
  },
  userInfo: { display: 'flex', flexDirection: 'column' },
  userUsername: { fontSize: '0.85rem', fontWeight: 600, color: '#fff' },
  userEmail: { fontSize: '0.68rem', color: 'var(--color-primary-light)' },
  logoutButton: {
    color: 'var(--text-dark)',
    padding: '6px',
    borderRadius: '3px',
    transition: 'var(--transition-fast)',
  },

  // Chat area
  chatArea: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-main)',
    height: '100vh',
    position: 'relative',
  },
  chatHeader: {
    padding: '18px 24px',
    borderBottom: '1px solid var(--border-glass)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--bg-sidebar)',
  },
  headerInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  headerTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: 'var(--text-main)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  headerHash: { color: 'var(--text-dark)' },
  headerDesc: { fontSize: '0.75rem', color: 'var(--text-muted)' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  actionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '3px',
    transition: 'var(--transition-fast)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageStream: { flex: 1, overflowY: 'auto', padding: '24px' },
  messageContainerInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    maxWidth: '85%',
  },
  sentMessageRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  receivedMessageRow: {
    alignSelf: 'flex-start',
  },
  compactRow: {
    marginTop: '-12px',
    paddingLeft: '54px',
  },
  compactSentRow: {
    marginTop: '-12px',
    paddingRight: '54px',
  },
  messageContentBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '100%',
  },
  messageMeta: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  senderName: { fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' },
  messageTime: { fontSize: '0.7rem', color: 'var(--text-dark)' },
  messageTextBody: { display: 'flex', flexDirection: 'column', gap: '6px' },
  msgText: {
    fontSize: '0.9rem',
    color: 'var(--text-main)',
    lineHeight: '1.45',
    wordBreak: 'break-word',
  },
  attachmentCard: {
    maxWidth: '400px',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '4px',
  },
  imageAttachment: { display: 'flex' },
  imagePreview: {
    width: '100%',
    maxHeight: '220px',
    objectFit: 'cover',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  fileAttachment: {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: 'rgba(255,255,255,0.01)',
  },
  attachmentMeta: { flex: 1, overflow: 'hidden' },
  attachmentName: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--text-main)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  attachmentSize: { fontSize: '0.7rem', color: 'var(--text-dark)' },
  attachDl: {
    color: 'var(--text-muted)',
    padding: '6px',
    borderRadius: '3px',
    transition: 'var(--transition-fast)',
    display: 'flex',
  },
  receiptContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '2px',
  },
  inputArea: {
    padding: '0 24px 24px 24px',
    position: 'relative',
  },
  typingIndicator: {
    position: 'absolute',
    top: '-20px',
    left: '28px',
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  typingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary-light)',
  },
  inputForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    borderRadius: '3px',
  },
  chatInput: {
    flex: 1,
    background: 'none',
    color: 'var(--text-main)',
    fontSize: '0.9rem',
    padding: '8px 0',
  },
  inputButton: {
    color: 'var(--text-muted)',
    padding: '6px',
    borderRadius: '8px',
    transition: 'var(--transition-fast)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noActiveChannel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '40px',
  },

  // Details drawer
  detailsDrawer: {
    borderLeft: '1px solid var(--border-glass)',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    zIndex: 10,
    background: 'var(--bg-sidebar)',
  },
  drawerHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border-glass)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' },
  drawerClose: { color: 'var(--text-muted)', padding: '4px', borderRadius: '6px', display: 'flex' },
  drawerContent: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' },
  drawerSection: { display: 'flex', flexDirection: 'column', gap: '10px' },
  sectionHeader: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--text-dark)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  aboutCard: { padding: '14px', borderRadius: '10px' },
  membersList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  memberItem: { display: 'flex', alignItems: 'center', gap: '12px' },
  sharedFiles: { display: 'flex', flexDirection: 'column', gap: '8px' },
  fileLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '3px',
    textDecoration: 'none',
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
    transition: 'var(--transition-fast)',
  },
  fileLinkName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  searchForm: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-glass)',
    borderRadius: '3px',
    padding: '4px 10px',
  },
  searchInput: { flex: 1, background: 'none', color: 'var(--text-main)', fontSize: '0.8rem', padding: '6px 0' },
  searchSubmit: { color: 'var(--text-muted)', display: 'flex' },
  searchBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: 'rgba(23, 23, 23, 0.06)',
    border: '1px solid rgba(23, 23, 23, 0.14)',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  searchBannerTxt: { fontSize: '0.8rem', color: 'var(--color-primary-light)', fontWeight: 500 },
  searchCloseBtn: { fontSize: '0.75rem', fontWeight: 600, color: '#fff', textDecoration: 'underline' },

  // Modals
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0,
    width: '100vw', height: '100vh',
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modal: {
    width: '100%',
    maxWidth: '440px',
    borderRadius: '4px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: 'var(--text-main)',
  },
  modalClose: { color: 'var(--text-muted)', padding: '4px', display: 'flex' },
  modalForm: { display: 'flex', flexDirection: 'column', gap: '16px' },
  modalGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  modalLabel: { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--border-glass)',
    borderRadius: '3px',
    padding: '10px 12px',
    fontSize: '0.85rem',
    color: 'var(--text-main)',
  },
  memberSelectorList: {
    maxHeight: '120px',
    overflowY: 'auto',
    border: '1px solid var(--border-glass)',
    borderRadius: '3px',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  selectMemberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    padding: '6px',
    cursor: 'pointer',
    borderRadius: '4px',
  },
  selectCheckbox: { accentColor: 'var(--color-primary)' },
  modalSubmit: {
    background: 'var(--grad-primary)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.9rem',
    padding: '12px',
    borderRadius: '10px',
    marginTop: '8px',
    boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.18), -4px -4px 10px rgba(255, 255, 255, 0.4)',
    cursor: 'pointer',
  },
  usersListModal: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  userDMRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '3px',
    color: 'var(--text-main)',
    transition: 'var(--transition-fast)',
    width: '100%',
    cursor: 'pointer',
  },
};

export default Dashboard;
