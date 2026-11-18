/**
 * The starting data, carried over from the old PHP app: its 22 departments
 * and its services. Applied by sync.js on every
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

// The old app's services, as the owner's copy of it had them in 2026 — times,
// days and venue positions — so clocking in by GPS works from the first day.
// The office checks and adjusts them in Admin → Services. The two special
// programmes come in archived, ready to be given dates when they come round.
const VENUE = { name: 'Royal Ravico Hotel', latitude: 5.610256, longitude: -0.076429 };
const SERVICES = [
  // name, kind, recurrence, weekday, start, end, latitude, longitude, radius, active
  ['Dominion Encounter Service',   'REGULAR',    'WEEKLY', 0,    '07:30', '13:30', VENUE.latitude, VENUE.longitude, 100, true],
  ['Commanding The Week',          'REGULAR',    'WEEKLY', 1,    '06:00', '07:00', 5.6079781,      -0.0636689,      200, true],
  ['Workforce Service',            'MIDWEEK',    'WEEKLY', 3,    '19:00', '21:30', VENUE.latitude, VENUE.longitude, 100, true],
  ['Prophetic & Miracle Service',  'REGULAR',    'WEEKLY', 5,    '18:30', '21:30', VENUE.latitude, VENUE.longitude, 100, true],
  ['Singles & Couples Summit',     'CONFERENCE', 'NONE',   null, '09:00', '13:00', 5.610289,       -0.076315,       100, false],
  ['7 Days of Fasting & Prayers',  'SPECIAL',    'DAILY',  null, '18:30', '21:30', 5.610289,       -0.076315,       100, false],
];

const literal = (v) => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const ROW_BREAK = ',\n  ';

/** SQL that adds the starting rows to each empty table in `schema`. */
function seedSql(schema) {
  const table = (name) => `"${schema}"."${name}"`;
  const departments = DEPARTMENTS
    .map(([name, description]) => `(gen_random_uuid()::text, ${literal(name)}, ${literal(description)}, now())`)
    .join(ROW_BREAK);
  const services = SERVICES
    .map(([name, kind, recurrence, weekday, start, end, lat, lng, radius, active]) => `(gen_random_uuid()::text, ${literal(name)}, `
      + `${literal(kind)}::"${schema}"."ServiceKind", ${literal(VENUE.name)}, ${lat}::float8, ${lng}::float8, ${radius}, `
      + `${literal(recurrence)}::"${schema}"."Recurrence", ${weekday === null ? 'NULL::int' : weekday}, `
      + `${literal(start)}, ${literal(end)}, ${active}, now())`)
    .join(ROW_BREAK);
  return `
INSERT INTO ${table('Department')} ("id", "name", "description", "updatedAt")
SELECT * FROM (VALUES
  ${departments}
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM ${table('Department')});

INSERT INTO ${table('Service')} ("id", "name", "kind", "venueName", "latitude", "longitude", "radiusM", "recurrence", "weekday", "startTime", "endTime", "active", "updatedAt")
SELECT * FROM (VALUES
  ${services}
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM ${table('Service')});`;
}

module.exports = { seedSql, DEPARTMENTS, SERVICES };
