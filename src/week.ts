import { AppError } from './errors.js';

const IST_MS = 5.5 * 3600 * 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const bad = (msg: string) => new AppError(400, 'INVALID_WEEK', msg);

export function parseWeek(input: unknown, now = new Date()) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw bad('week must be a Monday date like 2026-10-05');
  }
  const [y, m, d] = input.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw bad('week is not a real date');
  if (date.getUTCDay() !== 1) throw bad('week must be a Monday');

  const start = new Date(date.getTime() - IST_MS);
  const end = new Date(start.getTime() + WEEK_MS);
  if (end > now) throw new AppError(400, 'WEEK_NOT_COMPLETE', 'This week is not finished yet');
  return { label: input, date, start, end }; 
}