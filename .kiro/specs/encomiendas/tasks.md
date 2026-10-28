# Tareas: Encomiendas

## Completado

- [x] Definir enums `DeliveryType` y `DeliveryStatus`.
- [x] Crear el modelo `Delivery` y sus relaciones con residencia, persona y usuarios.
- [x] Sincronizar la base de datos con Prisma.
- [x] Implementar `GET /api/deliveries` con filtro por estado.
- [x] Implementar `POST /api/deliveries`.
- [x] Implementar `PUT /api/deliveries/:id/status`.
- [x] Agregar `totals.pendingDeliveries` al dashboard.
- [x] Agregar la pestaña "Encomiendas" con contador de pendientes.
- [x] Crear el formulario de registro.
- [x] Crear el listado con filtros y estados.
- [x] Implementar las acciones "Entregar" y "Devolver".
- [x] Verificar `npm run build`.
- [x] Probar el flujo completo contra la API y en navegador.

## Próximo orden recomendado

- [ ] Notificar al residente cuando llega una encomienda.
- [ ] Adjuntar foto de la encomienda y de quien la retira.
- [ ] Registrar intentos de entrega fallidos.
- [ ] Agregar reporte por fecha, tipo y estado.
- [ ] Permitir autorizar a otra persona para retirar una encomienda.
- [ ] Integrar la entrega con el registro de acceso del mensajero.

## Decisiones pendientes

- Canal de notificación: correo, WhatsApp o notificación interna.
- Tiempo máximo que una encomienda puede permanecer en portería.
- Qué hacer con encomiendas vencidas o no reclamadas.
- Si se permite editar una encomienda antes de cerrarla.
- Si se requiere firma o evidencia fotográfica al entregar.
