import { prisma } from '../db.js';
import { calculatePayout } from '../money.js';
import { parseWeek } from '../week.js';

export async function runPayouts(weekInput: unknown) {
  const week = parseWeek(weekInput);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout:' + week.label}))`;

    const groups = await tx.earning.groupBy({
      by: ['practitionerId'],
      where: { practitioner: { status: 'approved' }, earnedAt: { gte: week.start, lt: week.end } },
      _sum: { amountPaise: true },
    });
    const eligible = groups.filter((g) => (g._sum.amountPaise ?? 0) > 0);

    const paid = await tx.payout.findMany({ where: { weekStart: week.date }, select: { practitionerId: true } });
    const paidIds = new Set(paid.map((p) => p.practitionerId));

    const data = eligible
      .filter((g) => !paidIds.has(g.practitionerId))
      .map((g) => ({
        practitionerId: g.practitionerId,
        weekLabel: week.label,
        weekStart: week.date,
        ...calculatePayout(g._sum.amountPaise!),
      }));

    const { count } = await tx.payout.createMany({ data, skipDuplicates: true });

    return {
      week: week.label,
      created: count,
      skipped: eligible.length - count, 
      totalNetPaise: data.reduce((s, d) => s + d.netPaise, 0),
    };
  });
}

export async function getMyPayouts(practitionerId: string) {
  const rows = await prisma.payout.findMany({ where: { practitionerId }, orderBy: { weekStart: 'desc' } });
  return {
    payouts: rows.map((r) => ({
      id: r.id, week: r.weekLabel, grossPaise: r.grossPaise, platformSharePaise: r.platformSharePaise,
      tdsPaise: r.tdsPaise, netPaise: r.netPaise, createdAt: r.createdAt,
    })),
  };
}