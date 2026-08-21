/**
 * Notification sound utility using Web Audio API.
 * No external audio files needed — generates tones via oscillator.
 */

let audioCtx = null;

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
};

/**
 * Play a subtle 2-tone notification ping.
 * @param {number} volume - 0.0 to 1.0, default 0.25
 */
export const playNotificationSound = (volume = 0.25) => {
  try {
    const ctx = getAudioContext();

    const playTone = (frequency, startTime, duration) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);

      // Envelope: quick attack, smooth decay
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Two-tone ping: C5 then E5
    playTone(523.25, now, 0.18);       // C5
    playTone(659.25, now + 0.12, 0.2); // E5
  } catch (err) {
    // Silently fail if audio context is not available
    console.warn('Notification sound unavailable:', err.message);
  }
};

/**
 * Play a mention notification (more prominent — three notes).
 */
export const playMentionSound = (volume = 0.3) => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const playTone = (frequency, startTime, duration) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    // C5 → E5 → G5 arpeggio
    playTone(523.25, now, 0.15);
    playTone(659.25, now + 0.1, 0.15);
    playTone(783.99, now + 0.2, 0.25);
  } catch (err) {
    console.warn('Mention sound unavailable:', err.message);
  }
};
