import React, { useRef, useEffect } from 'react';

const EMOJI_CATEGORIES = {
  '😊 Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
  '👍 Gestures': ['👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤌','🤏','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄'],
  '❤️ Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☯️','✡️','🔯'],
  '🎉 Celebration': ['🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🥳','🪅','🎆','🎇','🧨','✨','🎋','🎍','🎎','🎐','🎑','🧧','🎠','🎡','🎢'],
  '🔥 Popular': ['🔥','💯','⭐','🌟','💫','✨','⚡','💥','🎯','💎','👑','🚀','🌈','🦄','🍕','🍔','☕','🍺','🎮','🎵','🎶','🎸','🎹','🎺','🎻','🥁','📱','💻','🖥️','⌨️','🖱️','💡','🔑','🗝️','🔒','🔓','🔔','📢','📣','📯'],
};

const EmojiPicker = ({ onSelect, onClose }) => {
  const pickerRef = useRef(null);
  const [activeCategory, setActiveCategory] = React.useState(Object.keys(EMOJI_CATEGORIES)[0]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={pickerRef} className="emoji-picker glass-panel">
      {/* Category tabs */}
      <div className="emoji-categories">
        {Object.keys(EMOJI_CATEGORIES).map(cat => (
          <button
            key={cat}
            type="button"
            className={`emoji-cat-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
            title={cat}
          >
            {cat.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="emoji-grid">
        {EMOJI_CATEGORIES[activeCategory].map(emoji => (
          <button
            key={emoji}
            type="button"
            className="emoji-btn"
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

export default EmojiPicker;
