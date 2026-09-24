const policy = require('../../../shared/passwordPolicy.json');

/**
 * Password rules, evaluated from shared/passwordPolicy.json.
 *
 * The client runs the same rules against the same file to draw its live
 * checklist. Keep the two evaluators behaving identically — the rules
 * themselves live in the JSON, so only the handling of a rule *type* is
 * written twice, and adding a rule touches neither evaluator.
 */

const lettersOnly = (s) => s.replace(/[^a-z]+$/, '');

/** Words from a person's name and email that must not appear in their password. */
function identityTokens({ name, email } = {}) {
  const parts = [];
  if (name)  parts.push(...String(name).toLowerCase().split(/[^a-z]+/i));
  if (email) {
    const local = String(email).toLowerCase().split('@')[0];
    parts.push(local, ...local.split(/[^a-z0-9]+/i));
  }
  // Anything shorter than four characters would fire on too many innocent
  // passwords to be worth flagging.
  return [...new Set(parts.filter((p) => p && p.length >= 4))];
}

function ruleHolds(rule, password, context) {
  switch (rule.type) {
    case 'minLength':
      return password.length >= rule.value;
    case 'regex':
      return new RegExp(rule.value).test(password);
    case 'minDistinct':
      return new Set(password).size >= rule.value;
    case 'notCommon': {
      const lower   = password.toLowerCase();
      const trimmed = lettersOnly(lower);
      return !policy.commonPasswords.includes(lower)
        && !(trimmed.length >= 4 && policy.commonPasswords.includes(trimmed));
    }
    case 'notPersonal': {
      const lower = password.toLowerCase();
      return !identityTokens(context).some((t) => lower.includes(t));
    }
    default:
      // An unknown rule type must not silently pass.
      return false;
  }
}

/**
 * @param {string} password
 * @param {{ name?: string, email?: string }} [context]
 * @returns {{ rules: Array<{id,label,ok}>, failed: Array<{id,label}>, ok: boolean }}
 */
function evaluatePassword(password, context = {}) {
  const value = typeof password === 'string' ? password : '';
  const rules = policy.rules.map((rule) => ({
    id:    rule.id,
    label: rule.label,
    ok:    value.length > 0 && ruleHolds(rule, value, context),
  }));
  const failed = rules.filter((r) => !r.ok).map(({ id, label }) => ({ id, label }));
  return { rules, failed, ok: value.length > 0 && failed.length === 0 && value.length <= policy.maxLength };
}

/** The first thing wrong with a password, phrased for the person who typed it. */
function firstProblem(password, context = {}) {
  const value = typeof password === 'string' ? password : '';
  if (!value) return 'Enter a password';
  if (value.length > policy.maxLength) return `Password must be at most ${policy.maxLength} characters`;
  const { failed } = evaluatePassword(value, context);
  return failed.length ? failed[0].label : null;
}

module.exports = { policy, evaluatePassword, firstProblem, identityTokens };
