MI RADIO — PWA PARA ANDROID (Samsung A54)
=========================================

QUÉ ES
------
Es una web-app instalable (PWA). No tiene anuncios propios, trackers, registro ni pagos.
Las emisoras pueden emitir su propia publicidad dentro de su programación; la app no puede eliminarla.

POR QUÉ PWA
-----------
- Se instala en Android como una app normal desde Chrome.
- No necesitas Play Store ni pagar una cuenta de desarrollador.
- Si cambia un stream, la app puede buscar otro y guardar el nuevo sin reinstalar.
- Para emisoras españolas consulta TDTChannels.
- Para emisoras de Lipetsk consulta Radio Browser y mantiene enlaces de respaldo.
- También puedes editar manualmente cualquier enlace desde la propia app.

CÓMO PROBARLA EN EL PC
----------------------
1. Abre una consola dentro de esta carpeta.
2. Ejecuta:
   py -m http.server 8080
3. Abre en Chrome:
   http://localhost:8080

CÓMO INSTALARLA EN EL SAMSUNG A54
----------------------------------
La PWA debe estar publicada en HTTPS. La forma gratuita más sencilla es GitHub Pages:

1. Crea un repositorio nuevo en GitHub, por ejemplo: mi-radio.
2. Sube TODOS los archivos de esta carpeta manteniendo la carpeta icons.
3. En GitHub entra en Settings > Pages.
4. En "Build and deployment" elige "Deploy from a branch".
5. Selecciona la rama main y carpeta / (root), y guarda.
6. GitHub te dará una dirección del tipo:
   https://TU_USUARIO.github.io/mi-radio/
7. Abre esa dirección en Chrome en el Samsung A54.
8. Menú ⋮ de Chrome > "Instalar aplicación" o "Añadir a pantalla de inicio".
9. A partir de ahí aparecerá como "Mi Radio" en el móvil.

ACTUALIZACIÓN DE ENLACES
------------------------
- La app revisa enlaces automáticamente una vez cada 24 horas.
- Pulsa ↻ para forzar una revisión.
- Si un stream falla al reproducir, prueba los enlaces de respaldo y después busca uno nuevo.
- En los tres puntos de una emisora puedes ver/copiar el enlace y poner uno manual.
- En España se usa como fuente de actualización el proyecto TDTChannels.
- En Lipetsk se usa la API pública Radio Browser.

IMPORTANTE SOBRE STREAMS HTTP
-----------------------------
Algunos streams rusos antiguos sólo existen en http://. Chrome puede bloquearlos dentro de una página https://.
Por eso la app intenta encontrar primero una alternativa https:// automática. Radio России Липецк y Europa Plus ya tienen
alternativas HLS https:// incluidas. Липецк FM incluye además su URL histórica como último respaldo.

ARCHIVOS PRINCIPALES
--------------------
index.html              Interfaz
styles.css              Diseño
stations.js             Emisoras + enlaces iniciales y respaldos
app.js                  Reproductor, HLS, autorreparación y actualización
manifest.webmanifest    Instalación PWA
sw.js                   Caché de la app
icons/                   Iconos

NOTA
----
Los nombres/logotipos de emisoras se usan únicamente para identificarlas. Los streams pertenecen a sus respectivos radiodifusores.
