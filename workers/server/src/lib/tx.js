const prisma = require('./prisma');

/**
 * An interactive transaction that waits its turn on a busy Sunday.
 *
 * On Vercel each instance holds a single pooled connection (lib/prisma.js), so
 * a transaction may have to wait for requests ahead of it. Prisma's default is
 * to give up after 2 seconds (P2028), which would turn a queue into an error;
 * 10 seconds lets it drain. Inside `fn`, use only the `tx` client it is given —
 * the global client would wait for the very connection the transaction holds.
 */
const transaction = (fn) => prisma.$transaction(fn, { maxWait: 10000, timeout: 20000 });

// One lock for any change that could leave the church without an active super
// administrator. Two super admins demoting or suspending each other at the
// same moment would otherwise each count two and both go ahead.
const SUPER_ADMIN_LOCK = 724501;
const lockSuperAdmins = (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_LOCK}::bigint)`;

module.exports = { transaction, lockSuperAdmins };
