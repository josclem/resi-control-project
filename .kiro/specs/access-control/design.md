# Diseño: Control de acceso residencial

> Estado: implementado y en evolución. Este documento refleja la arquitectura vigente; el detalle funcional y el historial están en [CONTEXTO_PROYECTO.md](C:/Users/klement/resi-control/CONTEXTO_PROYECTO.md).

## Arquitectura

```text
React/Vite (apps/web)
    |
    | HTTP/JSON + Bearer JWT
    v
Express/TypeScript (apps/api)
    |
    | Prisma
    v
PostgreSQL
```

## Modelo de datos actual

### Residence

- `id`, `name`, `code`, `active`
- `logoData`, `logoMimeType`
- Relaciones: usuarios, personas, vehículos, movimientos, configuración y encomiendas.

### User

- `id`, `name`, `email`, `passwordHash`
- `role`: `SUPER_ADMINISTRADOR`, `ADMINISTRADOR` o `VIGILANTE`
- `active`, `residenceId`, timestamps.

### Person

- `id`, `type` (`RESIDENTE` o `VISITANTE`)
- `fullName`, `apartmentNumber`, `documentNumber`, `phone`
- `accessCode`: 32 caracteres hexadecimales
- `biometricRef`, `active`, timestamps
- Relaciones: foto, vehículos, movimientos y encomiendas.

### PersonPhoto y VehiclePhoto

- Binario de la imagen y `mimeType`.
- Formatos permitidos: JPG, PNG y WebP. Tamaño máximo: 2 MB.

### DocumentType

- Catálogo de tipos de documento (`code`, `name`, `active`).

### Vehicle

- `id`, `plate`, `type` (`AUTOMOVIL`, `MOTOCICLETA`, `BICICLETA`, `OTRO`)
- `brand`, `model`, `color`
- `accessCode`: 32 caracteres hexadecimales
- `personId`, `residenceId`, `active`, timestamps.

### AccessLog

- `id`, `accessType` (`ENTRADA` o `SALIDA`), `occurredAt`
- `personId`, `vehicleId` opcional, `registeredById`, `residenceId`
- `authorizedById` para movimientos aprobados por supervisor.

### SystemSetting

- Configuración por residencia:
  - `irregular_access_mode`: `BLOCK` o `SUPERVISOR`.
  - `access_capture_mode`: `MANUAL`, `BARCODE`, `QR` o `FINGERPRINT`.

### Delivery

- `id`, `type` (`COMIDA`, `PAQUETE`, `RECIBO`, `CORREO`, `OTRO`)
- `status` (`PENDIENTE`, `ENTREGADA`, `DEVUELTA`)
- `courier`, `description`, `trackingCode`, `notes`
- `receivedAt`, `deliveredAt`, `deliveredToName`
- `personId`, `residenceId`, `receivedById`, `deliveredById` opcional.

## API actual

### Autenticación y residencia

- `POST /api/auth/login`
- `GET /api/residence`
- `PUT /api/residence`

### Personas

- `GET /api/people`
- `POST /api/people`
- `PUT /api/people/:id`
- `DELETE /api/people/:id` (desactivación lógica)
- `PUT /api/people/:id/photo`
- `GET /api/people/:id/photo`
- `DELETE /api/people/:id/photo`

### Vehículos

- `GET /api/vehicles`
- `POST /api/vehicles`
- `PUT /api/vehicles/:id`
- `DELETE /api/vehicles/:id` (desactivación lógica)
- `PUT /api/vehicles/:id/photo`
- `GET /api/vehicles/:id/photo`
- `DELETE /api/vehicles/:id/photo`

### Accesos

- `GET /api/dashboard`
- `POST /api/access`
- `POST /api/access/scan`

### Encomiendas

- `GET /api/deliveries`
- `POST /api/deliveries`
- `PUT /api/deliveries/:id/status`

### Configuración

- `GET /api/settings/irregular-access`
- `PUT /api/settings/irregular-access`
- `GET /api/settings/access-capture`
- `PUT /api/settings/access-capture`
- `GET /api/document-types`

## Frontend

- `apps/web/src/main.tsx` concentra la aplicación React.
- Secciones: Movimientos, Personas, Vehículos, Encomiendas y Configuración.
- El escaneo usa `@zxing/browser` y se limita al formato configurado.
- Los códigos se generan con `qrcode` y `jsbarcode`.
- El escaneo registra automáticamente entrada o salida según el último movimiento.
- Los formularios de alta y edición usan modales sobre el listado.

## Decisiones de diseño

- El servidor es la fuente de verdad de la fecha/hora.
- Los movimientos de acceso no se eliminan desde la interfaz operativa.
- Las encomiendas no se eliminan: se cierran como entregadas o devueltas.
- La autorización se implementa como middleware por roles.
- Todo recurso se filtra por `residenceId` del usuario autenticado.
- El usuario que registra un movimiento o recibe/entrega una encomienda se toma del token.
- La API responde con `Cache-Control: no-store`.
- El hardware biométrico no se mezcla con el dominio principal: se incorporará mediante un adaptador que resuelva una identidad a `Person`.
- Para producción se debe cambiar el secreto JWT y las credenciales del seed.

## Evolución prevista

1. Completar administración de usuarios y roles desde la interfaz.
2. Agregar filtros y exportación del reporte de accesos.
3. Notificar al residente cuando llega una encomienda.
4. Adjuntar evidencia fotográfica o firma en la entrega.
5. Definir adaptador de lector biométrico y puerta según hardware real.
6. Limpiar CSS duplicado y optimizar el bundle del frontend.
