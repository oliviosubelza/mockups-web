# OSRM propio

Cómo dejar de depender del servidor público de demostración para el ruteo por calles.

## Por qué

El mapa de planificación dibuja el recorrido real que hace cada camión entre sus paradas. Esa
geometría la resuelve **OSRM** (Open Source Routing Machine) sobre datos de OpenStreetMap, y hoy sale
del servidor de demostración `router.project-osrm.org`.

Ese servidor sirve para desarrollar y no para producción. Sus dueños piden uso razonable y no dan
ninguna garantía. Medido contra él en agosto de 2026, desde Bolivia:

| Consulta | Tiempo |
| --- | --- |
| 2 coordenadas, en frío | 9,1 s |
| 22 coordenadas | 3,6 s |
| 3 en paralelo, 22 coordenadas | ~7,3 s cada una |

Un plan de seis rutas son seis de esas consultas. Cuando alguna se pasa del corte de espera, esa ruta
queda dibujada como **segmentos rectos de parada a parada** — el plan se sigue leyendo, pero el dibujo
cruza manzanas y el mapa afirma una distancia que ningún camión va a manejar. Un OSRM propio con el
extracto de Bolivia contesta lo mismo en milisegundos.

## Levantarlo

Hace falta Docker y ~2 GB de disco. El extracto de Bolivia de Geofabrik pesa unos 90 MB; el
preprocesado lo multiplica.

```bash
mkdir -p osrm && cd osrm

# 1. El mapa de Bolivia. Se actualiza a diario; bajarlo de nuevo es la forma de actualizar el ruteo.
curl -O https://download.geofabrik.de/south-america/bolivia-latest.osm.pbf

# 2. Preprocesado, con el perfil de auto. Los tres pasos son de UNA vez: el resultado queda en disco.
#    `mld` (multi-level Dijkstra) tarda menos en preprocesar que `ch` y contesta igual de rápido para
#    consultas de ruta como las nuestras.
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/bolivia-latest.osm.pbf
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/bolivia-latest.osrm
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/bolivia-latest.osrm

# 3. El servidor. Queda escuchando en el 5000.
docker run -t -i -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-routed --algorithm mld /data/bolivia-latest.osrm
```

Comprobar que anda, con dos puntos de Santa Cruz:

```bash
curl "http://localhost:5000/route/v1/driving/-63.17,-17.786;-63.15,-17.80?overview=full"
```

Tiene que devolver `{"code":"Ok",...}`.

## Apuntar la app

En el `.env` (ver `.env.example`):

```
VITE_OSRM_URL=http://localhost:5000/route/v1/driving
```

**Va la ruta completa, con el perfil incluido.** El perfil (`driving` acá, porque se compiló con
`car.lua`) es parte de cómo se levantó ese servidor: adivinarlo desde el código sería inventar una
convención que el contenedor no tiene por qué respetar.

Vite lee el `.env` al arrancar, así que hay que reiniciar el dev server.

## Qué cambia en el código

Nada más que la variable. `src/mockup/services/routing-osrm.ts` es el único archivo que sabe de dónde
sale la geometría — la respuesta de un OSRM propio es idéntica a la del demo, porque es el mismo
software. `OSRM_ES_DEMO` queda en `false` y los avisos de fallo dejan de culpar al servidor público.

## Si el ruteo falla

El mapa cae al trazo recto y lo **dice**: aparece un botón ámbar en la barra de herramientas del mapa
con cuántas rutas quedaron sin recorrido real, y ese botón reintenta solo las que fallaron. También
salta un aviso al terminar de optimizar.

Para diagnosticar: DevTools → Network → filtrar por `osrm`.

| Lo que se ve | Qué es |
| --- | --- |
| `(canceled)` | Se pasó del corte de espera (`TIMEOUT_MS`, 45 s) |
| 429 | El demo público está limitando por cantidad de pedidos |
| Sin ningún pedido | La red de la empresa bloquea el dominio, o el ruteo está apagado desde Capas |
| `{"code":"NoSegment"}` | Alguna coordenada no engancha a ninguna calle: revisar el depósito de esa distribuidora |
