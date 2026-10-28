# Tareas: Control de acceso residencial

## Completado

- [x] Crear monorepo TypeScript con API y frontend.
- [x] Configurar Prisma para PostgreSQL.
- [x] Crear modelos de usuarios, personas y movimientos.
- [x] Implementar login JWT.
- [x] Implementar seed del administrador inicial.
- [x] Implementar dashboard inicial con últimos 10 movimientos.
- [x] Implementar endpoints básicos de personas, accesos y reportes.
- [x] Instalar PostgreSQL en Windows y crear `resi_control`.
- [x] Configurar `apps/api/.env` con `DATABASE_URL`.
- [x] Ejecutar `db:generate`, `db:push` y `db:seed`.
- [x] Probar login real contra PostgreSQL.
- [x] Crear pantalla de gestión de residentes y visitantes.
- [x] Crear pantalla de registro de entrada/salida para vigilancia.
- [x] Agregar fotografías de personas y vehículos.
- [x] Agregar `accessCode` seguro, QR y código de barras.
- [x] Implementar escaneo automático con cámara y lector USB.
- [x] Implementar movimientos irregulares con bloqueo o supervisor.
- [x] Agregar configuración de residencia y logo.
- [x] Verificar compilación con `npm run build`.

## Próximo orden recomendado

- [ ] Crear administración de usuarios y roles.
- [ ] Diseñar la app de residentes para pre-registrar visitas peatonales o vehiculares y notificar su llegada (solo planificado).
- [ ] Agregar filtros y exportación del reporte de accesos.
- [ ] Definir política de edición/anulación de movimientos.
- [ ] Documentar requisitos del lector biométrico y puerta.
- [ ] Resolver el movimiento duplicado de Jose Rojas con modo `BLOCK`.
- [ ] Limpiar CSS duplicado y código muerto en el frontend.

## Decisiones pendientes

- Política para visitantes: autorización previa, vigencia y persona que autoriza.
- Si un visitante puede entrar varias veces en un mismo día.
- Reglas para impedir una salida sin entrada previa.
- Zona horaria oficial del conjunto.
- Formatos de exportación de reportes.
- Proveedor de PostgreSQL en la nube.

## Validación de producto pendiente

- [ ] Entrevistar administradores, vigilantes y miembros de consejos de conjuntos en Bogotá.
- [ ] Confirmar los tres problemas operativos más frecuentes.
- [ ] Observar el flujo real de registro en una portería.
- [ ] Validar si el flujo principal puede aprenderse en 10 minutos.
- [ ] Conseguir un conjunto para piloto de 30 días.
- [ ] Medir registros diarios, tiempo de atención, errores y uso de reportes.
- [ ] Validar disposición de pago antes de construir funciones avanzadas.
