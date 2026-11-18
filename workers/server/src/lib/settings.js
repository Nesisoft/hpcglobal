/**
 * The office's clocking rules (one Settings row). Made with the defaults the
 * first time it is asked for — quietly, so two requests at once don't fail.
 */
async function getSettings(db) {
  const found = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (found) return found;
  await db.settings.createMany({ data: [{ id: 'singleton' }], skipDuplicates: true });
  return db.settings.findUnique({ where: { id: 'singleton' } });
}

const SETTING_FIELDS = [
  'graceMinutes', 'veryLateMinutes', 'opensBeforeMinutes', 'clockOutAfterMinutes',
  'minValidMinutes', 'leftEarlyMinutes', 'defaultRadiusM',
];

const presentSettings = (s) => Object.fromEntries(SETTING_FIELDS.map((k) => [k, s[k]]));

module.exports = { getSettings, presentSettings, SETTING_FIELDS };
