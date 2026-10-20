/** Motion tokens (plan section 21). Components pick a token instead of hand-tuning GSAP values. */
export const MOTION = {
  ease: {
    out: 'power3.out',
    editorial: 'expo.out',
    inOut: 'power2.inOut',
  },
  /** Seconds. Commerce surfaces stay at or below `fast`. */
  duration: {
    micro: 0.2,
    fast: 0.45,
    base: 0.8,
    slow: 1.2,
  },
  stagger: {
    grid: 0.08,
    text: 0.12,
  },
} as const;

export type RevealToken = 'reveal-sm' | 'reveal-md' | 'editorial-reveal' | 'stagger-grid';

export interface RevealPreset {
  from: { y?: number; opacity?: number };
  duration: number;
  ease: string;
  /** When set, children matching this selector animate in sequence. */
  children?: string;
  stagger?: number;
}

export const REVEAL_PRESETS: Record<RevealToken, RevealPreset> = {
  'reveal-sm': {
    from: { y: 16, opacity: 0 },
    duration: MOTION.duration.fast,
    ease: MOTION.ease.out,
  },
  'reveal-md': {
    from: { y: 40, opacity: 0 },
    duration: MOTION.duration.base,
    ease: MOTION.ease.out,
  },
  'editorial-reveal': {
    from: { y: 60, opacity: 0 },
    duration: MOTION.duration.slow,
    ease: MOTION.ease.editorial,
    children: '[data-reveal-line]',
    stagger: MOTION.stagger.text,
  },
  'stagger-grid': {
    from: { y: 32, opacity: 0 },
    duration: MOTION.duration.base,
    ease: MOTION.ease.out,
    children: '[data-reveal-item]',
    stagger: MOTION.stagger.grid,
  },
};

/** ScrollTrigger start position shared by scroll reveals. */
export const REVEAL_START = 'top 85%';
