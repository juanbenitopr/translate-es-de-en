# Política de Privacidad

Última actualización: 29 de marzo de 2026

Esta política de privacidad describe cómo la extensión **Traductor ES / EN / DE** trata la información del usuario.

## Resumen

- La extensión **no vende datos** y **no utiliza los datos del usuario para publicidad**.
- La extensión **no incorpora ni ejecuta código remoto**.
- La extensión **no recopila historial de navegación** ni monitoriza la actividad del usuario de forma continua.
- La extensión **solo procesa el texto que el usuario selecciona, pega o decide guardar de forma explícita**.

## Qué datos procesa la extensión

La extensión puede procesar las siguientes categorías de información:

1. **Texto seleccionado o pegado por el usuario**
   - Texto seleccionado en una página web.
   - Texto pegado manualmente en el popup de la extensión.
   - Texto seleccionado por el usuario mediante el selector de bloques.

2. **Configuración local de la extensión**
   - Idioma de origen y destino.
   - Modo de traducción y preferencias relacionadas.
   - Endpoint o proveedor de traducción configurado por el usuario.
   - API key introducida por el usuario, si decide configurar un proveedor que la requiera.

3. **Datos guardados localmente por decisión del usuario**
   - Palabras o frases que el usuario decide guardar para repasarlas más tarde.
   - Último resultado mostrado, borradores del popup y mensajes internos de estado.

## Cómo se usan los datos

La extensión utiliza esos datos únicamente para:

- traducir el texto solicitado por el usuario
- mostrar el resultado dentro del popup o en la página
- guardar preferencias y configuración local
- permitir que el usuario guarde palabras o frases para uso posterior

La extensión no usa estos datos para elaboración de perfiles, publicidad ni analítica comercial.

## Cuándo se envían datos fuera del navegador

Cuando el usuario solicita una traducción, el texto necesario para completar esa traducción puede enviarse al **servicio de traducción configurado por el usuario**.

La extensión incluye presets para servicios compatibles con LibreTranslate, MyMemory y DeepL, y también permite configurar un endpoint propio.

Eso significa que:

- el texto enviado depende de la acción iniciada por el usuario
- el proveedor de traducción recibe el texto necesario para devolver la traducción
- el tratamiento de esos datos por parte de ese proveedor se rige por la política de privacidad del propio proveedor

Si el usuario configura una API key de un proveedor externo, esa clave se almacena localmente en el navegador para poder realizar las solicitudes de traducción.

## Almacenamiento local

La extensión guarda datos en el almacenamiento local del navegador para que la funcionalidad sea usable entre sesiones. Esto puede incluir:

- configuración del servicio de traducción
- preferencias de idioma y modo
- textos guardados por el usuario
- último resultado de traducción
- borradores temporales del popup

Estos datos permanecen en el navegador del usuario hasta que este los borra, desinstala la extensión o modifica la configuración.

## Permisos del navegador

La extensión solicita permisos del navegador únicamente para ofrecer sus funciones principales:

- `contextMenus`: para traducir o guardar texto desde el menú contextual
- `storage`: para guardar configuración y elementos guardados localmente
- `tabs`: para interactuar con la pestaña activa cuando el usuario inicia una acción
- permisos de host sobre `http://*/*` y `https://*/*`: para detectar la selección del usuario y mostrar la interfaz de traducción en las páginas visitadas

La extensión no accede al contenido de las páginas salvo cuando es necesario para la función solicitada por el usuario.

## Compartición de datos

La extensión no vende ni alquila información del usuario a terceros.

La única compartición prevista es la necesaria para completar la traducción con el proveedor configurado por el usuario, cuando el usuario inicia esa acción.

## Seguridad

La extensión intenta minimizar la cantidad de datos tratados y guardados. No obstante, ningún sistema puede garantizar seguridad absoluta.

Si el usuario configura un proveedor externo, también debe revisar la seguridad y la política de privacidad de ese proveedor.

## Menores

La extensión no está diseñada específicamente para menores ni dirigida de forma específica a niños.

## Cambios en esta política

Esta política puede actualizarse si cambia el funcionamiento de la extensión o sus integraciones. La fecha de la última actualización se modificará en este documento cuando exista un cambio relevante.

## Contacto

Si tienes preguntas sobre esta política de privacidad, puedes contactar con:

**impactlab.developer@gmail.com**
