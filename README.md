# Callejero Bomberos Jaén (Web)

Web simple para buscar una calle y ver:

- camión recomendado,
- itinerario,
- nota operativa.
- sugerencias de calles mientras escribes.

## Ejecutar (modo recomendado con backend)

Desde la carpeta del proyecto:

```bash
cd "/Users/victor/Desktop/CALLEJERO 2.0"
node server.js
```

Luego abre en el navegador:

- http://localhost:8000

## Acceso administrador

- Botón: `Acceso admin`
- Clave actual: `L30p0ldit0`
- La contraseña se valida en backend con hash (`scrypt`) y sesión con cookie HttpOnly.

## Añadir nuevas calles

Edita `data/routes.json` y agrega un nuevo objeto con este formato:

```json
{
  "street": "Nombre corto de calle",
  "fullDestination": "Destino completo",
  "truck": "BUL",
  "itinerary": ["Paso 1", "Paso 2", "Final"],
  "notes": "Observaciones operativas",
  "sourcePdf": "Nombre del PDF",
  "mapPdf": "./calles/Nombre PDF.pdf"
}
```

La búsqueda ignora mayúsculas/minúsculas y acentos.

## Generar datos automáticamente desde todos los PDF de `calles`

```bash
python3 "./scripts/build_routes_from_pdfs.py"
```

## Generar imágenes de planos para vista rápida

```bash
python3 "./scripts/build_plan_images.py"
```
