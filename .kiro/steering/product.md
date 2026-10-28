# Resi Control - Contexto del producto

## Propósito

Resi Control es un sistema para registrar y supervisar el acceso de personas a un conjunto residencial y para controlar las encomiendas que llegan a portería. Debe permitir identificar residentes, propietarios, inquilinos y visitantes, registrar entradas y salidas, recibir y entregar paquetes, comida, recibos y correo, y ofrecer trazabilidad para la administración y vigilancia.

## Alcance del MVP

- Autenticación de usuarios del sistema.
- Perfiles iniciales: superadministrador, administrador y vigilante.
- Registro y consulta de residentes y visitantes.
- Registro de vehículos asociados a personas.
- Registro de entrada y salida, peatonal y vehicular.
- Códigos de acceso seguros con QR y código de barras para personas y vehículos.
- Registro de encomiendas: comida, paquetes, recibos de servicios y correo.
- Entrega y devolución de encomiendas con trazabilidad del usuario.
- Consulta de los últimos movimientos en el tablero principal.
- Reporte de accesos por rango de fechas.
- Configuración de la residencia, logo y formas de captura.
- Persistencia en PostgreSQL.
- Preparación para asociar una plantilla biométrica sin almacenar huellas crudas.

## Posicionamiento y validación comercial

El producto no debe venderse únicamente como un registro de huellas. Su propuesta de valor es ayudar a conjuntos residenciales a reemplazar cuadernos, Excel, WhatsApp y procesos poco trazables en portería.

Los problemas que se deben validar con administradores, vigilantes y consejos de Bogotá son:

- Falta de trazabilidad sobre quién autorizó una visita.
- Filas y demoras en portería.
- Pérdida o dificultad para consultar registros.
- Dificultad para investigar incidentes.
- Sistemas existentes complejos o difíciles de aprender.

La primera experiencia debe ser suficientemente simple para que un vigilante pueda aprender el flujo principal en aproximadamente 10 minutos.

## Modelo comercial de referencia

La hipótesis inicial es un SaaS mensual por conjunto, no una licencia única. Los precios son hipótesis de validación y no compromisos:

- Hasta 100 apartamentos: 50.000-80.000 COP mensuales.
- 100-300 apartamentos: 100.000-200.000 COP mensuales.
- Más de 300 apartamentos: desde 250.000 COP mensuales.

Antes de fijar precios se deben entrevistar clientes potenciales y ofrecer una prueba piloto controlada, por ejemplo de 30 días.

## Roadmap posterior al MVP

Solo después de validar el flujo básico con conjuntos reales se priorizarán:

- App de residentes para pre-registrar visitas peatonales o con vehículo.
- Validación del pre-registro en portería y registro automático de la entrada cuando la visita se identifica.
- Notificación al residente en tiempo real cuando su visita llega.
- Invitaciones y autorizaciones de visitantes desde el celular del residente.
- Notificación al residente cuando llega una encomienda.
- Evidencia fotográfica o firma al entregar una encomienda.
- Reportes específicos de encomiendas por fecha, tipo y estado.
- Múltiples porterías.
- Integración con cámaras.
- Integración biométrica y apertura de puertas.

## Fuera del MVP inmediato

- Integración física con lectores de huella.
- Apertura automática de puertas.
- Aplicación móvil.
- Notificaciones externas.
- Facturación o administración financiera del conjunto.

## Decisiones de negocio

- Toda persona que ingresa debe poder asociarse a un apartamento.
- Cada movimiento debe conservar tipo de acceso, fecha/hora, persona, apartamento y usuario que registró el movimiento.
- Cada encomienda debe conservar tipo, estado, destinatario, usuario que la recibe, usuario que la entrega y nombre de quien la retira.
- Las encomiendas no se eliminan: se cierran como entregadas o devueltas para conservar trazabilidad.
- Residentes y visitantes son conceptos distintos y deben conservarse como tales en los reportes.
- Los nombres de los perfiles deben poder cambiarse en el futuro sin acoplar la interfaz a nombres rígidos.
- La biometría se integrará mediante un adaptador de hardware cuando se conozcan fabricante, SDK y protocolo.

## Idioma y audiencia

La interfaz y la documentación funcional estarán en español. El código, nombres técnicos y APIs pueden mantenerse en inglés cuando sea más claro para el ecosistema TypeScript.
