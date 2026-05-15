const path    = require('path');
const express = require('express');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const app     = require('./app');

const PORT = process.env.PORT || 5000;

// ─── Serve React build in production ─────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(distPath));

  // React catch-all — must come after all API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`HPC Global server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
