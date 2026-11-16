// Local development only; on Vercel, api/index.js exports the app instead.
const app  = require('./app');
const PORT = Number(process.env.PORT) || 5100;

app.listen(PORT, () => console.log(`HPC Workers API on http://localhost:${PORT}`));
