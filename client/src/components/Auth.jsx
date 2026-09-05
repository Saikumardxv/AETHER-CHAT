import React, { useState } from 'react';
import axios from 'axios';
import { Mail, Lock, User, LogIn, UserPlus, Eye, EyeOff, Loader2, Sun, Moon, MailCheck } from 'lucide-react';

const Auth = ({ onAuthSuccess, theme, onToggleTheme }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationSent, setRegistrationSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log(`[AUTH] ${isLogin ? 'Login' : 'Registration'} form submitted`);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin 
        ? { email, password } 
        : { username, email, password };

      const response = await axios.post(endpoint, payload);
      console.log(`[AUTH] ${isLogin ? 'Login' : 'Registration'} request succeeded for ${response.data.username}`);

      if (!isLogin) {
        setDevelopmentCode(response.data.verificationCode || '');
        setError('');
        setRegistrationSent(true);
        return;
      }
      
      // Store token and user details
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data));
      
      onAuthSuccess(response.data);
    } catch (err) {
      console.error(`[AUTH] ${isLogin ? 'Login' : 'Registration'} request failed:`, err.response?.data?.message || err.message);
      setError(err.response?.data?.message || (err.request
        ? 'The chat server is unavailable. Start the server and try again.'
        : 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post('/api/auth/verify-email', { email, code: verificationCode });
      setRegistrationSent(false);
      setIsLogin(true);
      setPassword('');
      setVerificationCode('');
      setDevelopmentCode('');
    } catch (err) {
      setError(err.response?.data?.message || 'Email verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`auth-screen auth-screen-${theme}`} style={styles.container}>
      <div className="auth-orb auth-orb-one"></div>
      <div className="auth-orb auth-orb-two"></div>
      <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      
      <div className="glass-panel" style={styles.card}>
        {registrationSent ? (
          <div className="registration-success" role="status">
            <div className="registration-success-icon">
              <MailCheck size={30} />
            </div>
            <h2 style={styles.successTitle}>Check your email</h2>
            <p style={styles.successText}>
              Confirm the email address <strong>{email}</strong> before signing in.
            </p>
            {developmentCode && (
              <p style={styles.verificationHint}>Development verification code: <strong>{developmentCode}</strong></p>
            )}
            <form onSubmit={handleVerifyEmail} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email verification code</label>
                <div style={styles.inputWrapper}>
                  <MailCheck size={18} style={styles.icon} />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    style={styles.input}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="submit-button" disabled={loading} style={styles.submitButton}>
                {loading ? <Loader2 size={18} className="animate-pulse-soft" /> : <>Confirm email <MailCheck size={17} /></>}
              </button>
            </form>
            <button type="button" className="success-action" onClick={() => { setRegistrationSent(false); setIsLogin(false); setError(''); }}>
              Back to registration
              <UserPlus size={17} />
            </button>
          </div>
        ) : (
          <>
        <div style={styles.header}>
          <h1 style={styles.title}>
            <span style={styles.titleAether}>AETHER</span><span style={styles.accent}>CHAT</span>
          </h1>
          <p style={styles.subtitle}>
            {isLogin 
              ? 'Enter your credentials to enter the stream' 
              : 'Create your digital identity to begin'}
          </p>
        </div>

        {error && (
          <div style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {!isLogin && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Username</label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.icon} />
                <input
                  type="text"
                  placeholder="cyber_wanderer"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>{isLogin ? 'Email or Username' : 'Email Address'}</label>
            <div style={styles.inputWrapper}>
              <Mail size={18} style={styles.icon} />
              <input
                type={isLogin ? "text" : "email"}
                placeholder={isLogin ? "wanderer@aether.net or username" : "wanderer@aether.net"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                required
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <Lock size={18} style={styles.icon} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.passwordToggle}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
            style={{
              ...styles.submitButton,
              opacity: loading ? 0.8 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? (
              <Loader2 size={18} className="animate-pulse-soft" />
            ) : isLogin ? (
              <>
                <span>Enter</span>
                <LogIn size={18} />
              </>
            ) : (
              <>
                <span>Register Identity</span>
                <UserPlus size={18} />
              </>
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            {isLogin ? "New to the grid?" : "Already registered?"}{' '}
            <button
              onClick={() => {
                console.log(`[AUTH] Switching form to ${isLogin ? 'registration' : 'login'}`);
                setIsLogin(!isLogin);
                setError('');
              }}
              style={styles.switchButton}
            >
              {isLogin ? 'Initialize Account' : 'Authenticate'}
            </button>
          </p>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    minHeight: '100vh',
    padding: '24px 16px',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-main)',
  },
  glowBlob1: {
    display: 'none',
    top: '15%',
    left: '20%',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, rgba(0,0,0,0) 70%)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  glowBlob2: {
    display: 'none',
    bottom: '15%',
    right: '20%',
    width: '400px',
    height: '400px',
    borderRadius: '0',
    background: 'radial-gradient(circle, rgba(120, 120, 120, 0.12) 0%, rgba(0,0,0,0) 70%)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    padding: '40px',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: '4px',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    animation: 'fadeIn 0.5s ease-out forwards',
  },
  header: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '2.5rem',
    fontWeight: 800,
    letterSpacing: '3px',
    color: 'var(--text-main)',
    textShadow: 'none',
    animation: 'brandReveal 0.9s ease-out both, brandGlow 4s ease-in-out 1s infinite',
    lineHeight: 1.1,
  },
  titleAether: {
    background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 45%, #22d3ee 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    filter: 'drop-shadow(0 0 18px rgba(168,85,247,0.45))',
  },
  accent: {
    background: 'linear-gradient(135deg, #f97316 0%, #fbbf24 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    filter: 'drop-shadow(0 0 14px rgba(249,115,22,0.5))',
    marginLeft: '3px',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '0.9rem',
    fontWeight: 400,
  },
  successTitle: {
    color: 'var(--text-main)',
    fontSize: '1.35rem',
    fontWeight: 700,
    textAlign: 'center',
  },
  successText: {
    color: 'var(--text-muted)',
    fontSize: '0.88rem',
    lineHeight: 1.6,
    textAlign: 'center',
  },
  verificationHint: {
    color: 'var(--color-primary-light)',
    fontSize: '0.78rem',
    lineHeight: 1.5,
    textAlign: 'center',
    margin: 0,
  },
  errorContainer: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '3px',
    padding: '12px',
  },
  errorText: {
    color: 'var(--color-danger)',
    fontSize: '0.85rem',
    textAlign: 'center',
    fontWeight: 500,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--text-muted)',
    paddingLeft: '4px',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  icon: {
    position: 'absolute',
    left: '16px',
    color: 'var(--text-dark)',
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-glass)',
    borderRadius: '3px',
    padding: '14px 16px 14px 48px',
    fontSize: '0.95rem',
    color: 'var(--text-main)',
    transition: 'var(--transition-smooth)',
    '&:focus': {
      borderColor: 'var(--color-primary)',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      boxShadow: 'none',
    }
  },
  passwordToggle: {
    position: 'absolute',
    right: '16px',
    color: 'var(--text-dark)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'var(--transition-fast)',
    '&:hover': {
      color: 'var(--text-muted)'
    }
  },
  submitButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    background: 'var(--grad-primary)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '1rem',
    padding: '14px',
    borderRadius: '3px',
    marginTop: '10px',
    transition: 'var(--transition-smooth)',
    boxShadow: 'none',
    '&:hover': {
      background: 'var(--grad-primary-hover)',
      transform: 'none',
      boxShadow: 'none',
    }
  },
  footer: {
    textAlign: 'center',
    marginTop: '10px',
  },
  footerText: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  switchButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-primary-light)',
    fontWeight: 600,
    padding: 0,
    marginLeft: '4px',
    fontSize: '0.85rem',
    textDecoration: 'underline',
    transition: 'var(--transition-fast)',
    '&:hover': {
      color: 'var(--color-secondary)',
    }
  }
};

export default Auth;
