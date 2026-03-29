# Traductor ES / EN / DE para Firefox y Chrome

WebExtension orientada a traducir palabras y frases entre español, inglés y alemán.

## Qué hace

- Traducción rápida desde una selección en páginas web mediante un botón flotante.
- Traducción desde menú contextual con `clic derecho > Traducir selección ES/EN/DE`.
- Guardado de palabras y frases desde popup o menú contextual para repasarlas más tarde.
- Popup manual para pegar texto y traducirlo.
- Selección de idioma origen y destino directamente en la cabecera de cada panel del popup.
- Opción de chincheta para abrir una ventana fija que no se cierra al perder el foco.
- Atajos de teclado:
  - `Alt+Shift+T` para traducir la selección actual.
  - `Command+Shift+J` en macOS, o `Alt+Shift+J` como sugerido general, para traducir la selección actual en un PDF cuando el navegador la expone.
  - `Command+Shift+U` en macOS, o `Alt+Shift+U` como sugerido general, para activar el selector de bloques.
- Extras léxicos opcionales en el popup:
  - sinónimos para palabras sueltas en inglés y alemán
  - ejemplos de uso para español, inglés y alemán
- Flujo práctico para PDF:
  - Si el navegador expone la selección al menú contextual, puedes traducir directamente desde ahí.
  - También puedes usar el atajo específico de PDF para intentar traducir la selección actual y abrir el resultado en la vista grande.
  - Si no, puedes copiar el texto del PDF y pegarlo en el popup.

## Arquitectura

- `manifest.json`: manifest de Firefox.
- `manifest.chrome.json`: manifest de Chrome.
- `browser-api.js`: capa de compatibilidad `browser`/`chrome` con promesas.
- `background.js`: menús, traducción, almacenamiento y comandos.
- `content-script.js`: detección de selección y traducción inline en páginas HTML.
- `popup.html` + `popup.js`: interfaz rápida del toolbar y vista ampliada.
- `options.html` + `options.js`: configuración del endpoint de traducción.
- `scripts/build.mjs`: genera `dist/firefox` y `dist/chrome`.

## Servicio de traducción

La extensión usa por defecto un endpoint compatible con LibreTranslate:

- Base URL: `https://www.fairtranslate.eu`
- Path: `/translate`

La extensión migra automáticamente el endpoint público legado de Argos OpenTech si todavía estaba guardado, porque ese host ya no responde. Aun así, las instancias públicas pueden fallar, cambiar o exigir límites. Si vas a usar esto en serio, configura una instancia propia o un proveedor estable.

Para hacer pruebas rápidas, en Opciones también puedes cargar un preset de MyMemory (`https://api.mymemory.translated.net/get`). Ten en cuenta que MyMemory encaja peor para textos largos y su API gratis tiene límites más estrictos, así que úsalo como comparación o fallback, no como backend definitivo salvo que te convenza el resultado en tu caso.

Si prefieres DeepL, en Opciones tienes presets para `DeepL API Free` (`https://api-free.deepl.com/v2/translate`) y `DeepL API Pro` (`https://api.deepl.com/v2/translate`). Necesitarás pegar tu API key. Para una extensión distribuida, lo más prudente es no dejar la key en cliente y pasar por un backend propio.

## Builds

```bash
npm run build
npm run build:firefox
npm run build:chrome
npm run package:firefox
npm run package:chrome
```

El script genera:

- `dist/firefox`
- `dist/chrome`

## Cargar la extensión en Firefox

1. Abre `about:debugging#/runtime/this-firefox`
2. Pulsa `Load Temporary Add-on...`
3. Selecciona el archivo `dist/firefox/manifest.json`

## Cargar la extensión en Chrome

1. Abre `chrome://extensions`
2. Activa `Developer mode`
3. Pulsa `Load unpacked`
4. Selecciona la carpeta `dist/chrome`

## Limitación importante sobre PDF

El visor PDF integrado del navegador no se comporta igual que una página web normal para una WebExtension. Por eso el soporte realista para PDF se basa en:

- menú contextual sobre texto seleccionado, cuando el navegador lo permite
- atajo específico de PDF para traducir selección, cuando el navegador expone esa selección al comando
- copia y pegado en el popup, como fallback

El atajo de PDF no muestra overlay ni selector de bloques dentro del visor. Si el navegador no deja leer la selección desde ahí, la extensión abrirá la vista de resultados con una ayuda breve para continuar con clic derecho o copia y pega.

Si quieres un soporte PDF más agresivo que lea y procese el documento completo, el enfoque correcto ya no es solo un content script: habría que añadir una página propia del visor o un pipeline específico para PDFs.
