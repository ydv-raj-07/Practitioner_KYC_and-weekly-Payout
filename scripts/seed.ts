import type { PractitionerStatus } from '../generated/prisma/enums.js';
import { encrypt, hashPan } from '../src/crypto.js';
import { prisma } from '../src/db.js';

const IST = 5.5 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

// Monday 00:00 IST of the most recent COMPLETED week
function lastWeekStart(now = new Date()) {
  const ist = new Date(now.getTime() + IST);
  const sinceMon = (ist.getUTCDay() + 6) % 7;
  const thisMon = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - sinceMon);
  return new Date(thisMon - 7 * DAY - IST);
}

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Payout","Earning","Document","AuditLog","Practitioner" CASCADE');

  const last = lastWeekStart();
  const prev = new Date(last.getTime() - 7 * DAY);
  const at = (week: Date, day: number, hour: number) => new Date(week.getTime() + day * DAY + hour * 3600 * 1000);

  const people: [string, string, string, PractitionerStatus][] = [
    ['Asha Verma', 'ABCDE1234F', '9876543210', 'approved'],
    ['Rohit Sharma', 'BCDEF2345G', '9123456780', 'approved'],
    ['Meera Nair', 'CDEFG3456H', '9988776655', 'approved'],
    ['Karan Mehta', 'DEFGH4567J', '9812345670', 'under_review'],
    ['Sana Khan', 'EFGHJ5678K', '9701234567', 'submitted'],
    ['Vikas Gupta', 'FGHJK6789L', '9654321098', 'rejected'],
  ];

  const id: Record<string, string> = {};
  for (const [name, pan, phone, status] of people) {
    const p = await prisma.practitioner.create({
      data: {
        displayName: `${name.split(' ')[0]} ${name.split(' ')[1][0]}.`,
        nameEnc: encrypt(name), panEnc: encrypt(pan), phoneEnc: encrypt(phone),
        panHash: hashPan(pan), skills: ['yoga'], status,
      },
    });
    id[name] = p.id;
  }

  const earnings: [string, Date, number, number, number][] = [
    ['Asha Verma', last, 0, 10, 60000],   // Asha total 100000 -> 30000 / 1000 / 69000
    ['Asha Verma', last, 3, 15, 40000],
    ['Asha Verma', last, -1, 23, 99999],  // Sunday 23:00 IST: previous week, must NOT count
    ['Asha Verma', last, 7, 0, 77777],    // next Monday 00:00 IST: next week, must NOT count
    ['Rohit Sharma', last, 2, 9, 10001],  // rounding case -> 3000 / 100 / 6901
    ['Meera Nair', prev, 1, 11, 250050],  // nothing in `last` -> no payout for last week
    ['Karan Mehta', last, 1, 10, 500000], // not approved: never paid
    ['Sana Khan', last, 1, 10, 500000],
    ['Vikas Gupta', last, 1, 10, 500000],
  ];
  await prisma.earning.createMany({
    data: earnings.map(([n, w, d, h, amountPaise]) => ({ practitionerId: id[n], amountPaise, earnedAt: at(w, d, h) })),
  });

  const label = new Date(last.getTime() + IST).toISOString().slice(0, 10);
  console.log(`Seed done. Run: POST /admin/payouts/run?week=${label}\n`);
  for (const [name, , , status] of people) console.log(`${name.padEnd(13)} ${status.padEnd(13)} ${id[name]}`);
}

main().finally(() => prisma.$disconnect());