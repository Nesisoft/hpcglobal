const { z } = require('zod');
const { canonicalPhone } = require('./phone');
const { firstProblem, policy } = require('./passwordPolicy');

/** The form fields shared by sign-up, profile edits and the admin's edit. */

// Letters (any alphabet, with accents), spaces, apostrophes (straight, or the
// curly one phone keyboards type), hyphens and full stops — what names are
// made of — with a full stop never directly before a letter, as in a web
// address: "Jr." and "St. John" pass, "help.com" doesn't. Names appear to
// HODs and admins, so they mustn't be able to carry a phone number or link.
const NAME = /^(?!.*\.\p{L})\p{L}[\p{L}\p{M}'’ .-]*$/u;

const name = (label) => z.string({ error: `Enter your ${label}` })
  .trim()
  .min(1, `Enter your ${label}`)
  .max(60, `${label[0].toUpperCase()}${label.slice(1)} is too long`)
  .regex(NAME, `Use letters in your ${label}, with a space after any full stop`);

const emailField = z.string({ error: 'Enter your email' })
  .trim()
  .toLowerCase()
  .max(200, 'That email is too long')
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address');

const phoneField = z.string({ error: 'Enter your phone number' })
  .max(30, 'Enter a phone number like 024 412 3456')
  .transform((v, ctx) => {
    const stored = canonicalPhone(v);
    if (!stored) {
      ctx.addIssue({ code: 'custom', message: 'Enter a phone number like 024 412 3456' });
      return z.NEVER;
    }
    return stored;
  });

const genderField = z.enum(['MALE', 'FEMALE'], { error: 'Choose male or female' });

const passwordField = z.string({ error: 'Choose a password' })
  .max(policy.maxLength, `Password must be at most ${policy.maxLength} characters`)
  .superRefine((v, ctx) => {
    if (!v) return ctx.addIssue({ code: 'custom', message: 'Choose a password' });
    const problem = firstProblem(v);
    // "At least 10 characters" → "Password needs at least 10 characters"
    if (problem) ctx.addIssue({ code: 'custom', message: `Password needs ${problem[0].toLowerCase()}${problem.slice(1)}` });
  });

const workerFields = {
  firstName: name('first name'),
  lastName:  name('last name'),
  phone:     phoneField,
  gender:    genderField,
};

module.exports = { workerFields, emailField, phoneField, genderField, passwordField, name };
