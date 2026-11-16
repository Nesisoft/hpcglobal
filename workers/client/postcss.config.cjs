const path = require('path');

// The Tailwind config is named by path so the styles come out the same
// whichever folder Vite is started from.
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
