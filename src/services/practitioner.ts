import type { PractitionerStatus } from '../../generated/prisma/enums.js';
import { decrypt, encrypt, hashPan } from '../crypto.js';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';

export const ALLOWED: Record<PractitionerStatus, PractitionerStatus[]> = {
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

const deriveDisplayName = (name: string) => {
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`;
};

export async function apply(i: { name: string; displayName?: string; pan: string; phone: string; skills: string[] }) {
  try {
    return await prisma.practitioner.create({
      data: {
        displayName: i.displayName ?? deriveDisplayName(i.name),
        nameEnc: encrypt(i.name),
        panEnc: encrypt(i.pan),
        phoneEnc: encrypt(i.phone),
        panHash: hashPan(i.pan),
        skills: i.skills,
      },
      
      select: { id: true, displayName: true, skills: true, status: true, createdAt: true },
    });
  } catch (e: any) {
    if (e.code === 'P2002') throw new AppError(409, 'DUPLICATE_PAN', 'An application with this PAN already exists');
    throw e;
  }
}

export function changeStatus(id: string, to: PractitionerStatus, actor: { id: string; role: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.practitioner.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new AppError(404, 'NOT_FOUND', 'Practitioner not found');

    const from = current.status;
    if (!ALLOWED[from].includes(to)) {
      throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot move from "${from}" to "${to}"`);
    }

    const { count } = await tx.practitioner.updateMany({ where: { id, status: from }, data: { status: to } });
    if (count === 0) throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Status was changed by someone else');

    await tx.auditLog.create({
      data: {
        actorId: actor.id, actorRole: actor.role, action: 'STATUS_CHANGED',
        resourceType: 'Practitioner', resourceId: id, metadata: { from, to },
      },
    });
    return { id, previousStatus: from, status: to };
  });
}

export function viewIdentity(id: string, actor: { id: string; role: string }) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.practitioner.findUnique({ where: { id } });
    if (!p) throw new AppError(404, 'NOT_FOUND', 'Practitioner not found');

    await tx.auditLog.create({
      data: { actorId: actor.id, actorRole: actor.role, action: 'IDENTITY_VIEWED', resourceType: 'Practitioner', resourceId: id },
    });

    return {
      id: p.id, displayName: p.displayName, status: p.status,
      name: decrypt(p.nameEnc), pan: decrypt(p.panEnc), phone: decrypt(p.phoneEnc),
    };
  });
}