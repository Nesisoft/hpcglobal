import policy from '../../../shared/passwordPolicy.json';

/**
 * The live checklist under a password box. Same rules, from the same file, as
 * the server's check (server/src/lib/passwordPolicy.js).
 */
function ruleHolds(rule, password) {
  switch (rule.type) {
    case 'minLength':   return password.length >= rule.value;
    case 'regex':       return new RegExp(rule.value).test(password);
    case 'minDistinct': return new Set(password).size >= rule.value;
    default:            return false;
  }
}

export function evaluatePassword(password) {
  const value = typeof password === 'string' ? password : '';
  const rules = policy.rules.map((rule) => ({ id: rule.id, label: rule.label, ok: value.length > 0 && ruleHolds(rule, value) }));
  return { rules, ok: rules.every((r) => r.ok) && value.length <= policy.maxLength };
}

export { policy };
