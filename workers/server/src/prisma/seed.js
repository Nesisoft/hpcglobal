/**
 * The starting data, carried over from the old PHP app: its 22 departments.
 * (Its services join them when services arrive.) Applied by sync.js on every
 * production deploy, but each list only goes in when its table is empty — the
 * first time — so departments the office later renames, archives or adds are
 * never touched.
 */

const DEPARTMENTS = [
  ['Administration', 'Oversees the administrative functions of the church.'],
  ['Children',       'Focuses on programs and activities for children.'],
  ['Cleaning',       'Maintains cleanliness and hygiene within church premises.'],
  ['Coordinators',   null],
  ['Counseling',     'Provides counseling services to members in need.'],
  ['Evangelism',     'Focuses on spreading the gospel and church growth.'],
  ['Finance',        'Manages the church financial resources and budgeting.'],
  ['Hospitality',    'Coordinates hospitality services including refreshments and meals.'],
  ['Maintenance',    'Handles repairs and upkeep of church facilities.'],
  ['Media',          'Handles all media-related activities including audio, video, and live streaming.'],
  ['Music',          'Leads worship and music during services.'],
  ['Outreach',       'Organizes community outreach and evangelism programs.'],
  ['Parking',        'Manages parking arrangements during church events.'],
  ['Pastors',        null],
  ['Prayer',         'Leads prayer sessions and spiritual support.'],
  ['Protocol',       'Ensures proper conduct and procedures during church events.'],
  ['Receivers',      null],
  ['Security',       'Ensures the safety and security of church members and property.'],
  ['Tech',           'Manages technical equipment and IT infrastructure.'],
  ['Ushers',         'Responsible for welcoming and seating attendees during services.'],
  ['Welfare',        'Provides support and assistance to members in need.'],
  ['Youth',          'Engages and supports the youth members of the church.'],
];

const literal = (v) => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/** SQL that adds the starting rows to each empty table in `schema`. */
function seedSql(schema) {
  const table = (name) => `"${schema}"."${name}"`;
  const departments = DEPARTMENTS
    .map(([name, description]) => `(gen_random_uuid()::text, ${literal(name)}, ${literal(description)}, now())`)
    .join(',\n  ');
  return `
INSERT INTO ${table('Department')} ("id", "name", "description", "updatedAt")
SELECT * FROM (VALUES
  ${departments}
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM ${table('Department')});`;
}

module.exports = { seedSql, DEPARTMENTS };
