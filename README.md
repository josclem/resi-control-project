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

Las cuentas con perfil `RESIDENTE` se asocian individualmente a una persona residente activa. El portal permite consultar únicamente el perfil y las encomiendas de esa persona; no expone listas generales, movimientos de acceso ni notas internas de portería. Para solicitar la activación, administración comparte con el residente el enlace de WhatsApp que se muestra en el detalle de la persona. El residente debe abrirlo desde su propio celular y enviar el mensaje prellenado `ACTIVAR PORTAL`; la API valida la firma del webhook de Meta, asocia el remitente con su teléfono registrado y responde dentro de la conversación iniciada con un enlace de activación de un solo uso, válido por 24 horas. El mensaje entrante queda auditado como autorización previa para responder por WhatsApp. Reenviar una solicitud invalida el enlace anterior; administración también puede revocar una invitación pendiente. El residente abre el enlace y crea su correo y contraseña (mínimo 12 caracteres). El consentimiento para futuros avisos de encomiendas es independiente, opcional y revocable desde el portal.

El residente puede aceptar o rechazar los avisos durante la activación y cambiar su decisión desde el portal; cada cambio queda registrado. En este alcance solo se envían invitaciones: los avisos automáticos de encomiendas aún no están conectados.

El número de WhatsApp Business al que los residentes escribirán se configura en **Configuración → Número de WhatsApp**. La integración requiere una cuenta de Meta Business Platform y estas variables en `apps/api/.env`: `RESIDENT_PORTAL_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `META_APP_SECRET`. Configura en el panel de Meta el callback HTTPS `https://<API_PUBLICA>/api/webhooks/whatsapp`, usa el mismo token de verificación y suscríbete al campo `messages`. Meta usa `META_APP_SECRET` para firmar las notificaciones entrantes. En `apps/web/.env`, configura `VITE_API_URL` con la URL base de la API; el valor predeterminado `http://localhost:4000` solo sirve para desarrollo local. El portal y la API deben estar publicados con HTTPS para probar desde celulares. El número guardado en cada residencia debe corresponder al número emisor conectado a `WHATSAPP_PHONE_NUMBER_ID`. El flujo de solicitud no requiere una plantilla aprobada; aun así, Meta factura los mensajes de servicio según sus tarifas vigentes. No guardes el token de Meta ni el secreto de la app en la base de datos, el repositorio ni el chat.

### Prueba local del webhook con túneles HTTPS

No es necesario desplegar el proyecto para probarlo: la API, la web y la base de datos pueden seguir ejecutándose en el computador. Meta y el celular no pueden acceder directamente a `localhost`, así que en la siguiente sesión se debe iniciar un túnel HTTPS temporal hacia cada servicio local (API en el puerto `4000` y web/Vite en el `5173`). Se puede usar una herramienta como ngrok o Cloudflare Tunnel; aún no se ha elegido ni configurado una.

Al iniciar la prueba:

1. Levanta API y web con `npm run dev` y crea los dos túneles. Mantén abiertos el computador, ambos servidores y los túneles mientras pruebas; las URLs temporales pueden cambiar al reiniciarlos.
2. En `apps/api/.env`, configura `RESIDENT_PORTAL_URL` con la URL HTTPS del túnel web, `WEB_ORIGIN` con el origen HTTPS del túnel web, y conserva las credenciales de Meta en las variables indicadas arriba.
3. En `apps/web/.env`, configura `VITE_API_URL` con la URL HTTPS del túnel API. Reinicia Vite después de cambiarla, porque la URL se incorpora al iniciar el frontend.
4. En Meta, registra como callback la URL HTTPS del túnel API seguida de `/api/webhooks/whatsapp`, y suscríbete a `messages`. Si la URL del túnel cambia, actualiza el callback en Meta y las variables afectadas.
5. Inicia sesión en la web abierta mediante el túnel, comparte el enlace de WhatsApp del residente de prueba y envía `ACTIVAR PORTAL` desde el teléfono cuyo número está registrado para esa persona.

La API y la base de datos seguirán siendo locales; el túnel solo expone temporalmente los puertos para esta prueba. No compartas las URLs del túnel ni credenciales públicamente, y detén los túneles al terminar. Antes de empezar, verifica que los túneles puedan conectar con servicios locales y que Meta permita registrar una URL temporal. No se ha probado aún el flujo real contra Meta.

Después de cambiar el esquema, regenera Prisma y sincroniza la base de datos de desarrollo prevista con `npm run db:generate` y `npm run db:push`; verifica `DATABASE_URL` antes de sincronizar. No ejecutes `db:seed` para este cambio.

La conexión con lectores de huella y puertas se implementará mediante un adaptador de dispositivo cuando se conozcan fabricante, protocolo, SDK y modo de instalación.

## Contexto y especificaciones

El contexto permanente del proyecto está en `.kiro/steering`. La especificación y el estado de implementación del MVP están en `.kiro/specs/access-control`. La especificación de encomiendas está en `.kiro/specs/encomiendas`.

## Enfoque de producto

El proyecto se desarrollará primero como un MVP operativo para portería, no como una plataforma gigante. La prioridad es validar con conjuntos reales que el login, el registro de residentes/visitantes, las entradas/salidas, las encomiendas y los reportes resuelven un problema suficientemente importante. La notificación al residente, la autorización móvil, la biometría y la integración con hardware de puertas quedan como fases posteriores sujetas a validación.
