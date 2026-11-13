/**
 * The website's palette and type (client/tailwind.config.js), so the workers
 * app reads as part of HPC Global rather than the old app's black and yellow.
 * @type {import('tailwindcss').Config}
 */
export default {
  // Relative to this file, not to wherever the build was started from.
  content: { relative: true, files: ['./index.html', './src/**/*.{js,jsx}'] },
  theme: {
    extend: {
      colors: {
        'purple-deep': '#210A4A',
        'purple-brand': '#3B1278',
        'purple-mid': '#5A2DAF',
        gold: '#C9A84C',
        'gold-light': '#E2C46A',
        'gold-pale': '#F5E9C4',
        cream: '#FBF7EE',
        ink: '#1A0E30',
        mist: '#F4F2F9',
      },
      // The website's classes use /6 and /8 (bg-purple-brand/8 and the like),
      // which Tailwind's default scale doesn't have.
      opacity: { 6: '0.06', 8: '0.08' },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        body: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
