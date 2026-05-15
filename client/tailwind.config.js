/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
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
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        body: ['Outfit', 'sans-serif'],
      },
      fontSize: {
        display: ['clamp(2.5rem,6vw,5rem)', { lineHeight: '1.1' }],
        h2: ['clamp(1.8rem,4vw,2.8rem)', { lineHeight: '1.2' }],
        h3: ['clamp(1.2rem,2.5vw,1.6rem)', { lineHeight: '1.3' }],
      },
      backgroundImage: {
        'hero-gradient':
          'radial-gradient(circle at 30% 50%, rgba(90,45,175,0.5), transparent 55%), radial-gradient(circle at 75% 30%, rgba(201,168,76,0.12), transparent 40%)',
      },
    },
  },
  plugins: [],
};
