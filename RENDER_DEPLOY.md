# Deploy en Render

1. Sube **todo el contenido** de esta carpeta `web` a un repositorio de GitHub.
2. En Render crea un **Web Service** conectado a ese repo.
3. Configura:
- Build Command: `npm install`
- Start Command: `npm start`
4. Añade variables de entorno:
- `GOOGLE_MAPS_API_KEY=TU_CLAVE_NUEVA`
5. Deploy.

Nota: La app usa almacenamiento local en archivos (`data/*.json`, `calles/admin_uploads`).
En Render Free el disco no es persistente entre redeploys/restarts. Para persistencia real,
usa un disco persistente de Render (si tu plan lo permite) o base de datos/almacenamiento externo.
