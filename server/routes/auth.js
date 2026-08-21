import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const generateToken = (id) => {
  console.log(`[AUTH] Generating token for user ID ${id}`);
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret_key_123', {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
  const username = req.body.username?.trim();
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password;
  console.log(`[AUTH] Registration attempt: username=${username || '(missing)'}, email=${email || '(missing)'}`);

  try {
    if (!username || !email || !password) {
      console.warn('[AUTH] Registration rejected: missing required fields');
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      console.warn(`[AUTH] Registration rejected: account already exists for ${email}`);
      return res.status(400).json({ message: 'User already exists with this email or username' });
    }

    // Set a default colored avatar or random avatar from a pool
    const defaultAvatars = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'
    ];
    const randomAvatar = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];

    const user = await User.create({
      username,
      email,
      password: await bcrypt.hash(password, 10),
      avatarUrl: randomAvatar,
      status: 'offline',
    });

    if (user) {
      console.log(`[AUTH] Registration successful: ${user.username} (${user._id})`);
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        status: user.status,
        token: generateToken(user._id),
      });
    } else {
      console.warn('[AUTH] Registration failed: user was not created');
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error(`[AUTH] Registration error for ${email || '(unknown email)'}`, error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
  const loginValue = req.body.email?.trim();
  const email = loginValue?.toLowerCase();
  const password = req.body.password;
  console.log(`[AUTH] Login attempt: identifier=${loginValue || '(missing)'}`);

  try {
    if (!email || !password) {
      console.warn('[AUTH] Login rejected: missing required fields');
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Email can be email or username
    const user = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: loginValue }
      ]
    });

    if (user && (await user.matchPassword(password))) {
      console.log(`[AUTH] Login successful: ${user.username} (${user._id})`);
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        status: user.status,
        token: generateToken(user._id),
      });
    } else {
      console.warn(`[AUTH] Login rejected: invalid credentials for ${loginValue || '(missing identifier)'}`);
      res.status(401).json({ message: 'Invalid email/username or password' });
    }
  } catch (error) {
    console.error(`[AUTH] Login error for ${loginValue || '(unknown identifier)'}`, error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  console.log(`[AUTH] Profile lookup requested by ${req.user.username} (${req.user._id})`);
  try {
    const user = await User.findById(req.user._id).select('-password');
    console.log(`[AUTH] Profile lookup successful for ${req.user.username}`);
    res.json(user);
  } catch (error) {
    console.error(`[AUTH] Profile lookup failed for ${req.user._id}`, error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all users (except current user) for DM listing
// @route   GET /api/auth/users
// @access  Private
router.get('/users', protect, async (req, res) => {
  console.log(`[AUTH] User directory requested by ${req.user.username} (${req.user._id})`);
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select('-password');
    console.log(`[AUTH] User directory returned ${users.length} users to ${req.user.username}`);
    res.json(users);
  } catch (error) {
    console.error(`[AUTH] User directory lookup failed for ${req.user._id}`, error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update user profile (username, avatarUrl, status)
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  console.log(`[AUTH] Profile update requested by ${req.user.username} (${req.user._id})`);
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      if (req.body.username) user.username = req.body.username;
      if (req.body.email) user.email = req.body.email;
      if (req.body.avatarUrl !== undefined) user.avatarUrl = req.body.avatarUrl;
      if (req.body.status && ['online', 'offline'].includes(req.body.status)) {
        user.status = req.body.status;
      }
      if (req.body.password) user.password = req.body.password;

      const updatedUser = await user.save();
      console.log(`[AUTH] Profile update successful for ${updatedUser.username} (${updatedUser._id})`);
      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        avatarUrl: updatedUser.avatarUrl,
        status: updatedUser.status,
        token: generateToken(updatedUser._id),
      });
    } else {
      console.warn(`[AUTH] Profile update rejected: user ${req.user._id} not found`);
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error(`[AUTH] Profile update failed for ${req.user._id}`, error.message);
    res.status(500).json({ message: error.message });
  }
});

export default router;
