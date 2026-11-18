# Mi Radio para Android

Esta carpeta contiene el contenedor Android de **Mi Radio**.

## Qué cambia

La interfaz sigue siendo la web de Mi Radio alojada en GitHub Pages. Radio, podcasts,
TV, guía y cartelera mantienen la misma interfaz.

Solo la reproducción de **radio** cambia cuando se abre desde el APK:

- Media3 / ExoPlayer reproduce la emisora en un `MediaSessionService`.
- La reproducción continúa con la pantalla bloqueada.
- Android mantiene una sesión multimedia y sus controles de pantalla de bloqueo.
- El servicio escucha cambios de Wi‑Fi/datos.
- Si el stream se corta, reintenta y puede pasar al siguiente enlace configurado.
- El reproductor usa un wake lock de red mientras está activo.

En navegador/PWA normal, Mi Radio sigue usando el reproductor web existente.

## Instalación

Cuando GitHub Actions haya generado el APK:

1. Abrir en el móvil:
   `https://ruben79zgz.github.io/Mi-Radio/downloads/Mi-Radio.apk`
2. Android puede pedir permiso al navegador para **Instalar apps desconocidas**.
3. Concederlo para ese navegador y pulsar **Instalar**.
4. Abrir **Mi Radio** desde el icono nuevo.

No hace falta Android Studio ni conectar el móvil por USB.

## Compilación

El workflow `.github/workflows/build-mi-radio-android.yml` compila automáticamente
el APK cuando cambia la carpeta `android-app/` y publica el resultado en
`downloads/Mi-Radio.apk`.

La UI se carga desde GitHub Pages, así que la mayoría de futuras mejoras web no
requieren reinstalar el APK.
