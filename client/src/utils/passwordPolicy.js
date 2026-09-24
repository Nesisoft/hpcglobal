import policy from '../../../shared/passwordPolicy.json';

/**
 * Password rules, evaluated from shared/passwordPolicy.json.
 *
 * The server runs the same rules against the same file when it accepts a
 * password, so what the checklist shows and what the server will allow are the
 * same thing. Mirror of server/src/lib/passwordPolicy.js — the rules live in
 * the JSON, so only the handling of a rule *type* appears in both.
 */

function ruleHolds(rule, password) {
  switch (rule.type) {
    case 'minLength':
      return password.length >= rule.value;
    case 'regex':
      return new RegExp(rule.value).test(password);
    case 'minDistinct':
      return new Set(password).size >= rule.value;
    default:
      return false;
  }
}

export function evaluatePassword(password) {
  const value = typeof password === 'string' ? password : '';
  const rules = policy.rules.map((rule) => ({
    id:    rule.id,
    label: rule.label,
    ok:    value.length > 0 && ruleHolds(rule, value),
  }));
  const failed = rules.filter((r) => !r.ok).map(({ id, label }) => ({ id, label }));
  return { rules, failed, ok: value.length > 0 && failed.length === 0 && value.length <= policy.maxLength };
}

/**
 * A rough sense of how much work the password would take to guess, for the
 * meter only — the rules above are what actually gates the form.
 */
export function passwordStrength(password) {
  const value = typeof password === 'string' ? password : '';
  if (!value) return { score: 0, label: '', tone: '' };

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  const distinct = new Set(value).size;

  let score = 0;
  if (value.length >= policy.minLength) score += 1;
  if (value.length >= 14) score += 1;
  if (classes >= 3) score += 1;
  if (classes === 4 && distinct >= 8) score += 1;

  const scale = [
    { label: 'Weak',       tone: 'bg-red-400'   },
    { label: 'Fair',       tone: 'bg-gold'      },
    { label: 'Good',       tone: 'bg-blue-400'  },
    { label: 'Strong',     tone: 'bg-green-500' },
    { label: 'Very strong',tone: 'bg-green-600' },
  ];
  return { score, ...scale[score] };
}

/**
 * A password that satisfies every rule, for the admin creating an account.
 * Generated from crypto, and re-rolled until it passes the same evaluator the
 * form and the server use — so it can never suggest something that is refused.
 */
export function generatePassword() {
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*?-+'];
  const all  = sets.join('');
  const pick = (chars) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];

  for (let attempt = 0; attempt < 50; attempt += 1) {
    // One from each set guarantees the classes; the rest is filler.
    const chars = sets.map(pick);
    while (chars.length < 16) chars.push(pick(all));
    // Fisher-Yates, so the guaranteed characters are not always in front.
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join('');
    if (evaluatePassword(candidate).ok) return candidate;
  }
  return '';
}

export const MIN_LENGTH = policy.minLength;
export const MAX_LENGTH = policy.maxLength;
export default policy;
