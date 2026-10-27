# Revisión visual de UX/UI — 27 de octubre de 2026

Se recorrieron 49 rutas distintas, con 159 combinaciones de pantalla, rol y ancho. La revisión usó Playwright con Edge (Chromium), una API local y PostgreSQL en memoria. No se consultaron ni modificaron bases reales; las llamadas externas de la API y del navegador estuvieron bloqueadas.

## Cobertura

| Perfil | Vistas verificadas |
| --- | ---: |
| Público | 54 |
| Superadministración | 63 |
| Administración deportiva | 9 |
| Administración financiera | 3 |
| Encargado de equipo | 24 |
| Árbitro | 6 |

Cada ruta se revisó a 320, 390 y 1280 px. Las interacciones añadieron comprobaciones a 768 px, tema oscuro, movimiento reducido y emulación móvil con pantalla táctil y densidad 2x. Se inspeccionaron capturas de página completa y de la ventana visible.

## Correcciones

- Los nombres largos ya no comprimen los botones de la ficha del equipo ni desbordan las tarjetas del calendario.
- El roster conserva columnas legibles, permite desplazamiento horizontal por teclado y tacto y presenta su fecha sin comprimirla en una columna estrecha.
- El estado de cuenta adapta sus importes a pantallas estrechas. La tabla de pagos muestra el concepto y una fecha breve; la API ahora devuelve la descripción y etiqueta del cargo correspondiente.
- Los diálogos de edición de equipo, documentos y baja de jugador comparten apertura modal, recorrido del foco, cierre con Escape y retorno al control que los abrió. Se bloquea el desplazamiento del fondo.
- Los campos compartidos tienen etiquetas asociadas explícitamente y ayudas/errores vinculados al control. La contraseña y su botón de visibilidad conservan nombres separados.
- Los formularios de cobro, montos y gastos conservan lo escrito ante un error de guardado y muestran el error dentro del diálogo.
- Las pestañas de finanzas admiten flechas, Inicio y Fin, anuncian su panel y exponen el estado de los detalles desplegables.
- Se etiquetaron los filtros de scrimmages y rankings; los filtros de usuarios y auditoría tienen mayor superficie táctil. Los botones compartidos admiten texto largo sin recortarlo.
- Los campos públicos usan texto de al menos 16 px en celular. Las categorías vacías de posiciones muestran un mensaje y los estados del historial aparecen en español.
- Los enlaces incompletos de actas y scrimmages ofrecen salida a la jornada. Los detalles de jugadores y las actas tienen un contexto de navegación reconocible.

## Pantallas recorridas

Las rutas con identificadores se abrieron con equipos, jugadores, partidos y documentos ficticios. Las páginas de enlaces incompletos y la ruta inexistente se comprobaron como estados de error.

| Ruta | Perfiles revisados | Anchos (px) |
| --- | --- | --- |
| `/` | Público | 320, 390, 1280 |
| `/jornada` | Público | 320, 390, 1280 |
| `/jornada/qa-round` | Público | 320, 390, 1280 |
| `/tabla` | Público | 320, 390, 1280 |
| `/estadisticas` | Público | 320, 390, 1280 |
| `/equipos/qa-home` | Público | 320, 390, 1280 |
| `/jugar` | Público | 320, 390, 1280 |
| `/favoritos` | Público | 320, 390, 1280 |
| `/jugador/qa-player` | Público | 320, 390, 1280 |
| `/partido/qa-game` | Público | 320, 390, 1280 |
| `/partido/qa-finished` | Público | 320, 390, 1280 |
| `/registro` | Público | 320, 390, 1280 |
| `/ingresar` | Público | 320, 390, 1280 |
| `/recuperar` | Público | 320, 390, 1280 |
| `/restablecer` | Público | 320, 390, 1280 |
| `/scrimmage/incomplete` | Público | 320, 390, 1280 |
| `/llenar-acta/incomplete` | Público | 320, 390, 1280 |
| `/enlace-inexistente` | Público | 320, 390, 1280 |
| `/admin` | Superadministración, Deportivo | 320, 390, 1280 |
| `/admin/interesados` | Superadministración | 320, 390, 1280 |
| `/admin/equipos` | Superadministración | 320, 390, 1280 |
| `/admin/equipos/qa-home` | Superadministración | 320, 390, 1280 |
| `/admin/validacion` | Superadministración | 320, 390, 1280 |
| `/admin/jornadas` | Superadministración | 320, 390, 1280 |
| `/admin/partidos/qa-game/acta` | Superadministración | 320, 390, 1280 |
| `/admin/usuarios` | Superadministración | 320, 390, 1280 |
| `/admin/arbitros` | Superadministración | 320, 390, 1280 |
| `/admin/scrimmages` | Superadministración | 320, 390, 1280 |
| `/admin/temporada` | Superadministración, Deportivo | 320, 390, 1280 |
| `/admin/auditoria` | Superadministración | 320, 390, 1280 |
| `/admin/ligas` | Superadministración | 320, 390, 1280 |
| `/admin/finanzas` | Superadministración, Deportivo, Financiero | 320, 390, 1280 |
| `/posiciones` | Superadministración | 320, 390, 1280 |
| `/rankings` | Superadministración | 320, 390, 1280 |
| `/power-ranking` | Superadministración | 320, 390, 1280 |
| `/historial` | Superadministración | 320, 390, 1280 |
| `/playoffs` | Superadministración | 320, 390, 1280 |
| `/cambiar-contrasena` | Superadministración | 320, 390, 1280 |
| `/admin/equipos/qa-home/roster` | Superadministración | 320, 390, 1280 |
| `/equipo` | Encargado | 320, 390, 1280 |
| `/equipo/nuevo` | Encargado | 320, 390, 1280 |
| `/equipo/jugadores/nuevo` | Encargado | 320, 390, 1280 |
| `/equipo/jugadores/qa-player` | Encargado | 320, 390, 1280 |
| `/equipo/jugadores/qa-player/editar` | Encargado | 320, 390, 1280 |
| `/jornadas` | Encargado | 320, 390, 1280 |
| `/equipo/roster` | Encargado | 320, 390, 1280 |
| `/equipo/pagos` | Encargado | 320, 390, 1280 |
| `/arbitro` | Árbitro | 320, 390, 1280 |
| `/arbitro/partido/qa-game` | Árbitro | 320, 390, 1280 |

## Validación

- Recorrido completo: cero desbordes horizontales de página, errores de JavaScript o controles visibles sin etiqueta en las 159 vistas.
- Interacciones: acceso y visibilidad de contraseña; altas desplegables de equipo, usuario, liga y jornada manual; edición de equipo; visor de documentos; confirmación de baja sin ejecutar la baja; acta compartida válida; pestañas y diálogos de finanzas; error de guardado que conserva datos; modo árbitro en vivo y emulación táctil.
- Reinicio financiero funcional contra la base efímera: eliminación de un cargo, un pago y un gasto ficticios, con balance resultante en cero.
- Compilación del frontend y backend y pruebas de reinicio/edición financiera.

La validación corresponde al motor Chromium y a los estados de prueba descritos; no es una certificación de Safari, Firefox ni de todas las combinaciones de datos posibles.

## Repetir la revisión

Desde la raíz del proyecto, compilar primero el backend y ejecutar el recorrido con Playwright disponible. `QA_PLAYWRIGHT_PATH` es opcional si el paquete se puede resolver directamente.

```powershell
npm run build --prefix backend
$env:QA_PLAYWRIGHT_PATH = '<ruta al paquete playwright instalado>'
$env:QA_WIDTHS = '320,390,1280'
$env:QA_INTERACTIONS = '1'
npm run test:visual --prefix frontend
```

El ejecutor inicia y cierra sus propios servidores (interfaz en 5189 y API en 5109), crea datos ficticios en memoria y guarda capturas y resultados en `.qa-artifacts/visual-review/`. `results.json` contiene el recorrido y `interactions.json` las pruebas de interacción. Los archivos de evidencia se mantienen fuera de Git.
