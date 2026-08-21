import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

const App = () => {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  // Load user from localStorage on initial render
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');
    console.log(`[AUTH] Restoring saved session: ${savedUser && savedToken ? 'session found' : 'no session found'}`);
    if (savedUser && savedToken) {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser && typeof parsedUser === 'object' && parsedUser._id && parsedUser.username) {
          setUser(parsedUser);
        } else {
          throw new Error('Saved session is incomplete');
        }
      } catch (err) {
        console.error('[AUTH] Failed to restore saved session:', err.message);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  // Initialize socket when user login state changes
  useEffect(() => {
    if (!user) {
      console.log('[AUTH] No active user; socket connection skipped');
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Connect to WebSocket server directly
    // Using environment port or local dev server address (5000)
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (
      window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : window.location.origin
    );

    console.log(`Connecting socket to: ${socketUrl}`);
    const token = localStorage.getItem('token');
    
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log(`[AUTH] Socket.IO connection established for ${user.username}`);
    });

    newSocket.on('connect_error', (err) => {
      console.error('[AUTH] Socket.IO authorization error:', err.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  const handleAuthSuccess = (userData) => {
    console.log(`[AUTH] Session started for ${userData.username}`);
    setUser(userData);
  };

  const handleLogout = () => {
    console.log(`[AUTH] Session ended for ${user?.username || 'unknown user'}`);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div className="animate-pulse-soft" style={styles.loadingPulse}>
          AETHERCHAT
        </div>
      </div>
    );
  }

  return (
    <div className={`app-theme app-theme-${theme}`}>
      {user ? (
        <Dashboard user={user} socket={socket} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <Auth onAuthSuccess={handleAuthSuccess} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </div>
  );
};

const styles = {
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'var(--bg-main)',
  },
  loadingPulse: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '2rem',
    fontWeight: 800,
    letterSpacing: '3px',
    color: 'var(--text-main)',
    textShadow: '0 1px 0 rgba(255, 255, 255, 0.8)',
  }
};

export default App;
