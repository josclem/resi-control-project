import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createApp, markExpiredVisits } from './server.js';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio');

const prisma = new PrismaClient();
const app = createApp(prisma, jwtSecret);
const port = Number(process.env.PORT ?? 4000);

setInterval(() => {
  markExpiredVisits(prisma).catch((error: unknown) => {
    console.error('No se pudieron marcar las visitas vencidas como NOSHOW.', error);
  });
}, 60_000).unref();
markExpiredVisits(prisma).catch((error: unknown) => {
  console.error('No se pudieron actualizar las visitas vencidas al iniciar la API.', error);
});

app.listen(port, () => console.log(`Resi Control API escuchando en http://localhost:${port}`));
