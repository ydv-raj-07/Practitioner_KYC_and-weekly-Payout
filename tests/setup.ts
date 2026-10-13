import { afterAll } from 'vitest';
import { prisma } from '../src/db.js';

afterAll(() => prisma.$disconnect());