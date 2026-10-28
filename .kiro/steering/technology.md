# Resi Control - Convenciones técnicas

## Stack aprobado

- Node.js 20 o superior.
- TypeScript con modo estricto.
- API: Express.
- Frontend: React + Vite.
- ORM: Prisma.
- Base de datos: PostgreSQL 16 o superior en desarrollo local.
- Autenticación: JWT.
- Contraseñas: bcrypt.
- Carga de archivos: Multer.
- Lectura de códigos: `@zxing/browser` y `@zxing/library`.
- Generación de códigos: `qrcode` y `jsbarcode`.

## Organización

- `apps/api`: backend, Prisma y API HTTP.
- `apps/web`: frontend React.
- `.kiro/steering`: contexto permanente y convenciones.
- `.kiro/specs`: especificaciones por funcionalidad.

## Persistencia

- Usar Prisma para acceder a la base de datos.
- No escribir SQL específico del motor salvo que sea estrictamente necesario.
- La conexión se configura mediante `DATABASE_URL`.
- Las migraciones o sincronización deben ejecutarse desde los scripts del workspace de API.
- En desarrollo se usa `db:push`; cuando haya datos que conservar, usar `--accept-data-loss` solo con confirmación explícita.
- En Windows, `prisma generate` puede fallar con `EPERM` si la API está corriendo. Detener solo el proceso de la API del proyecto antes de regenerar.
- No guardar huellas dactilares crudas. Guardar únicamente una referencia/token del proveedor si el hardware lo requiere.
- Los `accessCode` de personas y vehículos son cadenas hexadecimales de 32 caracteres. No cambiarlos de formato sin actualizar el escáner y las credenciales impresas.

## Seguridad

- Nunca incluir secretos reales en el repositorio.
- Mantener `.env` fuera del control de versiones.
- Validar entradas HTTP con Zod.
- Aplicar autenticación y autorización en cada endpoint protegido.
- Filtrar siempre por `residenceId` del usuario autenticado.
- Usar hash de contraseña; nunca comparar ni guardar contraseñas en texto plano.
- Registrar quién creó cada movimiento de acceso y quién recibió o entregó cada encomienda.
- Enviar `Cache-Control: no-store` en las respuestas de la API para no servir códigos o datos obsoletos.
- No registrar en logs contraseñas, tokens ni el contenido de `.env`.

## Calidad

- Mantener cambios pequeños y enfocados.
- Reutilizar tipos y helpers existentes antes de duplicar lógica.
- Toda funcionalidad nueva debe incluir criterios verificables y actualizar la spec correspondiente.
- Ejecutar `npm run build` después de cambios en frontend o backend.
- Probar los endpoints nuevos contra la API local antes de darlos por terminados.
- Para cambios de interfaz, verificar al menos el render en navegador y el flujo principal.

## Convenciones del frontend

- La interfaz está en español; el código y la API en inglés.
- `apps/web/src/main.tsx` concentra la aplicación. Mantener el estilo existente y evitar introducir frameworks de UI nuevos.
- Usar los patrones existentes: `panel`, `form-grid`, `modal-backdrop`, `modal-panel`, `row`, `small-button`, `secondary`, `notice` y `success`.
- `apps/web/src/styles.css` contiene reglas y media queries duplicadas de iteraciones anteriores. Al agregar estilos, usar selectores suficientemente específicos (por ejemplo `.table .row.delivery-row`) para no ser pisados por reglas `.row` posteriores.
- Las listas nuevas deben respetar el ancho del panel y no generar scroll horizontal.
- Los formularios modales deben cerrarse al hacer clic fuera y detener la propagación dentro del panel.

## Convenciones de la API

- Un esquema Zod por cuerpo de entrada.
- Rutas protegidas con `requireAuth`.
- Devolver `404` cuando el recurso no existe en la residencia y `409` cuando el estado impide la operación.
- Las transiciones de estado no se hacen con `PATCH` genérico: usar rutas explícitas como `PUT /api/deliveries/:id/status`.
- No permitir que el cliente envíe el usuario que registra una acción; tomarlo del token.
