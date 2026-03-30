# Meta Ads Campaign Builder - Descripción del Proyecto

## Qué es

Una herramienta web donde cualquier persona del equipo puede entrar, conectar su cuenta de Meta Ads y crear o modificar campañas publicitarias de forma automatizada, sin necesidad de tocar el Ads Manager de Facebook directamente.

---

## Flujo completo de la herramienta

### 1. Conexión con Meta

Al entrar en la app, el usuario conecta su cuenta de Facebook/Meta. Puede hacerlo de dos formas:
- **OAuth con Facebook** (botón "Conectar con Facebook")
- **Pegando un token manualmente** desde el Graph API Explorer

Una vez conectado, la app accede a todos los portfolios comerciales (Business Portfolios) y cuentas publicitarias asociadas a ese usuario.

### 2. Selección de cuenta

Se muestran todos los **portfolios comerciales** del usuario y, dentro de cada uno, sus **cuentas publicitarias**. También se listan las **páginas de Facebook** disponibles.

El usuario elige:
- En qué cuenta publicitaria quiere trabajar
- Qué página de Facebook usar para publicar los anuncios

Si aparece un portfolio nuevo o una cuenta nueva, se actualiza automáticamente.

### 3. Crear o Modificar campaña

El usuario elige entre dos opciones:
- **Crear Nueva Campaña**: arranca el flujo desde cero
- **Modificar Campaña Existente**: se despliega un listado con todas las campañas activas e inactivas de esa cuenta para elegir cuál modificar

### 4. Subir la estrategia

El usuario sube un **documento** (PDF, DOCX, TXT) con toda la información de la campaña. La herramienta usa **inteligencia artificial (Claude)** para leer el documento y extraer automáticamente:

- Nombre de la campaña
- Objetivo (Ventas, Tráfico, Leads, etc.)
- Tipo de presupuesto (CBO o ABO)
- Presupuesto diario
- URL de destino
- Estructura de Ad Sets (conjuntos de anuncios) con su targeting
- Estructura de Ads (anuncios) con sus textos y creativos

**Si falta cualquier información obligatoria**, la herramienta la pide al usuario antes de continuar. No se avanza hasta tener todo completo:
- Nombre de la campaña
- Objetivo
- Tipo de presupuesto (CBO/ABO)
- Presupuesto diario
- URL de destino

### 5. Creativos (imágenes y vídeos)

El usuario proporciona los creativos de dos formas posibles:

#### Opción A: Carpeta de Google Drive (link)
Se pega el enlace de una carpeta de Drive. La herramienta descarga y previsualiza todos los archivos (imágenes y vídeos) con sus nombres.

La asignación de creativos a cada Ad Set se hace de dos maneras:
1. **Por subcarpetas**: dentro de la carpeta principal hay subcarpetas con el nombre de cada Ad Set (mismo nombre que en el documento de estrategia). Dentro de cada subcarpeta están los creativos de ese Ad Set.
2. **Por nombre de archivo**: si no hay subcarpetas, los creativos se identifican y asignan automáticamente porque sus nombres coinciden con los del documento de estrategia.

#### Opción B: Subida manual
El usuario sube los archivos directamente desde su ordenador.

En ambos casos, el usuario ve un **dashboard con todos los creativos** (thumbnails de imágenes y vídeos) y puede:
- Seleccionar cuáles van a la campaña (puede que no sean todos)
- Ver cómo están asignados a cada Ad Set
- Confirmar la selección

### 6. Preview (previsualización)

Antes de publicar, el usuario ve un resumen completo de la campaña:
- Nombre generado de la campaña
- Objetivo y presupuesto
- Parámetros UTM configurados
- Cada Ad Set con su targeting (edad, género, países, intereses)
- Cada anuncio con su headline, texto, CTA y creativo asignado
- Avisos si hay algún problema

### 7. Deploy (publicación en Meta)

Con un clic, la campaña se despliega en Meta Ads. El progreso se muestra en **tiempo real**:
- Subida de creativos
- Creación de la campaña
- Creación de cada Ad Set
- Creación de cada anuncio

Todo se crea en estado **PAUSED** para que el usuario pueda verificar en Ads Manager antes de activar.

Si algo falla durante el deploy, hay opción de **rollback** (deshacer todo lo creado).

### 8. Gestión post-deploy

Una vez desplegada, la herramienta permite gestionar la campaña:
- **Cambiar presupuesto** (a nivel campaña o ad set)
- **Pausar/activar anuncios** individualmente
- **Editar textos** (headline, primary text, descripción) de cada anuncio
- **Añadir nuevos creativos**: se sube un nuevo creativo y la IA analiza en qué Ad Set encaja mejor, sugiriendo dónde colocarlo
- **Ver estructura completa** con targeting de cada Ad Set

---

## Estado actual

- **Frontend**: React + TypeScript, desplegado en Vercel
- **Backend**: Node.js (Express), desplegado en Vercel como función serverless
- **Base de datos**: Vercel Postgres (Neon) — permanente
- **IA**: Claude (Anthropic) para parsear documentos y analizar creativos
- **URL**: https://campanas-meta-creator.vercel.app

### Pendiente de arreglar
- Las rutas del backend necesitan adaptarse al nuevo driver de base de datos (migración de SQLite a Postgres en curso)
- Configurar el dominio de Vercel en la app de Meta para que el OAuth funcione sin necesidad de pegar tokens manualmente

---

## Credenciales y tokens necesarios

### Meta App (Facebook for Developers)
- **App Name**: Creador Campañas V2
- **App ID**: 927220653050096
- **App Secret**: dff3982917e72a39b588b177489066c5

### Meta Access Token (Graph API Explorer)
```
EAANLTWGnSPABRGKyCzuXv0tJ9Yupt8Wj8R1Jjez5Lt5XFZCiEAZAFXZA1H808HxkdX1trbG5qyzfa5Qd7paTMX3oBIRfsQYEiwjTFC05lNCXrka5jd3thBWdWxBVNwD3Yy1xUulaQvMYarj50Fn92XD9YUcuuBiMgyxGeZA7btVd4zsmndWcakGhzE27IZCGVqAZDZD
```
*(Los tokens de Graph Explorer expiran cada ~1 hora. Hay que regenerarlos en https://developers.facebook.com/tools/explorer/)*

### Anthropic (Claude API)
- **API Key**: (configurada en las variables de entorno de Vercel - no incluir en código)

### Vercel Postgres (Neon)
- **Database URL**: postgresql://neondb_owner:npg_doHSZNRwFb16@ep-dawn-mouse-anl6apd4-pooler.c-6.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
- **Host**: ep-dawn-mouse-anl6apd4-pooler.c-6.us-east-1.aws.neon.tech
- **User**: neondb_owner
- **Password**: npg_doHSZNRwFb16
- **Database**: neondb

### Encryption Key
- **Key**: bFJBCxA0XLyWtWKA93dQ54Y6Efc-mjrAwgdwEyDuMGE=

### Variables de entorno en Vercel
| Variable | Valor |
|---|---|
| META_APP_ID | 927220653050096 |
| META_APP_SECRET | dff3982917e72a39b588b177489066c5 |
| ANTHROPIC_API_KEY | (ver dashboard de Anthropic) |
| ENCRYPTION_KEY | bFJBCxA0XLyWtWKA93dQ54Y6Efc-mjrAwgdwEyDuMGE= |
| BASE_URL | https://campanas-meta-creator.vercel.app |
| CORS_ORIGINS | https://campanas-meta-creator.vercel.app |
| DATABASE_URL | (auto-configurada por Vercel Postgres) |
| POSTGRES_URL | (auto-configurada por Vercel Postgres) |

---

## Repositorio

- **GitHub**: https://github.com/thiagobeboostup/Campanas-Meta-Creator
- **Rama principal**: main
- **Frontend**: carpeta `frontend/`
- **Backend**: carpeta `api/`
