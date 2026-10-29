import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const residence = await prisma.residence.upsert({
    where: { code: 'RESI-LOCAL' },
    update: { name: 'Residencia de desarrollo', active: true },
    create: { code: 'RESI-LOCAL', name: 'Residencia de desarrollo' },
  });

  await prisma.systemSetting.upsert({
    where: { residenceId_key: { residenceId: residence.id, key: 'irregular_access_mode' } },
    update: {},
    create: { residenceId: residence.id, key: 'irregular_access_mode', value: 'BLOCK' },
  });

  const documentTypes = [
    { code: 'CC', name: 'Cédula de ciudadanía' },
    { code: 'CE', name: 'Cédula de extranjería' },
    { code: 'PPT', name: 'Permiso por protección temporal' },
    { code: 'TI', name: 'Tarjeta de identidad' },
    { code: 'RC', name: 'Registro civil' },
    { code: 'PA', name: 'Pasaporte' },
    { code: 'NIT', name: 'Número de identificación tributaria' },
  ];
  for (const documentType of documentTypes) {
    await prisma.documentType.upsert({
      where: { code: documentType.code },
      update: { name: documentType.name, active: true },
      create: documentType,
    });
  }

  const passwordHash = await bcrypt.hash('Admin123!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@resicontrol.local' },
    update: { passwordHash, name: 'Administrador principal', role: UserRole.SUPER_ADMINISTRADOR, active: true, residenceId: residence.id },
    create: {
      name: 'Administrador principal',
      email: 'admin@resicontrol.local',
      passwordHash,
      role: UserRole.SUPER_ADMINISTRADOR,
      residenceId: residence.id,
    },
  });
  console.log('Usuario inicial creado: admin@resicontrol.local / Admin123!');
}

main().finally(() => prisma.$disconnect());
