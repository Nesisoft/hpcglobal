const { fullName } = require('./present');

/**
 * Record who changed what. Pass the transaction client when the change itself
 * is in a transaction, so the entry and the change stand or fall together.
 */
function audit(db, actor, { action, targetType, targetId = null, summary, details }) {
  return db.auditLog.create({
    data: {
      actorId:   actor?.id ?? null,
      actorName: actor ? fullName(actor) : 'System',
      action,
      targetType,
      targetId,
      summary,
      ...(details === undefined ? {} : { details }),
    },
  });
}

module.exports = { audit };
