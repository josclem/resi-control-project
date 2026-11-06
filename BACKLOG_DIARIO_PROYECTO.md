# Backlog diario de trabajo para Accivia

## Fecha de referencia
- 2026-11-05

## Objetivo general
Mantener el proyecto funcionando, estable y útil para operación real de portería, sin volver a introducir regressiones por falta de validaciones. Las tareas del día a día deben estar ordenadas por valor de negocio y por riesgo técnico.

## Regla operativa del backlog
Antes de cada tarea se debe responder:
- ¿Qué problema resuelve?
- ¿Qué validación necesita?
- ¿Qué cambia en la API?
- ¿Qué cambia en la UI?
- ¿Qué casos límite hay?
- ¿Cómo se valida que no rompe lo actual?

Si no se puede responder eso, la tarea no está lista para empezar.

## Prioridad 0 — Bloqueadores y riesgo real

### Crear la base de pruebas unitarias y de integración
- Estado: implementada en `docs/testing-strategy`; suite automatizada local verificada y CI configurado como requisito de `main`
- Riesgo: alto
- Impacto: prevenir regresiones en acceso, autorización y cierre de encomiendas
- Implementación: Vitest, pruebas unitarias y de integración con PostgreSQL aislado, `createApp` separado del arranque HTTP y workflow de GitHub Actions para PR/push a `main`.
- Alcance inicial:
  - probar reglas puras de validación/normalización como unit tests
  - probar rutas, persistencia, permisos y aislamiento por residencia como integration tests
  - cubrir accesos duplicados, autorización de supervisor y cierres concurrentes de encomiendas
- Criterio de done:
  - `npm test`, `npm run test:integration` y `npm run build` pasan localmente
  - GitHub Actions ejecuta estas validaciones y `validate` es check requerido para integrar en `main`
  - las pruebas de integración preparan y limpian datos de forma segura

### 1) Corregir movimiento duplicado de acceso
- Estado: resuelto; el usuario confirmó que el caso ya se había probado y que ocurrió antes de existir las validaciones actuales
- Riesgo: alta
- Impacto: corrupción de trazabilidad y confianza del sistema
- Implementación: el chequeo del último movimiento y su creación se ejecutan en una transacción que bloquea la fila de la persona. Las capturas simultáneas del escáner también se serializan en la interfaz.
- Validación realizada: `npm run build` pasó para API y web; en modo `BLOCK` la API mantiene la respuesta `409` (`IRREGULAR_ACCESS`) para movimientos consecutivos del mismo tipo.
- Caso real: el incidente se corrigió con autorización del usuario; para proteger los datos personales, este backlog no conserva nombres, apartamento ni identificadores de registros. No se deben modificar otros movimientos sin autorización.
- Tareas:
  - identificar el flujo exacto del caso
  - definir la regla de negocio para evitar duplicados
  - agregar validación en API
  - revisar el caso de `BLOCK` y `supervisor`
  - validar con datos reales del flujo de acceso
- Criterio de done:
  - no se puede registrar un movimiento duplicado cuando la regla lo impide
  - el servidor responde con el error esperado
  - la validación queda documentada

### 2) Reforzar validaciones finas en accesos y encomiendas
- Estado: implementación lista en `fix/access-delivery-validations`; pendiente validación funcional
- Riesgo: alta
- Impacto: errores operativos, estados inconsistentes y acciones no autorizadas
- Problemas confirmados: el cierre de una encomienda consultaba `PENDIENTE` y luego actualizaba sin condición atómica; dos solicitudes concurrentes podían sobrescribir el estado. La API aceptaba `ENTREGADA` sin indicar quién recibió la encomienda y un filtro de estado inválido devolvía silenciosamente todas las encomiendas. El escaneo de un vehículo activo podía resolver a una persona inactiva.
- Alcance de esta iteración: hacer la transición desde `PENDIENTE` atómica y condicionada por `residenceId`; conservar `404` para IDs inexistentes o de otra residencia y `409` para encomiendas ya cerradas; exigir nombre del receptor al marcar `ENTREGADA`; responder `400` para filtros de estado inválidos; rechazar escaneos de vehículos cuyo propietario esté inactivo o fuera de la residencia.
- Cambio de UI/API: se conserva la ruta `PUT /api/deliveries/:id/status`; la interfaz precarga el nombre del destinatario y permite editarlo. La API responderá `400` si una entrega no incluye ese nombre o el filtro `status` es inválido.
- Casos límite: cierre concurrente, ID inválido/inexistente o de otra residencia, intento de reabrir con `PENDIENTE`, devolución sin datos de entrega, nombre vacío, status inválido/repetido y vehículo activo con propietario inactivo.
- Implementación: cierre condicional y atómico por `id`, `residenceId` y estado pendiente; validación del destinatario obligatorio; filtro de estado inválido explícito; escaneo vehicular limitado a propietarios activos de la residencia.
- Validación: suite PostgreSQL local cubre cierre duplicado y concurrente, destinatario obligatorio, reapertura inválida, ID inválido, filtro inválido y aislamiento entre residencias. `npm run test:integration`, `npm test` y `npm run build` pasan; CI de GitHub valida el último cambio.
- Tareas:
  - revisar validaciones de movimientos irregulares
  - revisar cierre de encomiendas y no permitir re-cierre
  - comprobar que los estados y usuarios sean tomados del token o del contexto correcto
  - asegurar filtrado por `residenceId`
- Criterio de done:
  - cada flujo tiene validación explícita
  - cada error tiene respuesta clara y consistente
  - no se permite operación fuera de residencia

### 3) Definir notificación al residente
- Estado: alta
- Riesgo: medio/alto
- Impacto: experiencia del residente y valor real del sistema
- Tareas:
  - decidir canal de notificación: interno, WhatsApp, correo u otro
  - definir cuándo se dispara la notificación
  - detallar el contenido mínimo de la notificación
  - definir qué ocurre si la visita o la encomienda es entregada
- Criterio de done:
  - la regla de negocio está escrita
  - el evento se puede rastrear
  - el flujo de la notificación queda documentado

## Prioridad 1 — Operación útil para administración

### 4) Reportes de encomiendas por fecha, tipo y estado
- Estado: alta
- Riesgo: medio
- Impacto: medible para administración y portería
- Tareas:
  - filtros por fecha
  - filtros por tipo
  - filtros por estado
  - agrupación por residente o apartamento
- Criterio de done:
  - el reporte puede consultarse sin Excel manual
  - los resultados respetan residencia y permisos
  - el flujo se prueba con datos reales

### 5) Reportes de movimientos por rango de fechas
- Estado: alta
- Riesgo: medio
- Impacto: trazabilidad
- Tareas:
  - filtrar por rango de fechas
  - distinguir entradas y salidas
  - distinguir residentes y visitantes
  - integrar con dashboard si aplica
- Criterio de done:
  - se puede revisar historial de accesos sin improvisar consultas
  - los resultados son consistentes con la base de datos

### 6) Administración de usuarios y roles en interfaz
- Estado: implementada e integrada en `main` (PR #10)
- Riesgo: medio
- Impacto: mantenimiento operativo
- La validación funcional inicial y los límites de permisos están documentados; falta validar el uso sostenido con un conjunto piloto.

## Prioridad 2 — Mejora de experiencia y operación

### 7) Limpieza de CSS y código muerto en frontend
- Estado: medio
- Riesgo: medio
- Impacto: mantenibilidad
- Tareas:
  - encontrar reglas duplicadas
  - revisar selectores genericos que pisan otros estilos
  - eliminar funciones sin uso
  - mantener estilos actuales sin romper grillas ni formularios
- Criterio de done:
  - menos duplicación
  - sin regresión visual
  - se mantiene el estilo actual de la app

### 8) Optimización del bundle y carga diferida
- Estado: medio
- Riesgo: medio
- Impacto: rendimiento y mantenimiento
- Tareas:
  - revisar carga de dependencias pesadas
  - mover carga de lectura de QR/códigos a rutas necesarias
  - revisar uso de librerías pesadas
- Criterio de done:
  - mejora de carga sin romper funcionalidad
  - flujo principal sigue operativo

### 9) Documentación de decisiones de negocio y flujo operativo
- Estado: medio
- Riesgo: bajo
- Impacto: continuidad del proyecto
- Tareas:
  - documentar el caso de “visita”
  - documentar flujo de encomienda en uso real
  - documentar excepción de “QR en pantalla”
  - dejar en un único lugar la regla de negocio aplicada
- Criterio de done:
  - el próximo desarrollador puede seguir desde el documento sin adivinar

## Prioridad 3 — Producto y extensión

### 10) App de residentes para pre-registro de visitas
- Estado: implementada como portal web e integrada en `main` (PR #12)
- Riesgo: medio
- Impacto: operación cotidiana de residentes y portería
- Tareas:
  - validar en navegador los flujos completos de residente y portería
  - definir la zona horaria oficial antes de operar en varias regiones
  - validar el flujo con vigilantes y administradores en un piloto
- Criterio de done:
  - pruebas manuales y automatizadas cubren las reglas y el flujo está validado con usuarios de portería

### 11) Evidencia fotográfica o firma en entregas
- Estado: media
- Riesgo: medio
- Impacto: operatividad y trazabilidad
- Tareas:
  - definir si se guarda firma, foto, ambos o ninguno
  - diseñar el flujo de entrega
  - definir la persistencia y permisos
- Criterio de done:
  - se documenta el tipo de evidencia y cómo se almacena

### 12) Hardware y puertas
- Estado: baja prioridad
- Riesgo: alto si se hace sin validación
- Impacto: dependencia técnica y costo operativo
- Tareas:
  - no avanzar hasta definir fabricante, protocolo y SDK
  - mantener la decisión fuera del roadmap activo
- Criterio de done:
  - requerimiento técnico claro, validado y documentado

## Backlog semanal sugerido

### Semana 1: estabilidad
- Corregir movimiento duplicado
- Reforzar validaciones de accesos y encomiendas
- Documentar criterios del flujo corregido

### Semana 2: notificaciones y trazabilidad
- Definir canal de notificación
- Implementar notificación para visita o encomienda
- Verificar trazabilidad del evento

### Semana 3: reportes
- Reportes de encomiendas
- Reportes de movimientos
- Revisión de filtros y permisos

### Semana 4: pulido técnico
- CSS duplicado y limpieza
- Optimización de carga pesada
- Revisión de deuda técnica y documentación

## Criterios de salida de backlog
Una tarea sale del backlog cuando:
- tiene validación clara
- tiene caso de uso y objetivo medible
- tiene criterio de done especificado
- si involucra negocio sensible, se documenta el flujo completo
- se puede probar sin ambigüedad

## Resumen práctica para el trabajo diario

### Hacer primero
- bloqueadores del flujo real
- validaciones críticas
- bugs que afectan operación o trazabilidad

### Hacer después
- reportes y analítica
- notificaciones de negocio
- estilos y limpieza técnica

### Dejar para más adelante
- hardware
- app de residentes sin validación de negocio
- funciones avanzadas que no tengan un caso de uso listo

## Estado de referencia actual
El proyecto está funcional, pero la prioridad real de trabajo diario es:
- estabilizar la operación real,
- reforzar validaciones,
- cerrar la capa de negocio que aún no está completamente resuelta,
- y evitar regresiones.

Este backlog debe ser la guía del día a día para no perder foco y no caer otra vez en cambios sin validación.
