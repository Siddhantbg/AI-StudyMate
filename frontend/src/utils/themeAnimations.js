// frontend/src/utils/themeAnimations.js
import { gsap } from 'gsap';

class ThemeAnimations {
  constructor() {
    this.isAnimating = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Main theme transition animation
  transitionTheme(oldTheme, newTheme) {
    if (this.reducedMotion || this.isAnimating) return;
    
    this.isAnimating = true;
    
    // Create overlay for smooth transition
    const overlay = document.createElement('div');
    overlay.className = 'theme-transition-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: var(--primary-color);
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);

    // Fade out
    gsap.to(overlay, {
      opacity: 0.7,
      duration: 0.15,
      ease: 'power2.out',
      onComplete: () => {
        // Theme change happens here (handled by ThemeContext)
        // Fade back in with new theme
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.15,
          ease: 'power2.in',
          delay: 0.1,
          onComplete: () => {
            document.body.removeChild(overlay);
            this.isAnimating = false;
            
            // Add theme-specific entrance animations
            this.addThemeSpecificAnimations(newTheme);
          }
        });
      }
    });
  }

  // Theme-specific animations
  addThemeSpecificAnimations(theme) {
    if (this.reducedMotion) return;

    switch (theme) {
      case 'forest':
        this.forestAnimations();
        break;
      case 'interstellar':
        this.interstellarAnimations();
        break;
      case 'spiderman-venom':
        this.spiderVenomAnimations();
        break;
    }
  }

  // Forest theme animations
  forestAnimations() {
    // Animate floating leaves
    this.createFloatingElements('🍃', 5, {
      duration: () => gsap.utils.random(20, 30),
      x: () => gsap.utils.random(-50, window.innerWidth + 50),
      y: () => gsap.utils.random(-100, -50),
      rotation: () => gsap.utils.random(0, 360),
      scale: () => gsap.utils.random(0.5, 1.2)
    });

    // Gentle wind effect on elements
    gsap.to('.app-header', {
      x: 2,
      duration: 3,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });
  }

  // Interstellar theme animations
  interstellarAnimations() {
    // Twinkling stars
    this.createTwinklingStars(20);
    
    // Cosmic dust particles
    this.createFloatingElements('✨', 8, {
      duration: () => gsap.utils.random(15, 25),
      x: () => gsap.utils.random(0, window.innerWidth),
      y: () => gsap.utils.random(0, window.innerHeight),
      scale: () => gsap.utils.random(0.3, 0.8),
      opacity: () => gsap.utils.random(0.3, 0.7)
    });

    // Subtle rocket ship animation
    const rocketInterval = setInterval(() => {
      if (!document.documentElement.classList.contains('theme-interstellar')) {
        clearInterval(rocketInterval);
        return;
      }
      this.createRocketShip();
    }, 15000);
  }

  // Spider-Venom theme animations
  spiderVenomAnimations() {
    // Web pattern effects
    this.createWebPatterns(3);
    
    // Venom droplets
    this.createFloatingElements('🕷️', 4, {
      duration: () => gsap.utils.random(10, 20),
      x: () => gsap.utils.random(0, window.innerWidth),
      y: () => gsap.utils.random(-100, -50),
      rotation: () => gsap.utils.random(0, 360),
      scale: () => gsap.utils.random(0.6, 1.0)
    });

    // Dramatic shadow effects
    gsap.to('.app-container', {
      filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.1))',
      duration: 2,
      ease: 'power2.inOut',
      yoyo: true,
      repeat: -1
    });
  }

  // Utility: Create floating elements
  createFloatingElements(emoji, count, options) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const element = document.createElement('div');
        element.textContent = emoji;
        element.style.cssText = `
          position: fixed;
          font-size: ${gsap.utils.random(16, 32)}px;
          pointer-events: none;
          z-index: 1;
          left: ${options.x()}px;
          top: ${options.y()}px;
        `;
        document.body.appendChild(element);

        gsap.set(element, {
          scale: options.scale(),
          rotation: options.rotation ? options.rotation() : 0,
          opacity: options.opacity ? options.opacity() : 1
        });

        gsap.to(element, {
          y: window.innerHeight + 100,
          x: `+=${gsap.utils.random(-100, 100)}`,
          rotation: `+=${gsap.utils.random(360, 720)}`,
          duration: options.duration(),
          ease: 'none',
          onComplete: () => element.remove()
        });
      }, i * gsap.utils.random(1000, 3000));
    }
  }

  // Utility: Create twinkling stars
  createTwinklingStars(count) {
    for (let i = 0; i < count; i++) {
      const star = document.createElement('div');
      star.style.cssText = `
        position: fixed;
        width: 2px;
        height: 2px;
        background: white;
        border-radius: 50%;
        left: ${gsap.utils.random(0, window.innerWidth)}px;
        top: ${gsap.utils.random(0, window.innerHeight)}px;
        pointer-events: none;
        z-index: 1;
      `;
      document.body.appendChild(star);

      gsap.to(star, {
        opacity: 0,
        duration: gsap.utils.random(1, 3),
        ease: 'power2.inOut',
        yoyo: true,
        repeat: -1,
        delay: gsap.utils.random(0, 2)
      });

      // Remove after theme changes
      setTimeout(() => {
        if (!document.documentElement.classList.contains('theme-interstellar')) {
          star.remove();
        }
      }, 30000);
    }
  }

  // Utility: Create rocket ship
  createRocketShip() {
    const rocket = document.createElement('div');
    rocket.textContent = '🚀';
    rocket.style.cssText = `
      position: fixed;
      font-size: 24px;
      left: -50px;
      top: ${gsap.utils.random(100, window.innerHeight - 200)}px;
      pointer-events: none;
      z-index: 1;
    `;
    document.body.appendChild(rocket);

    gsap.to(rocket, {
      x: window.innerWidth + 100,
      y: '-=50',
      rotation: 15,
      duration: 4,
      ease: 'power2.out',
      onComplete: () => rocket.remove()
    });
  }

  // Utility: Create web patterns
  createWebPatterns(count) {
    for (let i = 0; i < count; i++) {
      const web = document.createElement('div');
      web.style.cssText = `
        position: fixed;
        width: 100px;
        height: 100px;
        background: radial-gradient(circle, transparent 30%, rgba(255,255,255,0.1) 31%, rgba(255,255,255,0.1) 35%, transparent 36%);
        left: ${gsap.utils.random(0, window.innerWidth - 100)}px;
        top: ${gsap.utils.random(0, window.innerHeight - 100)}px;
        pointer-events: none;
        z-index: 1;
        opacity: 0;
      `;
      document.body.appendChild(web);

      gsap.to(web, {
        opacity: 0.3,
        scale: 1.5,
        duration: 2,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(web, {
            opacity: 0,
            duration: 3,
            delay: 5,
            onComplete: () => web.remove()
          });
        }
      });
    }
  }

  // Clean up all animations
  cleanup() {
    // Remove any remaining animated elements
    const animatedElements = document.querySelectorAll('.theme-transition-overlay');
    animatedElements.forEach(el => el.remove());
    
    // Kill all GSAP animations
    gsap.killTweensOf('*');
  }
}

// Export singleton instance
export const themeAnimations = new ThemeAnimations();

// Helper function to trigger theme transition
export const triggerThemeTransition = (oldTheme, newTheme) => {
  themeAnimations.transitionTheme(oldTheme, newTheme);
};