const router = require('express').Router();
const { authenticate, requireActive, requireAdmin } = require('../../middleware/auth');

// Everything under /api/admin: administrators and super administrators only.
// Super-admin-only actions check for themselves.
router.use(authenticate, requireActive, requireAdmin);

router.use(require('./workers'));
router.use(require('./departments'));
router.use(require('./audit'));

module.exports = router;
