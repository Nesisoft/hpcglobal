const { z } = require('zod');
const { isAdmin, leadsDepartment } = require('./present');
const { isDateKey, at } = require('./time');

/**
 * Notices: from the office to everyone, one department or the heads of
 * department; from a head of department to their own department.
 */

/** What `worker` may read now: published, not expired, meant for them. */
function visibleTo(worker, now = new Date()) {
  const audiences = [{ audience: 'ALL' }];
  if (worker.departmentId) audiences.push({ audience: 'DEPARTMENT', departmentId: worker.departmentId });
  if (leadsDepartment(worker) || isAdmin(worker)) audiences.push({ audience: 'HODS' });
  return {
    publishAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    AND: [{ OR: audiences }],
  };
}

const WITH_DEPARTMENT = { department: { select: { id: true, name: true } } };

function presentNotice(n, { now = new Date(), readIds } = {}) {
  return {
    id:         n.id,
    title:      n.title,
    body:       n.body,
    audience:   n.audience,
    department: n.department ? { id: n.department.id, name: n.department.name } : null,
    pinned:     n.pinned,
    publishAt:  n.publishAt,
    expiresAt:  n.expiresAt ?? null,
    authorId:   n.authorId ?? null,
    authorName: n.authorName,
    createdAt:  n.createdAt,
    state:      n.publishAt > now ? 'scheduled' : n.expiresAt && n.expiresAt <= now ? 'expired' : 'live',
    ...(readIds ? { read: readIds.has(n.id) } : {}),
    ...(n._count ? { reads: n._count.reads } : {}),
  };
}

const dateKey = (label) => z.string().refine(isDateKey, `Choose the ${label}`);

/** The fields of a notice, as a form sends them. Dates are Accra days. */
const noticeFields = z.object({
  title:     z.string({ error: 'Give it a title' }).trim().min(3, 'Give it a title').max(120, 'Keep the title under 120 characters'),
  body:      z.string({ error: 'Write the notice' }).trim().min(1, 'Write the notice').max(4000, 'Keep it under 4,000 characters'),
  pinned:    z.boolean().optional(),
  publishOn: dateKey('first day').optional().nullable(),
  expiresOn: dateKey('last day').optional().nullable(),
});

/**
 * Dates from a form, or a refusal: shown from the start of `publishOn` to the
 * end of `expiresOn` (Accra days). A date left out keeps `keep`'s value (an
 * edit); one sent empty means "now" for the start and "never" for the end.
 */
function noticeDates({ publishOn, expiresOn }, { now = new Date(), keep = { publishAt: now, expiresAt: null } } = {}) {
  const publishAt = publishOn === undefined ? keep.publishAt : publishOn ? at(publishOn, '00:00') : now;
  const expiresAt = expiresOn === undefined ? keep.expiresAt : expiresOn ? new Date(at(expiresOn, '23:59').getTime() + 59999) : null;
  if (expiresAt && expiresAt <= publishAt) return { error: { field: 'expiresOn', message: 'The last day is before the notice would show.' } };
  if (expiresOn && expiresAt <= now) return { error: { field: 'expiresOn', message: 'The last day has already passed.' } };
  return { publishAt, expiresAt };
}

module.exports = { visibleTo, presentNotice, noticeFields, noticeDates, WITH_DEPARTMENT };
