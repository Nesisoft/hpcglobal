const { formatPhone } = require('./phone');

const fullName = (w) => `${w.firstName} ${w.lastName}`.trim();

/** A worker as the API shows them. Never includes hashes, codes or versions. */
function presentWorker(w) {
  return {
    id:                 w.id,
    firstName:          w.firstName,
    lastName:           w.lastName,
    name:               fullName(w),
    email:              w.email,
    phone:              w.phone,
    phoneDisplay:       formatPhone(w.phone),
    gender:             w.gender,
    role:               w.role,
    status:             w.status,
    statusNote:         w.statusNote ?? null,
    isHod:              w.isHod,
    // Whether the HOD tools are open to them right now — the HOD flag alone
    // isn't enough once their department is archived or they are suspended.
    leadsDepartment:    leadsDepartment(w),
    department:         w.department ? { id: w.department.id, name: w.department.name, active: w.department.active !== false } : null,
    approvedAt:         w.approvedAt ?? null,
    approvedByName:     w.approvedByName ?? null,
    mustChangePassword: w.mustChangePassword,
    lastLogin:          w.lastLogin ?? null,
    createdAt:          w.createdAt,
    // Sent back with an admin's edit, so a form opened before someone else's
    // change can't quietly undo it (see Worker.editedAt).
    editedAt:           w.editedAt,
  };
}

const isAdmin = (w) => w.role === 'ADMIN' || w.role === 'SUPER_ADMIN';

/** Whether this worker currently leads a department. */
const leadsDepartment = (w) => Boolean(
  w.isHod && w.departmentId && w.status === 'ACTIVE' && w.department?.active !== false,
);

/**
 * A temporary password from the office stops working after 72 hours — and so
 * does any sign-in made with it that hasn't yet replaced it (checked on every
 * request in middleware/auth.js, not only at sign-in).
 */
const temporaryPasswordExpired = (w) => Boolean(w.mustChangePassword && w.tempPasswordExpires && w.tempPasswordExpires < new Date());
const TEMP_EXPIRED = 'That temporary password has expired. Ask the church office for a new one, or reset your password by email.';

module.exports = { presentWorker, fullName, isAdmin, leadsDepartment, temporaryPasswordExpired, TEMP_EXPIRED };
