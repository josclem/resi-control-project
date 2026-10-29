# Resi Control: contexto del proyecto

## Propósito

Resi Control es un sistema web para administrar el control de acceso de una residencia. El sistema maneja personas, vehículos, fotografías, movimientos de entrada y salida, configuración de la residencia y diferentes formas de identificar a una persona o vehículo. También administra las encomiendas que llegan a la portería —comida, paquetes, recibos de servicios y correo— y su entrega a los residentes.

El proyecto está ubicado en:

`C:\Users\klement\resi-control`

El entorno actual usa Windows, PostgreSQL local y una API Express con frontend React/Vite.

## Arquitectura actual

### Backend

- Ubicación: [apps/api/](C:/Users/klement/resi-control/apps/api/)
- Express + TypeScript.
- Prisma como ORM.
- PostgreSQL como base de datos.
- JWT para autenticación.
- Multer para cargar fotografías.
- Zod para validar entradas.
- La API normalmente corre en el puerto `4000`.

Archivo principal:

- [server.ts](C:/Users/klement/resi-control/apps/api/src/server.ts)

### Frontend

- Ubicación: [apps/web/](C:/Users/klement/resi-control/apps/web/)
- React 18 + TypeScript.
- Vite.
- La aplicación normalmente corre en el puerto `5173`.

Archivos principales:

- [main.tsx](C:/Users/klement/resi-control/apps/web/src/main.tsx)
- [styles.css](C:/Users/klement/resi-control/apps/web/src/styles.css)

### Base de datos

- Esquema Prisma: [schema.prisma](C:/Users/klement/resi-control/apps/api/prisma/schema.prisma)
- Base de datos local: PostgreSQL `resi_control`.
- El archivo `.env` del backend contiene la conexión y el secreto JWT. No se deben copiar sus valores a documentación ni al repositorio.

## Funcionalidades implementadas

### Autenticación y residencia

- Inicio de sesión con JWT.
- Roles:
  - `SUPER_ADMINISTRADOR`
  - `ADMINISTRADOR`
  - `VIGILANTE`
- Aislamiento por residencia mediante `residenceId`.
- El usuario y su residencia se vuelven a validar desde PostgreSQL.
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
- Validación de que el vehículo pertenezca a la persona seleccionada.
- Control de movimientos repetidos:
  - Por persona para movimientos peatonales.
  - Por vehículo para movimientos vehiculares.
- La API serializa el registro de movimientos por persona para que la validación del último movimiento y la creación sean atómicas, incluso si llegan solicitudes simultáneas.
- Modos para movimientos irregulares:
  - Bloquear.
  - Solicitar autorización de supervisor.
- En modo `BLOCK`, dos movimientos consecutivos del mismo tipo se rechazan con `409` (`IRREGULAR_ACCESS`). En modo `SUPERVISOR`, la excepción requiere credenciales válidas y queda asociada al supervisor que la autorizó.
- Validación del fix (2026-10-28): compilación de API y frontend correcta. Queda pendiente reproducir el caso de Jose Rojas con datos reales; no se alteró el historial de movimientos existente.
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
npm run db:push --workspace @resi-control/api -- --accept-data-loss
```

En Windows, si `prisma generate` falla con `EPERM` por el motor bloqueado, hay que detener únicamente el proceso Node de la API que está usando el proyecto y volver a ejecutar `npm run db:generate`. No se deben detener procesos ajenos.

## Estado actual de validación

- `npm run build` termina correctamente para API y frontend.
- Prisma fue regenerado después de agregar `Delivery`, `DeliveryType` y `DeliveryStatus`.
- La base de datos local fue sincronizada con `db:push --accept-data-loss`.
- Los `accessCode` de personas y vehículos fueron regenerados; los códigos anteriores ya no son válidos.
- Los QR nuevos se validaron decodificándolos en un navegador real (los tres devolvieron su código exacto).
- El flujo de encomiendas se probó contra la API: crear, listar, entregar, devolver y contador del tablero.
- La vista de encomiendas se verificó en un navegador real: pestaña, listado, modal de entrega y actualización del estado.
- La API responde con `Cache-Control: no-store` para evitar que el navegador sirva códigos o datos viejos.

El build muestra una advertencia de Vite sobre un bundle frontend grande debido a las dependencias de lectura y generación de códigos. No bloquea la compilación, pero puede optimizarse más adelante con carga diferida (`dynamic import`) y división de chunks.

## Pendientes prioritarios

### 1. Probar manualmente los códigos

El QR generado ya se validó decodificándolo en un navegador real y el escaneo registra movimientos correctamente. Queda pendiente:

- Escanear el QR impreso con la webcam actual.
- Escanear el código de barras con un lector USB.
- Confirmar el ciclo entrada/salida con persona y con vehículo.
- Verificar que un QR viejo sea rechazado y muestre el texto leído en el mensaje de error.

### 2. Revisar la experiencia de escaneo automático

Decidir si, en producción, se desea:

- Mantener el registro automático elegido actualmente.
- Mostrar una confirmación visual más grande después de cada escaneo.
- Agregar un breve bloqueo temporal para evitar dos lecturas accidentales seguidas.
- Emitir sonido o vibración al leer correctamente.

### 3. Completar la autorización de supervisor en el escaneo

El flujo ya detecta que se necesita supervisor y conserva la selección del movimiento, pero debe probarse manualmente para confirmar que:

- El formulario queda abierto.
- El tipo de movimiento correcto queda seleccionado.
- El supervisor puede completar la autorización.
- El movimiento no se duplica.

### 4. Implementar huella dactilar cuando exista el dispositivo

La opción está visible como “próximamente”, pero aún falta:

- Conocer el modelo exacto del lector.
- Confirmar si funciona por USB, SDK del fabricante o WebAuthn.
- Definir cómo se registrará la plantilla o referencia biométrica.
- No guardar huellas crudas sin una decisión explícita de seguridad y cumplimiento.

### 5. Mejorar la generación de credenciales

Ya están implementados:

- Botón para descargar el QR como imagen PNG.
- Botón para imprimir una credencial con nombre y código.

Faltaría considerar:

- Botón para descargar o imprimir el código de barras.
- Vista de credencial con placa o apartamento.
- Regeneración controlada de un código si se pierde o se compromete.

### 6. Revisar consistencia visual

El archivo [styles.css](C:/Users/klement/resi-control/apps/web/src/styles.css) creció mediante varias iteraciones y contiene reglas repetidas. Conviene hacer una limpieza posterior, cuidando no alterar:

- La tabla de últimos movimientos.
- La grilla lineal de vehículos.
- Los diálogos de personas y vehículos.
- El responsive existente.

### 7. Resolver la fotografía de personas

Las fotografías tienen un límite de 2 MB. Si una imagen supera ese tamaño, la API la rechaza correctamente. Puede mejorarse la experiencia agregando:

- Compresión automática en el navegador.
- Mensaje de tamaño más visible antes de enviar.
- Redimensionamiento automático manteniendo la calidad.

### 8. Optimizar el bundle del frontend

El build funciona, pero Vite informa que el bundle supera 500 kB. Se puede mejorar cargando bajo demanda:

- `@zxing/browser`.
- Generación de QR.
- Generación de códigos de barras.

### 9. Completar el módulo de encomiendas

El flujo básico ya funciona. Siguientes pasos sugeridos:

- Notificar al residente cuando llega una encomienda (correo, WhatsApp o notificación interna).
- Adjuntar foto o evidencia de la encomienda y de quien la retira.
- Registrar intentos de entrega y reenvíos.
- Reporte de encomiendas por fecha, tipo y estado.
- Integrar la entrega con el movimiento de acceso del visitante o mensajero.
- Permitir que un residente autorice a otra persona para retirar la encomienda.

### 10. Definir el hardware de lectura definitivo

La webcam actual tiene foco fijo y no lee de forma confiable un QR mostrado en pantalla. Opciones:

- Lector USB de código de barras o QR (recomendado para portería).
- Cámara con autofoco.
- Imprimir credenciales y usarlas en papel.

### 11. App de residentes para pre-registrar visitas (planificado, no implementado)

Funcionalidad futura anotada para planificación. Consiste en una aplicación para residentes donde puedan registrar previamente una visita, peatonal o con vehículo, antes de que llegue a la residencia.

Flujo esperado:

1. El residente crea un pre-registro de visita con:
   - Nombre y documento del visitante.
   - Placa y tipo de vehículo, si aplica.
   - Fecha y ventana horaria de la visita.
   - Vigencia del pre-registro.
   - Observaciones o autorización.
2. El sistema guarda el pre-registro asociado al residente y a su apartamento.
3. Cuando la visita llega a la entrada, se anuncia en portería y solo se identifica con su documento o placa; no se vuelven a capturar todos los datos.
4. El sistema valida que exista un pre-registro vigente y registra la entrada del visitante.
5. En ese momento se envía una notificación al residente avisando que su visita ya llegó.
6. Al salir la visita, se registra la salida y se cierra el pre-registro.

Consideraciones:

- Requiere autenticación de residentes (hoy solo existen usuarios administradores y vigilantes).
- Requiere app móvil o una vista web para residentes.
- Requiere notificaciones push, correo o WhatsApp; el canal está por definir.
- Hay que definir qué pasa con visitas sin pre-registro, visitas vencidas y visitas rechazadas.
- Debe integrarse con `AccessLog` para no duplicar movimientos.
- No implementar todavía; queda solo documentado como siguiente fase.

## Problemas o detalles conocidos

- [main.tsx](C:/Users/klement/resi-control/apps/web/src/main.tsx) contiene JSX en líneas muy largas.
- Existe una función `createVehicle` redundante anidada dentro de `createAccess`; no bloquea la compilación, pero debería eliminarse en una limpieza futura.
- El manejo de algunas acciones antiguas todavía usa `window.alert` o `window.confirm`; la interfaz de fotografía ya usa avisos integrados en los flujos principales.
- `npm install` reportó vulnerabilidades de auditoría en dependencias transitivas. Deben revisarse con cuidado antes de ejecutar actualizaciones automáticas.
- La cámara requiere permisos del navegador y normalmente debe usarse en un contexto permitido por el navegador, como `localhost` o HTTPS.
- La webcam actual tiene foco fijo y puede no leer un QR mostrado en el monitor; el mismo QR impreso se lee mejor. El problema quedó pausado por decisión del usuario.
- Los `accessCode` fueron regenerados. Cualquier QR impreso o guardado con un código anterior ya no es válido y debe reemplazarse.
- [styles.css](C:/Users/klement/resi-control/apps/web/src/styles.css) contiene bloques y media queries duplicados; funciona, pero conviene consolidarlo.
- No se debe cambiar `DATABASE_URL` ni `JWT_SECRET` en este documento.

## Punto exacto para continuar

El último trabajo completado fue:

1. Mejorar el escáner QR/código de barras: formatos restringidos, validación de 32 hex, zoom, selector de cámara, escaneo automático y diagnóstico.
2. Agregar descarga e impresión de credenciales QR.
3. Regenerar los `accessCode` de personas y vehículos.
4. Agregar `Cache-Control: no-store` a la API.
5. Crear el modelo `Delivery` con tipos `COMIDA`, `PAQUETE`, `RECIBO`, `CORREO` y `OTRO`.
6. Implementar `GET /api/deliveries`, `POST /api/deliveries` y `PUT /api/deliveries/:id/status`.
7. Agregar `totals.pendingDeliveries` al dashboard.
8. Construir la pantalla "Encomiendas" con registro, filtros, entrega y devolución.
9. Confirmar que `npm run build` termina correctamente y probar el flujo en navegador.

El siguiente paso recomendado es:

- Validar el módulo de encomiendas con usuarios reales de portería.
- Definir el canal de notificación al residente.
- Probar el escaneo con un lector USB o una cámara con autofoco.
- Revisar el movimiento duplicado de Jose Rojas (dos `ENTRADA` seguidas con modo `BLOCK`).
- Limpiar el CSS duplicado y el código muerto de `createVehicle`.

Funcionalidad futura ya anotada (no implementar todavía):

- App de residentes para pre-registrar visitas peatonales o vehiculares.
- La visita se anuncia y se identifica al llegar; el sistema valida el pre-registro y registra la entrada.
- El residente recibe una notificación cuando su visita llega.
