# Accivia: contexto del proyecto

## Propósito

Accivia es un sistema web para administrar el control de acceso de una residencia. El sistema maneja personas, vehículos, fotografías, movimientos de entrada y salida, configuración de la residencia y diferentes formas de identificar a una persona o vehículo. También administra las encomiendas que llegan a la portería —comida, paquetes, recibos de servicios y correo— y su entrega a los residentes.

El proyecto está ubicado en:

`C:\Users\klement\resi-control-project`

El entorno actual usa Windows, PostgreSQL local y una API Express con frontend React/Vite.

## Arquitectura actual

### Backend

- Ubicación: [apps/api/](C:/Users/klement/resi-control-project/apps/api/)
- Express + TypeScript.
- Prisma como ORM.
- PostgreSQL como base de datos.
- JWT para autenticación.
- Multer para cargar fotografías.
- Zod para validar entradas.
- La API normalmente corre en el puerto `4000`.

Archivo principal:

- [server.ts](C:/Users/klement/resi-control-project/apps/api/src/server.ts)

### Frontend

- Ubicación: [apps/web/](C:/Users/klement/resi-control-project/apps/web/)
- React 18 + TypeScript.
- Vite.
- La aplicación normalmente corre en el puerto `5173`.

Archivos principales:

- [main.tsx](C:/Users/klement/resi-control-project/apps/web/src/main.tsx)
- [styles.css](C:/Users/klement/resi-control-project/apps/web/src/styles.css)

### Base de datos

- Esquema Prisma: [schema.prisma](C:/Users/klement/resi-control-project/apps/api/prisma/schema.prisma)
- Base de datos local: PostgreSQL `accivia`.
- El archivo `.env` del backend contiene la conexión y el secreto JWT. No se deben copiar sus valores a documentación ni al repositorio.

## Funcionalidades implementadas

### Autenticación y residencia

- Inicio de sesión con JWT.
- Roles del sistema:
  - `SUPER_ADMINISTRADOR`
  - `ADMINISTRADOR`
  - `VIGILANTE`
  - `RESIDENTE`
  - `PERSONALIZADO`, asociado a un rol configurable.
- Aislamiento por residencia mediante `residenceId`.
- El usuario, su estado y su rol se vuelven a validar desde PostgreSQL en cada solicitud autenticada; los permisos de un rol personalizado no se confían al token.
- El `SUPER_ADMINISTRADOR` tiene alcance global, puede crear otras cuentas globales y selecciona la residencia activa mediante `X-Residence-Id`. El rol global no se cambia desde la edición ordinaria. Los demás roles no pueden cambiar de residencia.
- Administradores y roles personalizados con permiso de gestión operan dentro de su residencia. Solo pueden asignar roles cuyos permisos no excedan los propios; no pueden crear ni editar cuentas globales.
- Los permisos se eligen de un catálogo central. `RESIDENCES_MANAGE` es exclusivo del SuperAdministrador; los permisos predeterminados del Vigilante siguen limitados a la operación de portería.
- La interfaz de gestión permite crear, editar y desactivar/reactivar usuarios; crear, editar y desactivar roles personalizados. Residentes siguen activándose por invitación, no mediante creación manual de cuentas.
- Las cuentas se desactivan en vez de eliminarse; se conserva el historial. No se puede desactivar la propia cuenta ni dejar una residencia sin un usuario con `USERS_MANAGE`.
- La administración de usuarios y roles está implementada; la ficha del residente guarda correo de contacto y la invitación actualiza ese correo. La cuenta Gmail y la contraseña de aplicación están en `apps/api/.env`, ignorado por Git.
- Si una solicitud autenticada recibe `401`, el frontend elimina la sesión local, limpia los datos protegidos y vuelve al formulario de inicio de sesión.
- Cada residencia puede tener:
  - Nombre.
  - Código.
  - Logo.
- El logo se almacena como binario en PostgreSQL y se devuelve como `data URL`.
- Formatos de logo y fotografías:
  - JPG/JPEG.
  - PNG.
  - WebP.
- Tamaño máximo actual: 2 MB.

### Personas

- CRUD de personas.
- Tipos:
  - Residente.
  - Visitante.
- Campos principales:
  - Nombre completo.
  - Tipo de sector (torre o interior) y su número.
  - Número de apartamento, separado del sector para poder filtrar ambos datos independientemente.
  - Tipo y número de documento.
  - Teléfono.
- Las personas nuevas y editadas registran la ubicación por separado. Los registros anteriores conservan sus datos y requieren completar el sector al editarse; no se interpreta ni transforma automáticamente el apartamento antiguo.
- Validaciones de documentos, teléfonos y registros duplicados.
- Desactivación lógica mediante `active = false`.
- Fotografía persistente en `PersonPhoto`.
- Miniatura visible junto al nombre.
- Diálogo de detalle al hacer clic en la fila.
- Diálogo de edición con datos precargados.
- Gestión de fotografía dentro del diálogo:
  - Subir.
  - Reemplazar.
  - Eliminar.
- Generación visual de:
  - Código QR.
  - Código de barras.
- Descarga del QR como PNG e impresión de una credencial con nombre y código.
- Cada persona tiene un `accessCode` aleatorio y seguro de 32 caracteres hexadecimales.

### Vehículos

- CRUD de vehículos.
- Tipos:
  - Automóvil.
  - Motocicleta.
  - Bicicleta.
  - Otro.
- Asociación obligatoria con una persona de la misma residencia.
- Placa única dentro de cada residencia.
- Campos:
  - Placa.
  - Tipo.
  - Marca.
  - Modelo.
  - Color.
- Desactivación lógica.
- Fotografía persistente en `VehiclePhoto`.
- Miniatura en la grilla principal.
- Diálogo de detalle y edición.
- Gestión de fotografía dentro del diálogo.
- Generación visual de QR y código de barras.
- Descarga e impresión del QR desde el diálogo de detalle.
- Cada vehículo tiene un `accessCode` aleatorio y seguro de 32 caracteres hexadecimales.

### Movimientos

- Registro de entradas y salidas.
- Movimientos peatonales.
- Movimientos asociados a un vehículo.
- En el formulario manual de acceso se busca y selecciona a la persona por nombre o documento; también se puede buscar el vehículo por placa o propietario. Al seleccionar un vehículo queda asociada automáticamente su persona propietaria. El escaneo sigue disponible según la configuración.
- Validación de que el vehículo pertenezca a la persona seleccionada.
- Control de movimientos repetidos:
  - Por persona para movimientos peatonales.
  - Por vehículo para movimientos vehiculares.
- La API serializa el registro de movimientos por persona para que la validación del último movimiento y la creación sean atómicas, incluso si llegan solicitudes simultáneas.
- Modos para movimientos irregulares:
  - Bloquear.
  - Solicitar autorización de supervisor.
- En modo `BLOCK`, dos movimientos consecutivos del mismo tipo se rechazan con `409` (`IRREGULAR_ACCESS`). En modo `SUPERVISOR`, la excepción requiere credenciales válidas y queda asociada al supervisor que la autorizó.
- El caso de movimiento duplicado reportado ocurrió antes de las validaciones actuales. El registro histórico se corrigió con autorización del usuario y el caso quedó resuelto; el control actual serializa las capturas y rechaza movimientos repetidos según el modo configurado. No se deben hacer cambios adicionales al historial sin autorización.
- El escaneo de un vehículo solo acepta propietarios activos dentro de la misma residencia.
- Reporte de últimos movimientos.
- Detalle ampliado al seleccionar un movimiento:
  - Persona.
  - Foto de la persona.
  - Vehículo.
  - Foto del vehículo.
  - Placa, marca, modelo y color.
  - Fecha y hora.

### Encomiendas

- Registro de paquetes, comida, recibos de servicios y correo que llegan a la portería.
- Cada encomienda se asocia a una persona (destinatario) activa de la residencia.
- Tipos (`DeliveryType`):
  - `COMIDA`
  - `PAQUETE`
  - `RECIBO`
  - `CORREO`
  - `OTRO`
- Estados (`DeliveryStatus`):
  - `PENDIENTE`: recibida en portería, aún no entregada.
  - `ENTREGADA`: entregada al destinatario o a quien autorice.
  - `DEVUELTA`: devuelta a la mensajería o al remitente.
- Datos que se guardan:
  - Tipo, estado y mensajería o remitente (`courier`).
  - Descripción breve, número de guía o factura (`trackingCode`) y observaciones.
  - Fecha y hora de recepción y usuario que la recibe (`receivedBy`).
  - Fecha y hora de entrega, usuario que la entrega (`deliveredBy`) y nombre de quien la retira (`deliveredToName`).
- Pantalla "Encomiendas":
  - Contador de pendientes en la navegación y en el tablero.
  - Filtros "Pendientes" y "Todas".
  - Registro mediante formulario modal.
  - Acciones "Entregar" (pide el nombre de quien retira) y "Devolver" (con confirmación).
- Una encomienda cerrada no se puede volver a modificar desde el flujo operativo; la API responde `409`.
- El cierre solo actualiza encomiendas `PENDIENTE`, de forma atómica y dentro de la residencia autenticada. Marcar como entregada exige el nombre de quien la recibe; un filtro `status` inválido en la consulta responde `400`.
- Al iniciar la entrega, el nombre del destinatario se precarga en el campo de quien recibe y puede editarse si retira otra persona.
- Todavía no se notifica automáticamente al residente cuando llega una encomienda.

### Formas de captura de movimientos

La configuración por residencia permite seleccionar:

- Búsqueda manual.
- Código de barras.
- Código QR.
- Huella dactilar, actualmente marcada como próximamente.
- Los ajustes de comportamiento irregular y forma de captura se guardan por separado desde sus respectivos botones; guardar uno mantiene abierto el panel para guardar el otro.

#### Búsqueda manual

- Permite buscar por nombre o documento.
- Permite seleccionar la persona desde una lista.
- El vehículo se puede seleccionar después de escoger la persona.

#### Código QR y código de barras

- Se usa `@zxing/browser` con `@zxing/library` para leer desde la cámara.
- Los lectores USB que funcionan como teclado pueden escribir en el campo de captura.
- La cámara se abre automáticamente al entrar al formulario de movimiento.
- La vista previa es amplia y centrada (aprox. 340 px de ancho, relación 4:3).
- El escaneo es continuo y automático, sin botón de captura (ciclo de aprox. 120 ms).
- El lector se limita al formato configurado:
  - En modo QR solo acepta `QR_CODE`.
  - En modo código de barras solo acepta formatos 1D (Code128, Code39, EAN-13, EAN-8, UPC-A, UPC-E, ITF y Codabar).
- Solo se aceptan lecturas con el formato exacto de `accessCode`: `^[a-f0-9]{32}$`. Cualquier otra lectura se ignora y el escaneo continúa.
- El texto leído y el escrito a mano se normalizan a minúsculas.
- Controles disponibles durante el escaneo:
  - Selector de cámara cuando hay varios dispositivos.
  - Zoom de 1× a 4× (zoom nativo del dispositivo si está disponible; si no, recorte digital).
  - Solicitud de enfoque y exposición continuos cuando la cámara lo permite.
  - Línea de diagnóstico con enfoque, tipo de zoom y cantidad de cuadros procesados.
- El QR se genera a 240 × 240 px con margen de 4 módulos y corrección de errores media.
- Debajo del QR se muestran el código en texto y los botones **Descargar QR** e **Imprimir**.
- El código escaneado se procesa mediante el endpoint:

`POST /api/access/scan`

#### Limitación conocida de la cámara

- Los QR generados por el sistema se verificaron como válidos decodificándolos en un navegador real.
- Con la webcam actual, un QR mostrado en el monitor puede no leerse por foco fijo, moiré y refresco de pantalla.
- El mismo QR impreso en papel se lee con mayor facilidad.
- Por eso se agregaron descarga e impresión de credenciales. La solución definitiva es usar un lector USB o una cámara con autofoco.
- Este punto quedó pausado por decisión del usuario; no se sigue ajustando la cámara por ahora.

#### Comportamiento automático actual

Se decidió que el escaneo registre automáticamente el movimiento, alternando según el último registro:

- Sin movimiento previo o último movimiento de salida: registra entrada.
- Último movimiento de entrada: registra salida.

Si el movimiento requiere supervisor, se conserva la solicitud de autorización y no se completa silenciosamente.

Cuando se escanea un vehículo:

1. Se identifica el vehículo por su `accessCode`.
2. Se identifica automáticamente la persona propietaria.
3. Se consulta el último movimiento de ese vehículo.
4. Se registra la entrada o salida correspondiente.

Cuando se escanea una persona:

1. Se identifica la persona por su `accessCode`.
2. Se consulta el último movimiento peatonal.
3. Se registra la entrada o salida correspondiente.

## Modelo de datos relevante

Los modelos principales de Prisma son:

- `Residence`
- `User`
- `Person`
- `PersonPhoto`
- `Vehicle`
- `VehiclePhoto`
- `DocumentType`
- `AccessLog`
- `SystemSetting`
- `Delivery`

Enums relevantes:

- `DeliveryType`: `COMIDA`, `PAQUETE`, `RECIBO`, `CORREO`, `OTRO`.
- `DeliveryStatus`: `PENDIENTE`, `ENTREGADA`, `DEVUELTA`.

Relaciones de `Delivery`:

- `person`: destinatario (`Person`).
- `residence`: residencia a la que pertenece.
- `receivedBy`: usuario que recibió la encomienda.
- `deliveredBy`: usuario que la entregó (opcional).

Campos agregados recientemente:

- `Person.accessCode`
- `Vehicle.accessCode`
- `Delivery.trackingCode`, `Delivery.deliveredToName`

Configuraciones actuales guardadas en `SystemSetting`:

- `irregular_access_mode`
- `access_capture_mode`

Los valores de `access_capture_mode` son:

- `MANUAL`
- `BARCODE`
- `QR`
- `FINGERPRINT`

## Endpoints importantes

### Autenticación y residencia

- `POST /api/auth/login`
- `GET /api/residence`
- `PUT /api/residence`
- `GET /api/admin/residences` (solo `SUPER_ADMINISTRADOR`)
- `POST /api/admin/residences` (solo `SUPER_ADMINISTRADOR`)

### Personas

- `GET /api/people`
- `POST /api/people`
- `PUT /api/people/:id`
- `DELETE /api/people/:id`
- `PUT /api/people/:id/photo`
- `GET /api/people/:id/photo`
- `DELETE /api/people/:id/photo`

### Vehículos

- `GET /api/vehicles`
- `POST /api/vehicles`
- `PUT /api/vehicles/:id`
- `DELETE /api/vehicles/:id`
- `PUT /api/vehicles/:id/photo`
- `GET /api/vehicles/:id/photo`
- `DELETE /api/vehicles/:id/photo`

### Movimientos

- `GET /api/dashboard`
- `POST /api/access`
- `POST /api/access/scan`

### Encomiendas

- `GET /api/deliveries` — admite el filtro opcional `?status=PENDIENTE|ENTREGADA|DEVUELTA`.
- `POST /api/deliveries`
- `PUT /api/deliveries/:id/status`

El endpoint `GET /api/dashboard` incluye `totals.pendingDeliveries` con el número de encomiendas pendientes.

### Configuración

- `GET /api/settings/irregular-access`
- `PUT /api/settings/irregular-access`
- `GET /api/settings/access-capture`
- `PUT /api/settings/access-capture`

## Decisiones de interfaz tomadas

- La pantalla inicial muestra principalmente los movimientos.
- Personas, vehículos, encomiendas y configuración se muestran por secciones.
- La pestaña "Encomiendas" muestra el número de pendientes en el propio botón.
- El tablero de movimientos tiene cuatro tarjetas: residentes, visitantes, movimientos de hoy y encomiendas pendientes.
- Las filas de personas y vehículos son seleccionables.
- El clic en una fila abre su diálogo de detalle.
- Las acciones de fotografía se movieron desde las filas hacia los diálogos.
- En la grilla de vehículos el orden solicitado es:

  **Foto | Placa | Tipo | Marca | Modelo | Color | Persona | Apartamento | Acciones**

- La grilla de vehículos debe conservar una sola línea, sin scroll horizontal.
- Se intentó mantener el tamaño estándar de miniaturas y botones.
- La tabla de últimos movimientos debe conservar su distribución original y no heredar estilos específicos de vehículos.

## Dependencias agregadas recientemente

En el frontend se agregaron:

- `@zxing/browser`
- `@zxing/library`
- `qrcode`
- `jsbarcode`
- `@types/qrcode`
- `@types/jsbarcode`

Estas dependencias se usan para:

- Lectura de códigos desde cámara.
- Generación visual de QR.
- Generación visual de códigos de barras.

## Comandos habituales

Desde la raíz del proyecto:

```powershell
npm run dev
npm run build
npm run db:generate
npm run db:push
npm run db:seed
```

Para actualizar la base de datos después de cambios en Prisma:

```powershell
npm run db:generate
npm run db:push --workspace @accivia/api -- --accept-data-loss
```

En Windows, si `prisma generate` falla con `EPERM` por el motor bloqueado, hay que detener únicamente el proceso Node de la API que está usando el proyecto y volver a ejecutar `npm run db:generate`. No se deben detener procesos ajenos.

## Estado actual de validación

- Validación manual en navegador (2026-11-04), usando solo `accivia_test`: login, alta de residente/visitante, accesos peatonales y vehiculares, tablero, administración de usuarios y roles, bloqueo de movimiento repetido, autorización de supervisor y encomiendas.
- Validación manual de invitaciones en `accivia_test`: listado de residentes invitables, error claro cuando SMTP no está configurado, activación con contraseña propia, inicio de sesión y pantalla de residente. Los datos temporales se limpiaron.
- `verify()` pasó y se envió una invitación real de prueba al correo indicado por el usuario usando la base local `accivia`; Avast estaba temporalmente desactivado y no se desactivó la validación TLS. El usuario recibió el mensaje, abrió el enlace y activó la cuenta.
- El portal de residentes permite crear, listar y cancelar prerregistros; el flujo de portería registra autorizaciones sin prerregistro con origen auditado y movimientos de entrada/salida vinculados. Las pruebas de integración usan `accivia_test`.
- El flujo manual confirmó entrada/salida de persona y vehículo. Un movimiento repetido en modo `BLOCK` no creó un registro; con modo `SUPERVISOR`, el formulario mantuvo la selección y la autorización creó un solo movimiento.
- Una encomienda de prueba se registró, entregó con el nombre de quien la retiró y otra se marcó devuelta.
- Un código desconocido de 32 caracteres enviado a `POST /api/access/scan` respondió `404` con `Código no reconocido.`. No se probó un QR antiguo con cámara.
- No se modificó la base local de desarrollo para estas pruebas.
- `npm run build` termina correctamente para API y frontend; Vite conserva la advertencia del bundle superior a 500 kB.
- Prisma fue regenerado después de agregar `Delivery`, `DeliveryType` y `DeliveryStatus`.
- La base de datos local fue sincronizada con `db:push --accept-data-loss`.
- Los `accessCode` de personas y vehículos fueron regenerados; los códigos anteriores ya no son válidos.
- Los QR nuevos se validaron decodificándolos en un navegador real (los tres devolvieron su código exacto).
- El flujo de encomiendas se probó contra la API: crear, listar, entregar, devolver y contador del tablero.
- La vista de encomiendas se verificó en un navegador real: pestaña, listado, modal de entrega y actualización del estado.
- La API responde con `Cache-Control: no-store` para evitar que el navegador sirva códigos o datos viejos.

El build muestra una advertencia de Vite sobre un bundle frontend grande debido a las dependencias de lectura y generación de códigos. No bloquea la compilación, pero puede optimizarse más adelante con carga diferida (`dynamic import`) y división de chunks.

### Pruebas automatizadas

- `npm test`: correcto, 5 archivos y 15 pruebas.
- Suite completa de integración de API: correcta, 4 archivos y 19 pruebas, usando exclusivamente `accivia_test`.
- `npm run build`: correcto para API y frontend.
- Las pruebas de integración usan una base PostgreSQL exclusiva llamada `accivia_test`, nunca la base local de desarrollo ni producción.
- Los casos de usuarios y roles verifican límites de privilegios, selección de residencia del SuperAdministrador, conservación de cuentas desactivadas y protección del último administrador.
- Cada PR debe ejecutar las pruebas automatizadas y `npm run build`.

## Pendientes prioritarios

### 1. Probar el escaneo con hardware de portería

- Leer un QR impreso con una cámara adecuada y un código de barras con lector USB.
- Comprobar el flujo de autorización de supervisor durante el escaneo; por formulario manual ya se comprobó que la selección se conserva y no se duplica el movimiento.
- Validar con hardware si el QR antiguo muestra el código leído y un error claro.

### 2. Movimiento duplicado reportado

- Resuelto: el incidente se originó antes de las validaciones actuales y se corrigió con autorización del usuario.
- La API serializa el registro y las pruebas cubren el rechazo de movimientos repetidos; no hay una investigación pendiente salvo que vuelva a reproducirse.
- No modificar registros históricos sin autorización explícita.

### 3. Validar el producto y priorizar el siguiente incremento

- Validar la operación con vigilantes y administradores y conseguir un conjunto para piloto.
- Definir reglas de autorización y vigencia para visitas, y el canal de notificaciones.
- Priorizar reportes de acceso y encomiendas con base en el piloto.

### 4. Limpieza y optimización técnica

El archivo [styles.css](C:/Users/klement/resi-control-project/apps/web/src/styles.css) creció mediante varias iteraciones y contiene reglas repetidas. Conviene hacer una limpieza posterior, cuidando no alterar:

- La tabla de últimos movimientos.
- La grilla lineal de vehículos.
- Los diálogos de personas y vehículos.
- El responsive existente.
- El bundle frontend supera 500 kB; puede optimizarse con carga diferida de lectura/generación de códigos.

### 5. Resolver la fotografía de personas

Las fotografías tienen un límite de 2 MB. Si una imagen supera ese tamaño, la API la rechaza correctamente. Puede mejorarse la experiencia agregando:

- Compresión automática en el navegador.
- Mensaje de tamaño más visible antes de enviar.
- Redimensionamiento automático manteniendo la calidad.

### 6. Completar el módulo de encomiendas

El flujo básico ya funciona. Siguientes pasos sugeridos:

- Notificar al residente cuando llega una encomienda (correo, WhatsApp o notificación interna).
- Adjuntar foto o evidencia de la encomienda y de quien la retira.
- Registrar intentos de entrega y reenvíos.
- Reporte de encomiendas por fecha, tipo y estado.
- Integrar la entrega con el movimiento de acceso del visitante o mensajero.
- Permitir que un residente autorice a otra persona para retirar la encomienda.

### 7. Definir el hardware de lectura definitivo

La webcam actual tiene foco fijo y no lee de forma confiable un QR mostrado en pantalla. Opciones:

- Lector USB de código de barras o QR (recomendado para portería).
- Cámara con autofoco.
- Imprimir credenciales y usarlas en papel.

### 8. Portal y prerregistros de visitas para residentes

Implementado como portal web para las cuentas de residente activadas. Reglas y flujo acordados:

1. El residente es quien autoriza el prerregistro, indicando nombre del visitante y, opcionalmente, documento, observaciones (máximo 500 caracteres) y vehículo.
2. El residente define la vigencia con controles de calendario y hora. Por defecto inicia a la hora actual y termina a la medianoche del día actual (00:00 del día siguiente); puede modificar el inicio y fin.
3. Solo el residente dueño del apartamento puede ver y cancelar sus visitas. Puede cancelar mientras el estado siga `AUTORIZADA`; las visitas canceladas o ingresadas no se pueden cancelar.
4. Si alguien llega sin prerregistro, portería puede registrarlo después de llamar o contactar al residente por el proceso habitual y recibir aprobación. Esa verificación ocurre fuera del sistema; el vigilante confirma el resultado en la interfaz. Se guarda el origen `PORTERIA`, quién lo registró y la marca `residentApprovalConfirmed`.
5. Portería registra entrada solo durante la vigencia autorizada. El sistema crea el visitante, el `AccessLog` de entrada y los enlaza al prerregistro. La salida crea otro `AccessLog` vinculado y completa la visita.
6. Si vence la vigencia sin entrada, el estado cambia a `NOSHOW`. La API actualiza visitas vencidas al iniciar, cada minuto y al listar visitas.
7. El portal usa la zona horaria local del navegador para mostrar y enviar fechas; queda pendiente definir la zona horaria oficial de la residencia antes del despliegue multi-región.

La notificación cuando llega una visita no está implementada; se definirá y priorizará por separado.

## Problemas o detalles conocidos

- [main.tsx](C:/Users/klement/resi-control-project/apps/web/src/main.tsx) contiene JSX en líneas muy largas.
- Existe una función `createVehicle` redundante anidada dentro de `createAccess`; no bloquea la compilación, pero debería eliminarse en una limpieza futura.
- El manejo de algunas acciones antiguas todavía usa `window.alert` o `window.confirm`; la interfaz de fotografía ya usa avisos integrados en los flujos principales.
- `npm install` reportó vulnerabilidades de auditoría en dependencias transitivas. Deben revisarse con cuidado antes de ejecutar actualizaciones automáticas.
- La cámara requiere permisos del navegador y normalmente debe usarse en un contexto permitido por el navegador, como `localhost` o HTTPS.
- La webcam actual tiene foco fijo y puede no leer un QR mostrado en el monitor; el mismo QR impreso se lee mejor. El problema quedó pausado por decisión del usuario.
- Los `accessCode` fueron regenerados. Cualquier QR impreso o guardado con un código anterior ya no es válido y debe reemplazarse.
- [styles.css](C:/Users/klement/resi-control-project/apps/web/src/styles.css) contiene bloques y media queries duplicados; funciona, pero conviene consolidarlo.
- No se debe cambiar `DATABASE_URL` ni `JWT_SECRET` en este documento.

## Punto exacto para continuar

El último trabajo completado fue:

1. Verificar manualmente en `accivia_test` los flujos de personas, vehículos, accesos, movimientos repetidos, autorización de supervisor y encomiendas.
2. Implementar invitaciones de residentes por correo, activación con contraseña propia y asociación con su registro de persona.
3. Comprobar activación y login desde el navegador; probar respuesta clara cuando SMTP aún no está configurado.
4. Ejecutar `npm run build`, `npm test` y pruebas de integración, incluidas las nuevas rutas de visitas.

El siguiente paso recomendado es:

- Publicar el portal bajo HTTPS antes de invitar residentes reales.
- Probar en navegador los flujos de prerregistro y portería; definir zona horaria oficial y notificaciones.
- Priorizar reportes según el piloto.
- Probar QR y código de barras con hardware real cuando esté disponible.
- Validar los flujos con personal de portería y conseguir un conjunto para piloto cuando sea posible.

Mejoras futuras relacionadas:

- Notificar al residente cuando una visita llega; el canal está por definir.
- Publicar frontend y API bajo HTTPS para invitar residentes y usar el portal fuera del equipo local.
