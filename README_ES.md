# Thumbsgama AI

Thumbsgama es una web estática para Neocities con un backend Cloudflare Worker. El frontend permite crear thumbnails e iconos, adjuntar una referencia, construir composiciones divididas, continuar una imagen con instrucciones de seguimiento y guardar un pequeño historial local.

## Importante: qué necesitas para generar imágenes de verdad

- Un proyecto de GitHub para guardar este código.
- Una cuenta de Cloudflare para publicar el backend Worker y crear una base D1.
- Una clave de API del proveedor de imágenes configurada como secreto en Cloudflare. No pegues esa clave en `index.html`, GitHub, ni en un mensaje.
- El uso de una API de generación de imágenes puede tener costes. Antes de activar generación real, revisa los precios y límites de tu cuenta con un adulto de confianza.

GitHub guarda y versiona el código; no es el modelo de IA. El "cerebro" creativo está en `worker/brain.js` y el modelo de imágenes se invoca desde `worker/index.js`.

## 1. Publicar la página en Neocities

1. Sube `index.html` a tu sitio de Neocities.
2. Cambia `https://TU-USUARIO.neocities.org` en `wrangler.toml` por el dominio exacto de tu sitio.
3. No subas claves privadas a Neocities ni a GitHub.

## 2. Preparar el backend

Instala Node.js en tu computadora. Abre una terminal dentro de la carpeta del proyecto y ejecuta:

```bash
npm install -g wrangler
wrangler login
wrangler d1 create thumbsgama-db
```

Copia el `database_id` que devuelve el último comando y reemplaza `PEGA_AQUI_EL_DATABASE_ID` en `wrangler.toml`.

Crea la tabla de usos:

```bash
wrangler d1 execute thumbsgama-db --remote --file=./schema.sql
```

Guarda tu clave como secreto (la terminal te la pedirá; no la escribas en un archivo público):

```bash
wrangler secret put OPENAI_API_KEY
```

Publica el backend:

```bash
wrangler deploy
```

Wrangler mostrará una dirección similar a `https://thumbsgama-api.TU-CUENTA.workers.dev`.

## 3. Conectar Neocities con el backend

1. Abre Thumbsgama en Neocities.
2. Pulsa **Conexión API** en la barra lateral.
3. Pega la URL del Worker, sin una barra `/` al final.
4. Pulsa **Guardar conexión**. Debe mostrar `Conectado`.

## 4. Trabajar desde GitHub

Sube la carpeta completa del proyecto a tu repositorio. Para conectar despliegues automáticos, en Cloudflare Workers abre el proyecto y busca la opción de conectar con Git / GitHub en la configuración de despliegue. Mantén el secreto `OPENAI_API_KEY` en Cloudflare, nunca dentro del repositorio.

Si ya tienes un repositorio tuyo, este proyecto puede copiarse dentro de él. No se ha conectado automáticamente porque todavía no se ha proporcionado la dirección del repositorio ni acceso a él.

## Cómo funciona el límite de dos imágenes

El backend guarda dos usos diarios por identificador de navegador/dispositivo en D1. Es una protección inicial por dispositivo, no un sistema de cuentas: alguien podría cambiar de navegador o borrar el almacenamiento para obtener otro identificador. Para límites estrictos por persona se necesita añadir registro e inicio de sesión con autenticación.

## Modelos

Por defecto el Worker usa `gpt-6-astra` para el flujo conversacional y `gpt-image-2.5-sunburst` para crear/editar imágenes. Puedes modificar `REASONING_MODEL` e `IMAGE_MODEL` en las variables del Worker si tu cuenta tiene acceso a otros modelos compatibles. La disponibilidad puede depender de la cuenta y de la verificación de la organización.

## Archivos

- `index.html`: aplicación visual completa.
- `worker/index.js`: API, llamadas al modelo y contador diario.
- `worker/brain.js`: instrucciones de dirección artística y comprensión de ideas.
- `schema.sql`: tabla D1 para el límite diario.
- `wrangler.toml`: configuración del Worker y D1.
