import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createApp } from './server.js';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio');

const prisma = new PrismaClient();
const app = createApp(prisma, jwtSecret);
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => console.log(`Resi Control API escuchando en http://localhost:${port}`));
