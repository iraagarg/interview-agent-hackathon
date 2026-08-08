import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', '..', 'data');

const curriculum = JSON.parse(readFileSync(join(dataDir, 'curriculum.json'), 'utf8'));

/**
 * Index days by day number.
 *
 * Day number is the ONLY reliable join key between a candidate mission and a
 * curriculum day: 21 of the 200 missions in candidates.json carry a title that
 * differs from the curriculum's (e.g. mission "Retrieval & Matching Engine" vs
 * curriculum "The Retrieval & Matching Engine"). We always render the
 * curriculum title, never the mission's.
 */
const daysByNumber = new Map(curriculum.days.map((d) => [d.day, d]));

export const getDay = (dayNumber) => daysByNumber.get(dayNumber) || null;

export const allDays = () => curriculum.days;

/**
 * modules[].days is a two-element [startDay, endDay] RANGE, not an enumeration.
 * Module 4 is [11, 15] meaning days 11,12,13,14,15 — treating it as a list
 * would silently drop days 12-14 from module-spread logic.
 */
export function getModule(dayNumber) {
  return (
    curriculum.modules.find(
      (m) => dayNumber >= m.days[0] && dayNumber <= m.days[1]
    ) || null
  );
}

export const getModuleTitle = (dayNumber) => getModule(dayNumber)?.title || 'Unknown Module';

export const cohortName = curriculum.cohort;
