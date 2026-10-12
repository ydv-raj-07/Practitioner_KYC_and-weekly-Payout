import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';

const server = createApp().listen(config.port, () => console.log(`http://localhost:${config.port}`));

const shutdown = () => server.close(() => prisma.$disconnect().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);