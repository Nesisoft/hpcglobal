// The Vercel function for the workers app. Every /api/* request is rewritten
// here (see vercel.json) and handled by the Express app.
module.exports = require('../server/src/app');
