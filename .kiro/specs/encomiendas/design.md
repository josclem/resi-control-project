# Diseño: Encomiendas

## Modelo de datos

### Enums

```prisma
enum DeliveryType {
  COMIDA
  PAQUETE
  RECIBO
  CORREO
  OTRO
}

enum DeliveryStatus {
  PENDIENTE
  ENTREGADA
  DEVUELTA
}
```

### Modelo `Delivery`

```prisma
model Delivery {
  id              Int            @id @default(autoincrement())
  type            DeliveryType
  status          DeliveryStatus @default(PENDIENTE)
  courier         String?
  description     String?
  trackingCode    String?
  notes           String?
  receivedAt      DateTime       @default(now())
  deliveredAt     DateTime?
  deliveredToName String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  personId        Int
  residenceId     Int            @default(1)
  receivedById    Int
  deliveredById   Int?
  person          Person         @relation(fields: [personId], references: [id])
  residence       Residence      @relation(fields: [residenceId], references: [id])
  receivedBy      User           @relation("DeliveryReceived", fields: [receivedById], references: [id])
  deliveredBy     User?          @relation("DeliveryDelivered", fields: [deliveredById], references: [id])

  @@index([status])
  @@index([receivedAt])
  @@index([personId])
}
```

### Relaciones agregadas

- `Residence.deliveries`
- `Person.deliveries`
- `User.receivedDeliveries`
- `User.deliveredDeliveries`

## API

### `GET /api/deliveries`

- Requiere JWT.
- Filtra por `residenceId` del usuario.
- Acepta `?status=PENDIENTE|ENTREGADA|DEVUELTA`.
- Ordena por `receivedAt` descendente.
- Devuelve hasta 200 registros con:
  - `person`: id, nombre, apartamento y tipo.
  - `receivedBy`: id y nombre.
  - `deliveredBy`: id y nombre.

### `POST /api/deliveries`

Cuerpo validado con Zod:

```json
{
  "personId": 1,
  "type": "PAQUETE",
  "courier": "Amazon",
  "description": "Caja mediana",
  "trackingCode": "TBA123",
  "notes": "Dejar en portería"
}
```

Reglas:

- `personId` debe existir, estar activo y pertenecer a la residencia.
- El estado inicial siempre es `PENDIENTE`.
- `receivedById` se toma del token, no del cuerpo.
- Responde `404` si el destinatario no existe o está inactivo.

### `PUT /api/deliveries/:id/status`

Cuerpo:

```json
{
  "status": "ENTREGADA",
  "deliveredToName": "Jose Rojas"
}
```

Reglas:

- Solo acepta `ENTREGADA` o `DEVUELTA`.
- Si la encomienda no existe en la residencia: `404`.
- Si ya está cerrada: `409`.
- Al entregar se guardan `deliveredAt`, `deliveredById` y `deliveredToName`.
- Al devolver se guarda `deliveredAt = null` y `deliveredById = null`.

### Dashboard

`GET /api/dashboard` agrega `totals.pendingDeliveries` contando las encomiendas `PENDIENTE` de la residencia.

## Frontend

### Estado

- `deliveries`: lista completa.
- `deliveryFilter`: `PENDIENTE` o `TODAS`.
- Formulario: destinatario, tipo, mensajería, descripción, guía y observaciones.
- `closingDelivery`: encomienda que se está entregando.
- `deliveredToName`: nombre de quien retira.

### Vistas

- Nueva pestaña **Encomiendas** en la navegación, con contador de pendientes.
- Tarjeta **Encomiendas pendientes** en el tablero de movimientos.
- Panel principal:
  - Encabezado con contador y botón **Registrar encomienda**.
  - Filtros **Pendientes** y **Todas**.
  - Tabla con destinatario, apartamento, tipo, detalle, recibida, estado y acciones.
- Modal de registro.
- Modal de entrega que pide el nombre de quien retira.
- Acción **Devolver** con confirmación.

### Estilos

- `.delivery-filters`
- `.delivery-row`
- `.delivery-status` con variantes `.pendiente`, `.entregada`, `.devuelta`
- `.delivery-actions`
- `.delivery-closed`

## Decisiones

- La encomienda se asocia a una persona, no directamente a un apartamento, para reutilizar el modelo existente.
- No se eliminan encomiendas: se cierran como entregadas o devueltas para conservar trazabilidad.
- El nombre de quien retira es texto libre porque puede no ser el destinatario.
- No se implementó notificación al residente en esta iteración.
