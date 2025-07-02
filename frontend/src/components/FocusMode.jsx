import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudRain, Coffee, BookOpen, Target } from 'lucide-react';

const FocusMode = ({ onDismiss }) => {
  const [raindrops, setRaindrops] = useState([]);
  const [motivationalMessage, setMotivationalMessage] = useState('');

  const motivationalMessages = [
    "🌱 Take a deep breath and refocus on your learning journey",
    "📚 Every page you read brings you closer to your goals",
    "🌿 Learning is like growing a forest - one tree at a time",
    "🎯 Your focus is your superpower - use it wisely",
    "☕ Sometimes a short break helps the mind grow stronger",
    "🌸 Knowledge blooms when attention is nurtured",
    "🌳 Strong roots of understanding come from focused study"
  ];

  useEffect(() => {
    // Select random motivational message
    const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
    setMotivationalMessage(randomMessage);

    // Generate raindrops
    const drops = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      size: 0.5 + Math.random() * 1
    }));
    setRaindrops(drops);
  }, []);

  const handleDismiss = (e) => {
    // Only dismiss if clicking the overlay, not the modal content
    if (e.target.classList.contains('focus-overlay')) {
      onDismiss();
    }
  };

  const handleKeyPress = (e) => {
    onDismiss();
  };

  useEffect(() => {
    // Listen for any key press to dismiss
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        className="focus-overlay"
        onClick={handleDismiss}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Animated rain effect */}
        <div className="rain-container">
          {raindrops.map((drop) => (
            <motion.div
              key={drop.id}
              className="raindrop"
              style={{
                left: `${drop.left}%`,
                width: `${drop.size}px`,
                height: `${drop.size * 20}px`,
              }}
              initial={{ y: -20, opacity: 0 }}
              animate={{ 
                y: window.innerHeight + 20, 
                opacity: [0, 0.7, 0.7, 0] 
              }}
              transition={{
                duration: drop.duration,
                delay: drop.delay,
                repeat: Infinity,
                ease: 'linear'
              }}
            />
          ))}
        </div>

        {/* Floating leaves for forest theme */}
        <div className="floating-leaves">
          {Array.from({ length: 8 }, (_, i) => (
            <motion.div
              key={`leaf-${i}`}
              className={`leaf leaf-${(i % 3) + 1}`}
              initial={{ 
                x: -100, 
                y: Math.random() * window.innerHeight,
                rotate: 0 
              }}
              animate={{ 
                x: window.innerWidth + 100,
                y: Math.random() * window.innerHeight,
                rotate: 360
              }}
              transition={{
                duration: 15 + Math.random() * 10,
                delay: i * 2,
                repeat: Infinity,
                ease: 'linear'
              }}
            />
          ))}
        </div>

        {/* Main focus modal */}
        <motion.div
          className="focus-modal"
          initial={{ scale: 0.8, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 50 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="focus-icon-container">
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            >
              <CloudRain size={64} className="focus-main-icon" />
            </motion.div>
          </div>

          <h2 className="focus-title">Stay Focused 🌧️</h2>
          
          <div className="focus-message">
            <p>{motivationalMessage}</p>
          </div>

          <div className="focus-stats">
            <div className="stat-item">
              <BookOpen size={20} />
              <span>Learning Mode Active</span>
            </div>
            <div className="stat-item">
              <Target size={20} />
              <span>Focus Restored</span>
            </div>
          </div>

          <div className="focus-actions">
            <motion.button
              className="focus-button primary"
              onClick={onDismiss}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Coffee size={20} />
              I'm Ready to Continue
            </motion.button>
            
            <motion.button
              className="focus-button secondary"
              onClick={onDismiss}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Return to Study
            </motion.button>
          </div>

          <div className="focus-tip">
            <p>💡 Tip: Click anywhere or press any key to return to your PDF</p>
          </div>
        </motion.div>

        {/* Ambient background elements */}
        <div className="ambient-elements">
          <motion.div
            className="floating-orb orb-1"
            animate={{
              x: [0, 100, 0],
              y: [0, -50, 0],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />
          <motion.div
            className="floating-orb orb-2"
            animate={{
              x: [0, -80, 0],
              y: [0, 60, 0],
              opacity: [0.2, 0.5, 0.2]
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1
            }}
          />
          <motion.div
            className="floating-orb orb-3"
            animate={{
              x: [0, 50, 0],
              y: [0, -80, 0],
              opacity: [0.4, 0.7, 0.4]
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2
            }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FocusMode;