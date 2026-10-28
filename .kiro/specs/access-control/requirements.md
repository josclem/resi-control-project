# Spec: Control de acceso residencial

> Nota de estado: esta es la especificación original del MVP. El alcance implementado es más amplio (vehículos, QR/código de barras, fotografías, configuración y encomiendas). El estado vigente está en [CONTEXTO_PROYECTO.md](C:/Users/klement/resi-control/CONTEXTO_PROYECTO.md) y en las specs `.kiro/specs/access-control/design.md` y `.kiro/specs/encomiendas/`.

## Objetivo

Construir el primer flujo operativo de Resi Control para autenticar al personal autorizado, registrar personas y guardar movimientos de entrada y salida.

## Actores

- **Superadministrador:** administra usuarios, perfiles y configuración global.
- **Administrador:** administra personas y consulta reportes.
- **Vigilante:** registra entradas/salidas y consulta la actividad reciente.
- **Residente:** persona registrada que vive o es propietaria de un apartamento.
- **Visitante:** persona externa autorizada o registrada para ingresar.

## Requisitos funcionales

### Autenticación

1. El sistema debe permitir iniciar sesión con correo y contraseña.
2. El sistema debe entregar una sesión autenticada con expiración.
3. El sistema debe rechazar usuarios inactivos.
4. El sistema debe autorizar operaciones según el perfil del usuario.

### Personas

1. Un usuario autorizado debe poder registrar un residente o visitante.
2. La persona debe tener nombre completo, apartamento y tipo.
3. Documento y teléfono deben ser opcionales inicialmente.
4. La persona debe poder tener una referencia biométrica opcional.
5. Una persona inactiva no debe poder recibir nuevos movimientos.

### Accesos

1. Un usuario autenticado debe poder registrar `ENTRADA` o `SALIDA`.
2. Cada movimiento debe conservar la fecha y hora del servidor.
3. Cada movimiento debe relacionarse con una persona y con el usuario que lo registró.
4. No se deben eliminar movimientos desde el flujo operativo.

### Dashboard y reportes

1. El dashboard debe mostrar los últimos 10 movimientos.
2. Debe mostrar totales de residentes, visitantes y movimientos del día.
3. El sistema debe permitir consultar accesos por rango de fechas.
4. Los resultados deben distinguir residentes de visitantes y entradas de salidas.

## Requisitos no funcionales

- La base de datos debe ser PostgreSQL.
- El backend y frontend deben estar escritos en TypeScript.
- Las entradas deben validarse antes de llegar a la base de datos.
- Los errores deben devolverse con mensajes claros y códigos HTTP apropiados.
- El sistema debe quedar preparado para migrar PostgreSQL local a PostgreSQL administrado en la nube cambiando la conexión.

## Criterios de aceptación del MVP

- Un administrador puede iniciar sesión con el usuario seed.
- Un administrador puede registrar residentes y visitantes.
- Un vigilante autenticado puede registrar entradas y salidas.
- El dashboard refleja los movimientos guardados.
- El reporte filtra por fechas.
- `npm run build` termina sin errores.
