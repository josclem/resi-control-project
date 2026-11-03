# Estado y roadmap de Resi Control

## Fecha de referencia
- 2026-11-03

## Resumen ejecutivo

Resi Control ya tiene una base funcional para control de acceso, personas, vehículos y encomiendas. También cuenta con un portal web acotado para residentes: activación de cuenta, consulta del perfil y de sus encomiendas, y administración del consentimiento para futuros avisos por WhatsApp. La integración actual de WhatsApp se usa para la activación del portal; no envía todavía notificaciones operativas.

La revisión de mercado compartida por el usuario muestra una oportunidad para completar primero los flujos básicos que hoy se resuelven por otros canales y, después, diferenciar el producto con automatización e IA. Esa revisión se usa como insumo de producto, no como validación independiente de cada afirmación sobre competidores. Antes de iniciar cada módulo se deben validar necesidad, reglas de negocio, viabilidad, costos y obligaciones legales con conjuntos piloto.

La prioridad inmediata sigue siendo estabilidad, trazabilidad y cierre de los flujos actuales. No se debe empezar por IA, pagos o hardware mientras los datos y procesos que esas funciones necesitan no sean confiables.

## Estado actual del producto

### Implementado

- API web y frontend React/TypeScript, PostgreSQL y Prisma.
- Autenticación y roles de superadministrador, administrador, vigilante y residente; aislamiento de datos por residencia.
- Registro de residentes y visitantes, datos de ubicación, vehículos asociados y gestión de fotografías.
- Registro de entradas y salidas, búsqueda manual, códigos QR y de barras, reglas para movimientos repetidos y autorización de supervisor.
- Registro, seguimiento y cierre de encomiendas en portería, con historial de recepción y entrega.
- Portal web de residentes para activar cuenta, consultar perfil y encomiendas, y gestionar consentimiento de notificaciones.
- Solicitud de activación del portal por WhatsApp con verificación del webhook. Esto no equivale a notificaciones de visitas o encomiendas.
- Dashboard básico y endpoint de reportes de accesos. La cobertura de reportes operativos sigue siendo parcial.
- Pruebas unitarias y de integración y validaciones de CI para los flujos críticos existentes.
- Autenticación actual con roles fijos en el código; aún no existe administración de usuarios o permisos desde la interfaz.

### Parcial o pendiente

- **Visitas:** portería registra accesos y hay códigos QR de identificación para personas y vehículos; no existe pre-registro de invitados con QR temporal, vigencia y validación al llegar.
- **Notificaciones:** hay invitaciones de portal por WhatsApp y consentimiento registrado; faltan avisos automáticos de visitas y encomiendas, trazabilidad de entrega y manejo de errores.
- **Encomiendas:** flujo básico de recepción/entrega implementado; faltan aviso automático al residente, evidencia de entrega configurable y reportes completos.
- **Residentes y usuarios:** el portal residente es limitado; falta administración de usuarios/roles desde interfaz. Los roles actuales son fijos; aún no hay roles configurables con permisos granulares. También falta modelar, si el negocio lo requiere, relaciones de propietario, arrendatario y familiares autorizados.
- **Parqueaderos:** se registra el vehículo del residente, pero no hay asignación/control de cupos, permisos de parqueadero ni operación de parqueaderos de visitantes.
- **Reportes:** existe un endpoint de accesos, pero falta una experiencia integral de reportes con filtros y cobertura de encomiendas, PQRS e incidencias.
- **Aplicación móvil:** existe una aplicación web; no hay una app nativa. Primero se debe validar si el portal web móvil cubre las necesidades.

### Aún no implementado

- Comunicados/circulares, PQRS y seguimiento de solicitudes.
- Reservas de zonas comunes y reglas de disponibilidad.
- Módulo de cartera, estados de cuenta, registro de pagos e integración PSE.
- Asambleas digitales, quórum, votación por coeficiente y generación de actas.
- Citofonía virtual.
- Repositorio y gestión de documentos del conjunto.
- Gestión integral de contratistas y alertas por vencimiento de documentos.
- Analítica de convivencia, marketplace y capacidades de IA descritas en este roadmap.

## Principios de priorización

1. Resolver primero riesgos de acceso, identidad, permisos, aislamiento por residencia y consistencia de estados.
2. Completar flujos operativos antes de agregar canales o automatización.
3. Toda función debe tener responsable, reglas de negocio, privacidad, criterios de aceptación y pruebas.
4. No presentar códigos de acceso existentes como si fueran invitaciones QR temporales.
5. Introducir IA solo sobre datos autorizados y suficientemente confiables, con resultados verificables y revisión humana para decisiones sensibles.
6. Tratar pagos, asambleas y comunicaciones conforme a las reglas contables, legales y de consentimiento que se validen para Colombia.
7. El hardware y las integraciones externas se trabajan únicamente con necesidad comprobada, proveedor/protocolo definidos y análisis de costos.

## Roadmap por fases

Las fases representan dependencias y orden de producto, no fechas comprometidas. Se pueden planear iteraciones dentro de cada fase, pero no se debe saltar un criterio de salida.

### Fase 0 — Estabilización y guardrails (cerrada: 2026-11-03)

**Objetivo:** proteger los flujos existentes y fijar una base confiable para ampliar el producto.

**Trabajo:**
- Mantener pruebas unitarias, de integración y CI para accesos, permisos, aislamiento por residencia y transiciones de encomiendas.
- Mantener la validación funcional de accesos irregulares, autorización de supervisor y operación de encomiendas.
- Asegurar trazabilidad consistente de quién realizó cada acción y cuándo.
- Documentar roles, visibilidad de datos, reglas de estados y tratamiento de errores.
- Alcance aprobado para usuarios y roles: SuperAdministrador global con acceso a todo el sistema; administradores gestionan usuarios y roles de su residencia, sin conceder permisos superiores a los propios; los roles configurables asignan permisos granulares desde un catálogo permitido; las cuentas se desactivan y se conserva su historial, sin borrado permanente.

**Validación funcional (2026-11-03):** se recorrieron los flujos desde el navegador usando exclusivamente `resi_control_test`: una entrada normal; bloqueo de entrada duplicada; rechazo de excepción sin supervisor y aceptación con credenciales válidas; recepción de encomienda, entrega con nombre del receptor y devolución. Ambas encomiendas terminaron en su estado correcto. Al finalizar se eliminaron los datos de prueba y se restauró el modo `BLOCK`.

**Validación técnica (2026-11-03):** 15 pruebas unitarias, 23 pruebas de integración y el build de API/web pasaron. El build web reportó una advertencia no bloqueante por el tamaño del bundle.

**Criterio de salida cumplido:** flujos críticos reproducibles y cubiertos por pruebas; reglas de negocio y permisos documentados; build y suites de pruebas en verde. La administración configurable de usuarios/roles queda explícitamente como funcionalidad de Fase 1; el código aún usa roles fijos.

### Fase 1 — MVP operativo para residentes y portería

**Objetivo:** reducir llamadas y coordinación manual en los flujos cotidianos de visitas, paquetes y comunicación.

**Trabajo, en este orden:**
- Completar avisos transaccionales al residente por encomienda y visita, inicialmente mediante un canal validado con conjuntos piloto. Reutilizar WhatsApp solo con consentimiento y requisitos de Meta cubiertos; considerar correo u otro canal como alternativa.
- Implementar pre-registro de visitas desde el portal web: datos mínimos, persona/vehículo, anfitrión, vigencia, cancelación y estados.
- Generar QR de invitación temporal y de un solo uso o con reglas explícitas de reutilización; validarlo en portería y registrar entrada/salida sin confundirlo con los QR permanentes de `accessCode`.
- Completar el flujo de encomiendas con evidencia de entrega configurable, permisos de acceso a la evidencia y registro de eventos de notificación.
- Implementar administración de usuarios: crear, editar y desactivar cuentas, con alcance de administrador limitado a su residencia, y sin eliminar registros históricos de auditoría.
- Reemplazar los roles fijos actuales por roles configurables de permisos granulares asignados desde un catálogo seguro. Los administradores pueden crear, editar y desactivar roles de su residencia, sin asignar privilegios que no poseen ni crear o administrar SuperAdministradores.
- Mantener el SuperAdministrador como rol privilegiado global, con acceso a todas las residencias y capacidades del sistema; proteger sus privilegios de la administración ordinaria de una residencia.
- Añadir un canal de comunicados con audiencia, publicación, vigencia y confirmación de lectura si los pilotos la requieren.
- Implementar PQRS con categorías, responsable, estados, vencimientos, comentarios visibles/internos y trazabilidad.
- Verificar que el portal funcione bien en móvil antes de decidir si se requiere una aplicación nativa.

**Criterio de salida:** residentes pueden usar los flujos acordados desde móvil; portería puede validar visitas pre-registradas; avisos y cambios de estado son auditables; permisos y consentimiento tienen pruebas.

### Fase 2 — Operación y administración del conjunto

**Objetivo:** cubrir procesos cotidianos que hoy dependen de hojas de cálculo o coordinación manual.

**Trabajo:**
- Reservas de zonas comunes con disponibilidad, aforo, anticipación, cancelaciones, reglas y posibles aprobaciones.
- Parqueaderos: inventario de cupos, asignación a unidades/residentes, permisos temporales y control de visitantes; mantenerlo separado del registro de vehículos.
- Reportes de accesos, visitas, encomiendas y PQRS con rangos de fecha, filtros útiles, permisos, exportación controlada y auditoría.
- Dashboard operativo para pendientes, vencimientos, volúmenes y tiempos de atención, con definiciones de métricas acordadas.
- Biblioteca de documentos: reglamento, manuales, actas y políticas con control de acceso, versiones y vigencia.
- Gestión de contratistas: registro de empresa/persona, conjunto y trabajo asociado, documentos requeridos (por ejemplo ARL, EPS, pólizas o certificaciones según aplique), vencimientos y alertas. Validar requisitos con asesoría competente antes de convertirlos en reglas obligatorias.

**Criterio de salida:** administración puede operar y auditar cada proceso sin consultas directas a la base de datos; reportes concuerdan con los registros fuente y respetan permisos.

### Fase 3 — Gestión financiera y gobierno digital

**Objetivo:** abordar cartera, pagos y asambleas como flujos auditables y sujetos a reglas externas.

**Trabajo:**
- Definir modelo de unidades, coeficientes, obligaciones, periodos, ajustes y estados de cuenta con la administración.
- Implementar consulta de cartera y conciliación de pagos antes de habilitar recaudo automatizado.
- Evaluar proveedores y alcance de PSE; diseñar referencias de pago, conciliación, reintentos, devoluciones, comisiones y soporte. No almacenar datos de tarjeta.
- Implementar asambleas digitales con convocatoria, identidad/elegibilidad, registro de asistencia, quórum, votación según coeficiente cuando corresponda, cierre y acta auditable.
- Validar con asesoría jurídica/contable el cumplimiento aplicable antes de declarar válidos pagos, quórum, votaciones o actas.

**Criterio de salida:** conciliación comprobable, auditoría completa y reglas aprobadas por quienes operan el conjunto; asambleas no permiten alterar votos o asistencia después del cierre sin dejar registro.

### Fase 4 — Diferenciación con automatización e IA

**Objetivo:** ahorrar tiempo usando información confiable sin automatizar decisiones sensibles de forma opaca.

**Trabajo:**
- **Resumen diario para administración:** visitas previstas, PQRS próximas a vencer, encomiendas pendientes, contratistas con documentos próximos a vencer y cartera agregada. Mostrar fecha de corte y enlazar cada dato a su registro fuente.
- **Asistente de reglamentos:** búsqueda y respuestas basadas exclusivamente en documentos vigentes del conjunto, con citas a página/sección, aviso cuando no encuentre soporte y control de acceso a documentos.
- **Copiloto de vigilancia por voz:** convertir dictado en borrador estructurado (por ejemplo, registro de paquete); pedir confirmación antes de guardar, notificar o cambiar estados; conservar quién confirmó la acción.
- **Analítica de convivencia:** indicadores agregados por periodo y zona, con definiciones transparentes, anonimización cuando sea posible y prevención de rankings que expongan indebidamente a residentes.
- **Predicción de morosidad:** prototipo solo después de disponer de datos históricos suficientes y consistentes; evaluar precisión, sesgo, explicabilidad y utilidad frente a reglas simples. No usar la predicción para sancionar, negar servicios ni tomar decisiones automáticas sobre personas.

**Criterio de salida:** cada automatización tiene evaluación contra un flujo manual, manejo explícito de incertidumbre, protección de datos, revisión humana y opción de desactivación.

### Fase 5 — Integraciones y expansión (condicionada a validación)

**Objetivo:** ampliar canales y operaciones únicamente cuando la demanda y el caso técnico estén demostrados.

**Trabajo candidato:**
- Citofonía virtual, previa validación de cobertura, identidad, disponibilidad, costos y proveedor.
- Aplicación móvil nativa solo si métricas y entrevistas muestran limitaciones relevantes del portal web.
- Integración de hardware (lectores, apertura de puertas, cámaras u otros) solo con fabricante, SDK/protocolo, soporte y pruebas de seguridad definidos.
- Marketplace de servicios del conjunto, solo tras validar demanda, moderación, responsabilidad, privacidad y modelo comercial; no mezclarlo con procesos de acceso o administración sin necesidad.

**Criterio de salida:** piloto y análisis de costo/beneficio aprobados, integración reversible, plan de soporte y riesgos documentados.

## Siguiente trabajo recomendado

1. Cerrar y sostener la Fase 0: validación funcional de flujos críticos y pruebas automatizadas.
2. Diseñar el modelo de notificaciones (eventos, consentimiento, canal, reintentos, auditoría y bajas) y validarlo con administradores/residentes.
3. Especificar y luego implementar pre-registro de visitas con QR temporal, incluyendo estados, vencimiento, cancelación y operación sin conectividad si aplica.
4. Completar avisos y evidencia de encomiendas.
5. Refinar el alcance de usuarios/unidades (propietario, arrendatario, familiares autorizados) y construir los módulos de comunicados y PQRS según necesidad validada.
6. Después de estabilizar esos flujos, planear reservas, parqueaderos, reportes, documentos y contratistas.

## Criterios de “done” para toda fase

Una fase solo se considera cerrada cuando:
- resuelve una necesidad validada con usuarios o conjuntos piloto;
- tiene reglas, roles, permisos, estados, casos límite y manejo de errores documentados;
- considera privacidad, retención y consentimiento de datos cuando aplique;
- cuenta con pruebas automatizadas y evidencia de operación del flujo completo;
- las métricas y reportes coinciden con los datos fuente;
- no rompe el comportamiento existente ni compromete la operación del conjunto.

## Decisiones de producto vigentes

- El proyecto se mantiene en español en interfaz y documentación funcional.
- La administración de usuarios debe permitir crear, editar y desactivar cuentas. La desactivación conserva los registros históricos asociados; no se hace borrado permanente desde la operación normal.
- Los permisos se configuran mediante roles con permisos granulares del catálogo de capacidades del sistema. Los administradores operan únicamente dentro de su residencia y no pueden conceder privilegios superiores a los propios.
- El SuperAdministrador es un rol de sistema global, con acceso a todas las residencias y capacidades; no puede ser creado ni administrado por un administrador de residencia.
- La cámara/QR en pantalla permanece pausada por decisión del usuario; no retomar ajustes de webcam sin nueva validación. Los códigos pueden usarse con lectores compatibles y se mantiene disponible la entrada manual.
- Las encomiendas no se eliminan: se cierran como entregadas o devueltas.
- El usuario que ejecuta una acción se obtiene del token/contexto autenticado, no del cuerpo de la solicitud.
- Los `accessCode` no cambian de formato sin actualizar todos los lectores y credenciales.
- La biometría, apertura de puertas y otras integraciones de hardware siguen fuera de prioridad hasta validar caso de uso y requisitos técnicos.

## Resumen

El producto ya resuelve una parte importante de la operación de portería y dispone de una primera experiencia de portal residente. La brecha inmediata no es añadir IA: es completar avisos, pre-registro de visitas, PQRS, comunicados y evidencia, y luego cubrir la administración integral del conjunto. La IA constituye una fase posterior de diferenciación, condicionada por datos confiables, privacidad y supervisión humana.
