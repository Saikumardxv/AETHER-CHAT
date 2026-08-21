import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;
  const route = `${req.method} ${req.originalUrl}`;
  console.log(`[AUTH] Checking authorization: ${route}`);

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      console.log(`[AUTH] Bearer token received: ${route}`);

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_123');
      console.log(`[AUTH] Token verified for user ID ${decoded.id}: ${route}`);

      // Get user from token and attach to request
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        console.warn(`[AUTH] Authorization denied: user not found for ${route}`);
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      console.log(`[AUTH] Authorization granted for ${req.user.username} (${req.user._id}): ${route}`);
      next();
    } catch (error) {
      console.error(`[AUTH] Token verification failed: ${route}`, error.message);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    console.warn(`[AUTH] Authorization denied: no token for ${route}`);
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};
