# Spec: Encomiendas

## Objetivo

Permitir que la portería registre las encomiendas que llegan a la residencia —comida, paquetes, recibos de servicios y correo—, las asocie a su destinatario y controle su entrega o devolución.

## Actores

- **Vigilante:** recibe la encomienda, la registra y la entrega o devuelve.
- **Administrador:** consulta el histórico y el estado de las encomiendas.
- **Residente o visitante:** destinatario de la encomienda.

## Requisitos funcionales

### Registro

1. Un usuario autenticado debe poder registrar una encomienda.
2. La encomienda debe tener un destinatario activo de la misma residencia.
3. La encomienda debe tener un tipo: `COMIDA`, `PAQUETE`, `RECIBO`, `CORREO` u `OTRO`.
4. Debe registrarse automáticamente la fecha y hora de recepción y el usuario que la recibe.
5. Deben poder registrarse opcionalmente:
   - Mensajería o remitente (`courier`).
   - Descripción breve.
   - Número de guía o factura (`trackingCode`).
   - Observaciones.
6. Toda encomienda nueva debe quedar en estado `PENDIENTE`.

### Entrega y devolución

1. Una encomienda `PENDIENTE` debe poder marcarse como `ENTREGADA`.
2. Al entregarla debe registrarse la fecha y hora, el usuario que entrega y el nombre de quien la retira.
3. Una encomienda `PENDIENTE` debe poder marcarse como `DEVUELTA`.
4. Una encomienda cerrada (`ENTREGADA` o `DEVUELTA`) no debe poder modificarse desde el flujo operativo.
5. La API debe responder `409` cuando se intente cerrar una encomienda ya cerrada.

### Consulta

1. Debe existir una pantalla "Encomiendas".
2. Debe mostrar las encomiendas pendientes por defecto y permitir ver todas.
3. Debe mostrar destinatario, apartamento, tipo, detalle, fecha de recepción y estado.
4. El dashboard debe mostrar el total de encomiendas pendientes.
5. La navegación debe mostrar el número de pendientes.

### Aislamiento y permisos

1. Cada encomienda pertenece a una residencia.
2. Un usuario solo debe ver y operar encomiendas de su residencia.
3. Todas las rutas deben exigir autenticación JWT.

## Requisitos no funcionales

- Validación de entradas con Zod.
- Mensajes de error claros en español y códigos HTTP apropiados.
- La base de datos debe ser PostgreSQL mediante Prisma.
- La interfaz debe mantener el estilo existente de Resi Control.
- `npm run build` debe terminar sin errores.

## Criterios de aceptación del MVP

- Se puede registrar una encomienda de cada tipo.
- La encomienda aparece como pendiente en la pantalla y en el dashboard.
- Se puede entregar indicando quién la retira.
- Se puede marcar como devuelta.
- El contador de pendientes se actualiza después de cada operación.
- Una encomienda cerrada no se puede volver a cerrar.
