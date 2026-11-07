# Accivia

MVP para gestionar el acceso de residentes y visitantes de un conjunto residencial, incluyendo el control de encomiendas en portería.

## Stack

- **API:** Node.js, Express, TypeScript, Prisma y PostgreSQL.
- **Frontend:** React, Vite y TypeScript.
- **Autenticación:** JWT con perfiles de sistema `SUPER_ADMINISTRADOR`, `ADMINISTRADOR`, `VIGILANTE` y `RESIDENTE`, además de roles personalizados con permisos granulares por residencia. El SuperAdministrador puede seleccionar la residencia activa.
- **Biometría:** preparada como integración posterior; el sistema guarda el identificador de la plantilla, no datos biométricos crudos.

## Inicio rápido

1. Instalar Node.js 20 o superior y PostgreSQL 16 o superior.
2. Ejecutar `npm install`.
3. Copiar `apps/api/.env.example` como `apps/api/.env` y completar `DATABASE_URL` y `JWT_SECRET`.
4. Ejecutar `npm run db:generate`, `npm run db:push` y `npm run db:seed`.
5. Iniciar con `npm run dev`.

Usuario inicial de desarrollo: `admin@accivia.local` / `Admin123!`. Debe cambiarse antes de usar el sistema en producción.

La gestión de usuarios y roles permite crear, editar y desactivar cuentas, y administrar roles personalizados. El **SuperAdministrador** dispone además de la sección **Residencias**, desde la que puede crear nuevas residencias indicando nombre y código interno; las nuevas residencias comienzan con bloqueo de movimientos irregulares y captura manual. La administración de la residencia decide si asigna una cuenta individual a cada portero o usa una cuenta compartida; las cuentas individuales permiten atribuir los registros de portería a cada operador. El botón **Cerrar sesión** está disponible en el portal de residente y la interfaz de administración. Las cuentas de residentes continúan activándose por invitación; la administración ordinaria no elimina cuentas ni sus registros históricos.

La API queda en `http://localhost:4000` y el frontend en `http://localhost:5173`.

## Invitaciones de residentes por Gmail

La administración puede invitar por correo a una persona residente que ya esté registrada. La ficha del residente guarda su correo de contacto y el formulario de invitación lo prellena; al invitar o reenviar, la dirección utilizada se actualiza en la ficha. El enlace es de un solo uso y vence en 48 horas; el residente define su propia contraseña y queda asociado a ese registro de persona y residencia. La invitación no concede permisos administrativos. Las cuentas activadas pueden iniciar sesión en el portal de residentes.

## Prerregistros y control de visitas

El residente autoriza sus visitas desde el portal. Puede indicar visitante, documento, observaciones y vehículo opcionales, y ajustar el inicio y fin con controles de fecha y hora; por defecto, la vigencia inicia ahora y termina a la medianoche del día actual (00:00 del día siguiente). Ambos horarios son editables. El residente puede cancelar una visita autorizada que todavía no haya ingresado.

Si una visita llega sin prerregistro, portería puede registrarla después de contactar al residente por el proceso habitual y confirmar su autorización. El sistema guarda el origen `PORTERIA`, el usuario que hizo el registro y la confirmación de autorización externa; no realiza ni verifica la llamada.

Al llegar, portería puede buscar el prerregistro por nombre, documento o placa, y registra la entrada desde la lista de visitas vigentes; se crea el registro del visitante y su movimiento de entrada enlazado al prerregistro. La salida se registra desde la misma visita y queda enlazada al mismo historial. Una visita autorizada que vence sin registrar entrada pasa a `NOSHOW`; la API actualiza estos estados al iniciar y cada minuto, y al consultar las visitas.

Las fechas y horas se interpretan en la zona horaria local del navegador. La zona horaria oficial de cada residencia sigue pendiente de definirse antes de desplegar para varias regiones.

Para Gmail:

1. Activa la verificación en dos pasos en la cuenta que enviará los mensajes.
2. Crea una **contraseña de aplicación** desde la configuración de seguridad de Google. Usa esa contraseña, no la contraseña normal de Gmail. Google puede no ofrecer esta opción en cuentas administradas o protegidas con Advanced Protection.
3. Completa las variables en `apps/api/.env`:

   ```dotenv
   WEB_APP_URL="http://localhost:5173"
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER="accivia.co@gmail.com"
   SMTP_APP_PASSWORD="contraseña-de-aplicación"
   EMAIL_FROM="Accivia <accivia.co@gmail.com>"
   RESEND_API_KEY=""
   ```

   `SMTP_USER` y el correo de `EMAIL_FROM` deben pertenecer a la cuenta Gmail autorizada. En este proyecto la cuenta remitente es `accivia.co@gmail.com`. Para Render, puedes usar Resend con `RESEND_API_KEY` y `EMAIL_FROM="Accivia <onboarding@resend.dev>"`; Resend se usa automáticamente y evita conexiones SMTP bloqueadas. Mantén `.env` fuera de Git y no compartas ni registres ninguna clave.
4. Reinicia la API después de cambiar `.env`.

`http://localhost:5173` solo sirve para probar el enlace en el mismo equipo donde corre la aplicación. Antes de invitar residentes reales, publica el frontend y la API bajo HTTPS; configura `WEB_APP_URL` y `WEB_ORIGIN` en `apps/api/.env`, y `VITE_API_URL` en `apps/web/.env` antes de compilar el frontend. Luego se puede cambiar Gmail por un proveedor SMTP del dominio propio sin cambiar el flujo de invitación.

El bloqueo observado con Avast Free afecta la conexión SMTP de la API ejecutada localmente en Windows; no implica que Avast vaya a intervenir cuando la API se ejecute en un servidor de producción. Antes de publicar, verifica desde el entorno de hosting que permita conexiones salientes al SMTP elegido (Gmail usa TCP 465 con esta configuración), que confíe en los certificados TLS y que acepte sus credenciales. Configura las credenciales como secretos del hosting, nunca en el repositorio. Si el proveedor de hosting bloquea SMTP, usa un proveedor de correo con API o un canal SMTP compatible; no desactives la validación TLS.

## Pruebas automatizadas

Desde la raíz del proyecto:

- `npm test` ejecuta pruebas unitarias sin conectarse a PostgreSQL.
- `npm run test:integration` ejecuta pruebas de rutas y persistencia; requiere una base PostgreSQL exclusiva llamada `accivia_test`.
- `npm run build` valida tipos y compila API y frontend.

En cada pull request hacia `main` y en cada push a `main`, GitHub Actions ejecuta las tres validaciones usando PostgreSQL 16 aislado para las pruebas de integración.

Para preparar la base de integración en PowerShell, configura `DATABASE_URL_TEST` con las credenciales de PostgreSQL y el nombre reservado, y úsala explícitamente al crear el esquema:

```powershell
$env:DATABASE_URL_TEST = "postgresql://postgres:postgres@localhost:5432/accivia_test"
$env:DATABASE_URL = $env:DATABASE_URL_TEST
npm run db:push
Remove-Item Env:DATABASE_URL
npm run test:integration
```

La suite de integración no usa el `.env` de desarrollo: requiere `DATABASE_URL_TEST` y rechaza cualquier base cuyo nombre no sea exactamente `accivia_test`; también bloquea la ejecución con `NODE_ENV=production`. Sus fixtures son únicos por ejecución y se limpian al finalizar. Nunca configures la URL de desarrollo o producción en `DATABASE_URL_TEST`.

La API exporta `createApp` desde `apps/api/src/server.ts`; el arranque que escucha en el puerto está separado en `apps/api/src/index.ts`, para que las pruebas HTTP no abran un puerto real.

## Flujo de ramas

`main` es la rama principal y el punto de partida para el trabajo. Las funciones y correcciones se desarrollan y prueban en su propia rama; `production` se reserva para preparar exactamente el código que se publicará.

1. **Crear una rama de trabajo desde `main` actualizado.** Usa un nombre descriptivo, por ejemplo `feature/reportes-encomiendas` o `fix/duplicated-access-movement`.
2. **Desarrollar y probar en esa misma rama.** Haz commits pequeños y descriptivos. Corrige allí los problemas encontrados y repite las pruebas; no cambies de rama para continuar ese trabajo.
3. **Integrar en `main` cuando la rama esté validada.** Usa un pull request de la rama de trabajo a `main`. `main` contiene el trabajo integrado y probado, y sirve de base para las siguientes ramas.
4. **Preparar una publicación en `production` cuando se decida qué versión lanzar.** Crea o actualiza `production` desde el commit aprobado de `main` que se publicará. Esa rama representa el código candidato/de producción; allí se hacen las comprobaciones finales de publicación, no el desarrollo habitual.
5. Si la validación de una rama de trabajo falla, continúa corrigiendo y probando en esa rama. Si falla la validación de publicación, corrige el cambio en una rama de trabajo, intégralo en `main` tras validarlo y actualiza `production` con el código aprobado.

No trabajes directamente sobre `main` ni `production`. Mantén las ramas actualizadas con el remoto y no incluyas archivos locales, secretos ni artefactos generados en los commits. La rama `qa` existente es histórica y no forma parte del flujo actual.

**Herramientas Git:** este proyecto no usa GitKraken. Crear ramas, revisar cambios, hacer commits y push se realiza con Git; los pull requests y la revisión de CI se gestionan directamente en GitHub.

## Modelo inicial

Se separan residentes, visitantes y usuarios del sistema. Un residente o visitante puede tener múltiples registros de acceso. Cada registro conserva tipo de acceso, fecha/hora, nombre y apartamento. Las encomiendas se asocian a una persona y conservan tipo, estado, remitente, guía, fecha de recepción y datos de entrega. Los nombres de perfiles son datos de configuración del dominio y pueden cambiarse más adelante sin afectar el flujo.

La conexión con lectores de huella y puertas se implementará mediante un adaptador de dispositivo cuando se conozcan fabricante, protocolo, SDK y modo de instalación.

## Contexto y especificaciones

El contexto permanente del proyecto está en `.kiro/steering`. La especificación y el estado de implementación del MVP están en `.kiro/specs/access-control`. La especificación de encomiendas está en `.kiro/specs/encomiendas`.

## Enfoque de producto

El proyecto se desarrollará primero como un MVP operativo para portería, no como una plataforma gigante. La prioridad es validar con conjuntos reales que el login, el registro de residentes/visitantes, las entradas/salidas, las encomiendas y los reportes resuelven un problema suficientemente importante. La notificación al residente, la autorización móvil, la biometría y la integración con hardware de puertas quedan como fases posteriores sujetas a validación.
