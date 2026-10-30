# Resi Control

MVP para gestionar el acceso de residentes y visitantes de un conjunto residencial, incluyendo el control de encomiendas en portería.

## Stack

- **API:** Node.js, Express, TypeScript, Prisma y PostgreSQL.
- **Frontend:** React, Vite y TypeScript.
- **Autenticación:** JWT con perfiles `SUPER_ADMINISTRADOR`, `ADMINISTRADOR`, `VIGILANTE` y `RESIDENTE`.
- **Biometría:** preparada como integración posterior; el sistema guarda el identificador de la plantilla, no datos biométricos crudos.

## Inicio rápido

1. Instalar Node.js 20 o superior y PostgreSQL 16 o superior.
2. Ejecutar `npm install`.
3. Copiar `apps/api/.env.example` como `apps/api/.env` y completar `DATABASE_URL` y `JWT_SECRET`.
4. Ejecutar `npm run db:generate`, `npm run db:push` y `npm run db:seed`.
5. Iniciar con `npm run dev`.

Usuario inicial de desarrollo: `admin@resicontrol.local` / `Admin123!`. Debe cambiarse antes de usar el sistema en producción.

La API queda en `http://localhost:4000` y el frontend en `http://localhost:5173`.

## Pruebas automatizadas

Desde la raíz del proyecto:

- `npm test` ejecuta pruebas unitarias sin conectarse a PostgreSQL.
- `npm run test:integration` ejecuta pruebas de rutas y persistencia; requiere una base PostgreSQL exclusiva llamada `resi_control_test`.
- `npm run build` valida tipos y compila API y frontend.

En cada pull request hacia `main` y en cada push a `main`, GitHub Actions ejecuta las tres validaciones usando PostgreSQL 16 aislado para las pruebas de integración.

Para preparar la base de integración en PowerShell, configura `DATABASE_URL_TEST` con las credenciales de PostgreSQL y el nombre reservado, y úsala explícitamente al crear el esquema:

```powershell
$env:DATABASE_URL_TEST = "postgresql://postgres:postgres@localhost:5432/resi_control_test"
$env:DATABASE_URL = $env:DATABASE_URL_TEST
npm run db:push
Remove-Item Env:DATABASE_URL
npm run test:integration
```

La suite de integración no usa el `.env` de desarrollo: requiere `DATABASE_URL_TEST` y rechaza cualquier base cuyo nombre no sea exactamente `resi_control_test`; también bloquea la ejecución con `NODE_ENV=production`. Sus fixtures son únicos por ejecución y se limpian al finalizar. Nunca configures la URL de desarrollo o producción en `DATABASE_URL_TEST`.

La API exporta `createApp` desde `apps/api/src/server.ts`; el arranque que escucha en el puerto está separado en `apps/api/src/index.ts`, para que las pruebas HTTP no abran un puerto real.

## Flujo de ramas

`main` es la rama principal y el punto de partida para el trabajo. Las funciones y correcciones se desarrollan y prueban en su propia rama; `production` se reserva para preparar exactamente el código que se publicará.

1. **Crear una rama de trabajo desde `main` actualizado.** Usa un nombre descriptivo, por ejemplo `feature/reportes-encomiendas` o `fix/duplicated-access-movement`.
2. **Desarrollar y probar en esa misma rama.** Haz commits pequeños y descriptivos. Corrige allí los problemas encontrados y repite las pruebas; no cambies de rama para continuar ese trabajo.
3. **Integrar en `main` cuando la rama esté validada.** Usa un pull request de la rama de trabajo a `main`. `main` contiene el trabajo integrado y probado, y sirve de base para las siguientes ramas.
4. **Preparar una publicación en `production` cuando se decida qué versión lanzar.** Crea o actualiza `production` desde el commit aprobado de `main` que se publicará. Esa rama representa el código candidato/de producción; allí se hacen las comprobaciones finales de publicación, no el desarrollo habitual.
5. Si la validación de una rama de trabajo falla, continúa corrigiendo y probando en esa rama. Si falla la validación de publicación, corrige el cambio en una rama de trabajo, intégralo en `main` tras validarlo y actualiza `production` con el código aprobado.

No trabajes directamente sobre `main` ni `production`. Mantén las ramas actualizadas con el remoto y no incluyas archivos locales, secretos ni artefactos generados en los commits. La rama `qa` existente es histórica y no forma parte del flujo actual.

## Modelo inicial

Se separan residentes, visitantes y usuarios del sistema. Un residente o visitante puede tener múltiples registros de acceso. Cada registro conserva tipo de acceso, fecha/hora, nombre y apartamento. Las encomiendas se asocian a una persona y conservan tipo, estado, remitente, guía, fecha de recepción y datos de entrega. Los nombres de perfiles son datos de configuración del dominio y pueden cambiarse más adelante sin afectar el flujo.

Las cuentas con perfil `RESIDENTE` se asocian individualmente a una persona residente activa. El portal permite consultar únicamente el perfil y las encomiendas de esa persona; no expone listas generales, movimientos de acceso ni notas internas de portería. La creación y activación de cuentas queda pendiente de la invitación segura y la verificación por WhatsApp; no se deben habilitar cuentas residentes manualmente antes de completar ese flujo.

El número celular dedicado para WhatsApp Business se configura en **Configuración → Número de WhatsApp** y se guarda por residencia en formato internacional. Este dato solo identifica el número previsto: no conecta con Meta ni envía mensajes. Para habilitar envíos se necesita completar la configuración de Meta Business Platform por separado; sus tokens y credenciales no deben guardarse en este campo.

La conexión con lectores de huella y puertas se implementará mediante un adaptador de dispositivo cuando se conozcan fabricante, protocolo, SDK y modo de instalación.

## Contexto y especificaciones

El contexto permanente del proyecto está en `.kiro/steering`. La especificación y el estado de implementación del MVP están en `.kiro/specs/access-control`. La especificación de encomiendas está en `.kiro/specs/encomiendas`.

## Enfoque de producto

El proyecto se desarrollará primero como un MVP operativo para portería, no como una plataforma gigante. La prioridad es validar con conjuntos reales que el login, el registro de residentes/visitantes, las entradas/salidas, las encomiendas y los reportes resuelven un problema suficientemente importante. La notificación al residente, la autorización móvil, la biometría y la integración con hardware de puertas quedan como fases posteriores sujetas a validación.
