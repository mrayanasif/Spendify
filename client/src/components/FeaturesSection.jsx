import { useEffect, useRef, useState } from 'react';
import features from '../data/features';
import './FeaturesSection.css';

const iconMap = {
  list: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  tag: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  chart: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  target: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  bulb: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21h6" />
      <path d="M12 3a6 6 0 0 0-4 10.5V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3.5A6 6 0 0 0 12 3z" />
    </svg>
  ),
  book: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
};

const featurePositions = [
  { side: 'left', top: '6%', left: '4%', right: 'auto' },
  { side: 'left', top: '42%', left: '14%', right: 'auto' },
  { side: 'left', top: '78%', left: '2%', right: 'auto' },
  { side: 'right', top: '14%', left: 'auto', right: '4%' },
  { side: 'right', top: '50%', left: 'auto', right: '16%' },
  { side: 'right', top: '86%', left: 'auto', right: '6%' },
];

const linePaths = [
  'M 80 32 L 130 32 L 130 64 L 175 64',
  'M 80 32 L 110 32 L 110 48 L 155 48',
  'M 80 32 L 140 32 L 140 76 L 185 76',
  'M 0 32 L -50 32 L -50 64 L -95 64',
  'M 0 32 L -30 32 L -30 52 L -75 52',
  'M 0 32 L -60 32 L -60 88 L -105 88',
];

export default function FeaturesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(0);
  const [direction, setDirection] = useState('forward');
  const [isPaused, setIsPaused] = useState(false);
  const sectionRef = useRef(null);
  const intervalRef = useRef(null);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion || isPaused) return;
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % features.length;
        setPrevIndex(prev);
        setDirection(next > prev || (prev === features.length - 1 && next === 0) ? 'forward' : 'backward');
        return next;
      });
    }, 4000);
    return () => clearInterval(intervalRef.current);
  }, [isPaused, reduceMotion]);

  const handleSelect = (index) => {
    if (index === activeIndex) return;
    setPrevIndex(activeIndex);
    setDirection(index > activeIndex ? 'forward' : 'backward');
    setActiveIndex(index);
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 8000);
  };

  const renderItem = (feature, index) => {
    const isActive = activeIndex === index;
    const pos = featurePositions[index];
    const isLeft = pos.side === 'left';
    const floatDelay = `${(index * 0.8) % 4}s`;

    return (
      <button
        key={index}
        className={`feature-item-staggered ${isActive ? 'active' : ''} ${isLeft ? 'left' : 'right'} feature-float`}
        style={{
          top: pos.top,
          left: pos.left,
          right: pos.right,
          animationDelay: floatDelay,
        }}
        onClick={() => handleSelect(index)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect(index);
          }
        }}
        aria-pressed={isActive}
        role="tab"
        aria-selected={isActive}
      >
        <div className="feature-item-text">
          <div className="feature-item-title">{feature.title}</div>
          <div className="feature-item-desc">{feature.text}</div>
        </div>
        <div className="feature-item-icon">
          {iconMap[feature.icon]}
        </div>
      </button>
    );
  };

  return (
    <section className="features-wrapper" id="features" ref={sectionRef} onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
      <div className="features-container">
        <div className="features-header">
          <h2>Features</h2>
          <p>Track, plan and manage your campus finances with ease</p>
        </div>

        <div className="features-staggered">
          <svg className="features-lines-svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {features.map((_, index) => {
              const paths = [
                'M 32% 12% L 38% 12% L 38% 20% L 44% 20%',
                'M 38% 48% L 42% 48% L 42% 54% L 46% 54%',
                'M 30% 84% L 40% 84% L 40% 90% L 46% 90%',
                'M 68% 20% L 62% 20% L 62% 28% L 56% 28%',
                'M 70% 56% L 64% 56% L 64% 62% L 58% 62%',
                'M 68% 92% L 60% 92% L 60% 98% L 54% 98%',
              ];
              return (
                <g key={index} className="connector-group">
                  <path d={paths[index]} className="connector-path-svg" />
                  <circle cx={index < 3 ? '44%' : '56%'} cy={index === 0 ? '20%' : index === 1 ? '54%' : index === 2 ? '90%' : index === 3 ? '28%' : index === 4 ? '62%' : '98%'} r="0.6" className="connector-dot-svg" />
                </g>
              );
            })}
          </svg>

          {features.map((feature, index) => renderItem(feature, index))}

          <div className="features-center-staggered">
            <div className="features-circle-backdrop" />
            <div className="ring-3" />
            <div className="floor-glow" />
            <div className="sparkle" />
            <div className="sparkle" />
            <div className="sparkle" />
            <div className="sparkle" />
            <div className="phone-shadow" />
            <div className="phone-mockup">
              <div className="phone-notch" />
              <div className="phone-screen" role="tabpanel" aria-live="polite">
                {reduceMotion ? (
                  <img
                    src={features[activeIndex].image}
                    alt={features[activeIndex].title}
                    className="phone-image"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : (
                  <div className={`phone-image-slider dir-${direction}`}>
                    <img
                      key={`prev-${prevIndex}`}
                      src={features[prevIndex].image}
                      alt={features[prevIndex].title}
                      className="phone-image slide-out"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <img
                      key={`active-${activeIndex}`}
                      src={features[activeIndex].image}
                      alt={features[activeIndex].title}
                      className="phone-image slide-in"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  </div>
                )}
                <div className="phone-placeholder">
                  <div className="phone-placeholder-title">{features[activeIndex].title}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="features-mobile-grid">
          {features.map((feature, index) => (
            <button
              key={index}
              className={`feature-item-mobile ${activeIndex === index ? 'active' : ''}`}
              onClick={() => handleSelect(index)}
              aria-pressed={activeIndex === index}
            >
              <div className="feature-item-icon">
                {iconMap[feature.icon]}
              </div>
              <div className="feature-item-text">
                <div className="feature-item-title">{feature.title}</div>
                <div className="feature-item-desc">{feature.text}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
