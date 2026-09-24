const policy = require('../../../shared/passwordPolicy.json');

/**
 * Password rules, evaluated from shared/passwordPolicy.json.
 *
 * The client runs the same rules against the same file to draw its live
 * checklist. Keep the two evaluators behaving identically — the rules
 * themselves live in the JSON, so only the handling of a rule *type* is
 * written twice, and adding a rule touches neither evaluator.
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
      // An unknown rule type must not silently pass.
      return false;
  }
}

/**
 * @param {string} password
 * @returns {{ rules: Array<{id,label,ok}>, failed: Array<{id,label}>, ok: boolean }}
 */
function evaluatePassword(password) {
  const value = typeof password === 'string' ? password : '';
  const rules = policy.rules.map((rule) => ({
    id:    rule.id,
    label: rule.label,
    ok:    value.length > 0 && ruleHolds(rule, value),
  }));
  const failed = rules.filter((r) => !r.ok).map(({ id, label }) => ({ id, label }));
  return { rules, failed, ok: value.length > 0 && failed.length === 0 && value.length <= policy.maxLength };
}

/** The first thing wrong with a password, phrased for the person who typed it. */
function firstProblem(password) {
  const value = typeof password === 'string' ? password : '';
  if (!value) return 'Enter a password';
  if (value.length > policy.maxLength) return `Password must be at most ${policy.maxLength} characters`;
  const { failed } = evaluatePassword(value);
  return failed.length ? failed[0].label : null;
}

module.exports = { policy, evaluatePassword, firstProblem };
