MI TV - PHILIPS LEGACY

URL:
https://ruben79zgz.github.io/Mi-Radio/tv-legacy/

Objetivo:
Versión separada de la app para el navegador antiguo de la Philips/SAPHI.

Características:
- Un único HTML.
- Sin frameworks.
- Sin Service Worker.
- Sin async/await, fetch, módulos ni sintaxis JavaScript moderna.
- Reproductor <video> nativo.
- Botones grandes para mando/TV.
- Secciones Rusos y España.
- Botón "Abrir stream directo" si el <video> falla, para intentar que la Philips entregue el HLS a su reproductor nativo.

Limitación:
Si el navegador/reproductor multimedia de la Philips no soporta HLS (.m3u8), ningún JavaScript antiguo puede añadir esa capacidad por sí solo. En ese caso el botón de stream directo es la mejor prueba.
