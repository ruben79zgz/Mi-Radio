# Mi Resultados V1

PWA personal de resultados de fútbol.

## V1
- Partidos por fecha
- En directo con refresco automático
- Favoritos por equipo
- Alertas de inicio, gol y final mientras la PWA está activa
- Buscador de equipos
- Ficha de partido con incidencias, estadísticas y alineaciones cuando existen
- Copia de respaldo actualizada por GitHub Actions cada 5 minutos

## Datos
La aplicación usa los endpoints JSON públicos que utiliza la web de SofaScore como proveedor principal. No es una API oficial ni garantizada; el código está aislado para poder cambiar de proveedor sin rehacer la interfaz.

La copia en GitHub es solo respaldo. El navegador intenta primero los datos directos.

## Próximos pasos
- Clasificaciones y páginas de competición
- Página de equipo/jugador
- Notificaciones push con la aplicación cerrada mediante backend gratuito
- Segundo proveedor opcional (API-Football u otro)
