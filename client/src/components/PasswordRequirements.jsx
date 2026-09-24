import { Check, X, Circle } from 'lucide-react';
import { evaluatePassword, passwordStrength } from '../utils/passwordPolicy';

/**
 * Live guide to the password rules — each line ticks as it is satisfied.
 *
 * Shows the same rules the server enforces, so a fully ticked list means the
 * password will be accepted. Before anything is typed the lines sit neutral
 * rather than red: nothing is wrong yet, they are just what is needed.
 *
 * Props:
 *   password  – the value being typed
 *   tone      – 'light' (default) or 'dark', to sit on the deep purple pages
 *   showMeter – include the strength bar (default true)
 */
export default function PasswordRequirements({ password, tone = 'light', showMeter = true }) {
  const dark = tone === 'dark';
  const skin = dark
    ? {
        box:     'bg-white/5 border-white/10',
        heading: 'text-white/50',
        note:    'text-white/40',
        pending: 'text-white/45',
        done:    'text-green-400',
        todo:    'text-white/60',
        track:   'bg-white/10',
        neutral: 'text-white/20',
      }
    : {
        box:     'bg-[#F9F8FC] border-purple-brand/8',
        heading: 'text-ink/50',
        note:    'text-ink/45',
        pending: 'text-ink/50',
        done:    'text-green-700',
        todo:    'text-ink/60',
        track:   'bg-purple-brand/10',
        neutral: 'text-ink/20',
      };

  const { rules } = evaluatePassword(password);
  const strength  = passwordStrength(password);
  const touched   = Boolean(password);
  const met       = rules.filter((r) => r.ok).length;

  return (
    <div className={`border rounded-lg p-3.5 mt-1 ${skin.box}`}>
      {showMeter && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className={`text-[11px] font-body font-semibold uppercase tracking-wider ${skin.heading}`}>
              Password strength
            </p>
            {touched && (
              <p className={`text-[11px] font-body ${skin.todo}`}>{strength.label}</p>
            )}
          </div>
          <div className="flex gap-1" role="presentation">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  touched && i < strength.score ? strength.tone : skin.track
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <p className={`text-[11px] font-body mb-2 ${skin.note}`}>
        {touched ? `${met} of ${rules.length} requirements met` : 'Your new password needs:'}
      </p>

      <ul className="space-y-1" aria-live="polite">
        {rules.map(({ id, label, ok }) => (
          <li key={id} className="flex items-start gap-1.5 text-[12px] font-body leading-snug">
            <span className="mt-[2px] flex-shrink-0">
              {!touched
                ? <Circle size={12} className={skin.neutral} />
                : ok
                  ? <Check size={12} className={dark ? 'text-green-400' : 'text-green-600'} />
                  : <X size={12} className="text-red-400" />}
            </span>
            <span className={!touched ? skin.pending : ok ? skin.done : skin.todo}>
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
