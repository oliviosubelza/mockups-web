    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    CREATE EXTENSION postgis;

    CREATE TABLE distributors (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(50) NOT NULL, -- Nombre comercial de la distribuidora/agencia
        latitude NUMERIC(9,6) NOT NULL, -- Coordenada GPS de la planta/centro
        longitude NUMERIC(9,6) NOT NULL,
    --     department_id BIGINT NOT NULL, -- Departamento/Estado geográfico
        city_id BIGINT NOT NULL,
        code_sap BIGINT, -- Código de distribuidora en SAP/Ventas
        is_active BOOLEAN NOT NULL DEFAULT TRUE

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
    );

    CREATE TABLE sale_channel_restrictions(
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        description VARCHAR(100) NOT NULL,
        distributor_id BIGINT NOT NULL, -- Centro de distribución que aplica la restricción
        sale_channel_id BIGINT NOT NULL, -- Canal de venta afectado (ej. Mayorista, Detalle)
        cut_off_time TIME NOT NULL, -- Hora límite de pedido para ingresar en la planificación

        created_by VARCHAR(50),
        updated_by VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,

        CONSTRAINT fk_sale_channel_restriction_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );

    CREATE TABLE zones (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(50) NOT NULL, -- Nombre de la zona de reparto (ej. Zona Norte)
        polygon GEOMETRY(Polygon, 4326) NOT NULL, -- Geometría GeoJSON con el perímetro de la zona
        city_id BIGINT NOT NULL,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    -- ── ZONAS DE DISTRIBUCIÓN ─────────────────────────────────────────────────────────────────
    -- A QUÉ DISTRIBUIDORA le toca un pedido, según dónde cae.
    --
    -- NO ES `zones`, Y LA DIFERENCIA NO ES DE TAMAÑO SINO DE PREGUNTA. Son dos cortes
    -- INDEPENDIENTES del mismo territorio:
    --   · `zones` parte UNA ciudad en pedazos para armar rutas: contesta "qué paradas van juntas
    --     en el mismo camión". Muchas zonas por ciudad, sin dueño.
    --   · `distribution_zones` parte la ciudad entre DISTRIBUIDORAS: contesta "quién despacha
    --     este pedido". VARIAS zonas por distribuidora, y la distribuidora ES su dueña.
    -- Un pedido cae primero en una zona de distribución (quién lo despacha) y después en una de
    -- reparto (con quién viaja). No tienen por qué coincidir.
    --
    -- SOLO HACE FALTA CON DOS O MÁS DISTRIBUIDORAS EN LA CIUDAD. Con una sola, todo lo de esa
    -- ciudad es suyo por descarte, y dibujarle un polígono solo lograría que los pedidos de afuera
    -- no le lleguen a nadie. De ahí que la relación sea 0..N y no 1: las filas aparecen recién
    -- cuando hay que partir el mapa.
    --
    -- POR QUÉ NO TIENE `name`. El nombre de la zona es el nombre de la distribuidora, y guardarlo
    -- acá sería tener dos nombres para la misma cosa esperando a divergir. Se lee con un JOIN.
    --
    -- POR QUÉ NO TIENE `city_id`. La ciudad es de la DISTRIBUIDORA (`distributors.city_id`).
    -- Repetirla acá dejaría que la zona diga 'Montero' y su dueña 'Warnes', sin forma de saber
    -- cuál de las dos manda.
    --
    -- VARIAS ZONAS POR DISTRIBUIDORA, y por eso NO hay índice único sobre `distributor_id`.
    --
    -- Arrancó como 1 a 1 —un polígono por distribuidora, con un `UNIQUE (distributor_id) WHERE
    -- deleted_at IS NULL` que lo hacía cumplir— y la realidad no entra en esa forma: un territorio de
    -- reparto no siempre es una mancha conexa. Un centro atiende un cuadrante de la ciudad Y un par de
    -- barrios sueltos del otro lado del río; ese caso con un solo polígono obliga a estirar el
    -- contorno por el medio de la zona del vecino para poder llegar, y ahí el polígono deja de decir
    -- la verdad sobre quién despacha qué.
    --
    -- Lo que la tabla sigue impidiendo es el SOLAPE entre distribuidoras distintas, pero eso ninguna
    -- restricción declarativa lo puede sostener: es una comprobación geométrica
    -- (`ST_Overlaps` entre las filas vivas de la misma ciudad) y vive en la aplicación. El borrado es
    -- lógico: sin eso, redibujar una zona de una
    -- distribuidora quedaría bloqueado para siempre por la fila vieja.
    CREATE TABLE distribution_zones (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        distributor_id BIGINT NOT NULL, -- Dueña de la zona; también aporta el nombre y la ciudad
        polygon GEOMETRY(Polygon, 4326) NOT NULL, -- Perímetro dentro del cual esta distribuidora despacha
        city_id VARCHAR(255),

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,

        CONSTRAINT fk_distribution_zone_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );
    -- ── RESTRICCIONES DE PLANIFICACIÓN ────────────────────────────────────────────────────────
    -- Zonas restringidas, vías cerradas y placas de circulación: los límites que la planificación
    -- tiene que respetar y que no salen ni de los pedidos ni de la flota.
    --
    -- UNA SOLA CABECERA PARA LOS TRES TIPOS, y no tres tablas. No son tres entidades: son tres
    -- combinaciones de los mismos ejes —un DÓNDE (geometría, o ninguna), un CUÁNDO y un A QUIÉN—.
    -- Separarlas obligaría a escribir tres veces la vigencia, tres CRUD y tres evaluaciones.
    --
    -- NO VAN EN `zones`, y eso es deliberado. `zones` es un PARTICIONAMIENTO del territorio que
    -- Ventas referencia por id: no puede tener huecos ni solapes, por eso su regla de holgura
    -- mínima entre bordes. Una zona restringida es un RECORTE: se apila libremente sobre las de
    -- reparto y sobre otras restringidas —una avenida en obra que cruza tres zonas es el caso
    -- normal—. Compartir tabla rompería la invariante de holgura para la mitad de las filas y
    -- haría que la consulta de "resolver la zona de un punto" devuelva restricciones como si
    -- fueran territorio de reparto.
    CREATE TABLE planning_restrictions (
        id BIGSERIAL PRIMARY KEY,
        distributor_id BIGINT NOT NULL, -- Centro de distribución que administra la restricción
        name VARCHAR(50) NOT NULL, -- Nombre con el que se la reconoce (ej. 'Centro histórico')
        description VARCHAR(100), -- Detalle libre: ordenanza, motivo de la obra, etc.
        restriction_type VARCHAR(30) NOT NULL, -- 'RESTRICTED_AREA', 'CLOSED_ROAD', 'PLATE_ROTATION'
        effect VARCHAR(30) NOT NULL, -- Qué prohíbe: 'NO_TRANSIT', 'NO_DELIVERY', 'NO_VEHICLE'
        severity VARCHAR(20) NOT NULL DEFAULT 'WARNING', -- 'BLOCKING', 'WARNING'
        -- Geometría INLINE y no en tabla satélite: una restricción tiene exactamente una geometría
        -- o ninguna (1:1). Polygon para un área, LineString para un tramo de vía, NULL en
        -- PLATE_ROTATION, que no es geográfica. Mismo formato que `zones.polygon_geojson`.
        geometry_geojson JSONB, -- Geometría GeoJSON: Polygon (área) o LineString (vía). NULL en PLATE_ROTATION
        is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Dada de baja no restringe nada, aunque esté vigente

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_planning_restriction_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );

    -- CUÁNDO rige. SIN FILAS = PERMANENTE.
    --
    -- Es 1:N y no un juego de columnas en la cabecera porque "lunes y martes de 7 a 9, y sábados
    -- de 8 a 12" son TRES reglas sobre la misma restricción. Con columnas hay que inventar
    -- `horario_2`, `horario_3`, y no hay número que alcance.
    --
    -- COMBINACIÓN: dentro de una fila los campos van con Y (day_of_week + start_time es "los lunes
    -- de 7 en adelante"); entre filas van con O. Un campo NULL no estrecha: sin día es todos los
    -- días, sin horas son las 24 h, sin fechas es para siempre.
    --
    -- OJO CON LA FRANJA NOCTURNA: si start_time > end_time la franja cruza la medianoche (22:00 a
    -- 06:00) y la comparación se invierte —rige del inicio a medianoche O de medianoche al fin—.
    -- Con un `start <= h AND h < end` ingenuo esa fila no rige NUNCA. Cuando envuelve, day_of_week
    -- se refiere al día en que la franja EMPIEZA.
    CREATE TABLE planning_restriction_schedules (
        id BIGSERIAL PRIMARY KEY,
        planning_restriction_id BIGINT NOT NULL, -- FK a planning_restrictions. Restricción a la que pertenece la franja
        valid_from DATE, -- Primer día, inclusive. NULL = sin inicio
        valid_to DATE, -- Último día, inclusive. NULL = sin fin
        day_of_week SMALLINT, -- 0=domingo … 6=sábado. NULL = todos los días
        start_time TIME, -- NULL = desde las 00:00
        end_time TIME, -- NULL = hasta las 24:00. EXCLUSIVO

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_restriction_schedule_restriction FOREIGN KEY (planning_restriction_id) REFERENCES planning_restrictions(id)
    );

    -- A QUIÉN le aplica. SIN FILAS = A TODA LA FLOTA.
    --
    -- Misma combinación que los horarios: Y dentro de una fila, O entre filas. Una fila con
    -- plate_last_digit = 3 y min_capacity_weight_kg = 3500 es "los pesados terminados en 3";
    -- "los lunes no circulan el 1 y el 2" son dos filas.
    --
    -- LOS DOS PRIMEROS CAMPOS SE COMPUTAN, NO SE TILDAN. El usuario configura la regla y el
    -- sistema deriva a qué camiones les pega leyendo `trucks`. Si hubiera que marcar camiones a
    -- mano, el día que entra uno nuevo a la flota nadie se acuerda y el plan sale con un vehículo
    -- que no puede circular. `plate` es la excepción: es la lista negra puntual.
    --
    -- EL ÚLTIMO DÍGITO NO ES EL ÚLTIMO CARÁCTER: el formato de placa es 4821-XKD (números primero,
    -- letras después), así que hay que extraer el bloque numérico y tomar su último dígito. Y el
    -- tonelaje NO sale de la placa: sale de trucks.capacity_weight_kg. Ninguna serie de placa
    -- codifica peso.
    CREATE TABLE planning_restriction_vehicle_rules (
        id BIGSERIAL PRIMARY KEY,
        planning_restriction_id BIGINT NOT NULL, -- FK a planning_restrictions. Restricción a la que pertenece la regla
        plate_last_digit SMALLINT, -- Pico y placa. Se computa desde trucks.plate
        min_capacity_weight_kg DECIMAL(12, 2), -- "Solo pesados". Se lee de trucks.capacity_weight_kg
        truck_type VARCHAR(50), -- Espeja trucks.truck_type
        plate VARCHAR(20), -- Lista negra: una placa puntual inhabilitada

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_restriction_vehicle_restriction FOREIGN KEY (planning_restriction_id) REFERENCES planning_restrictions(id)
    );

    CREATE TABLE trucks (
        id BIGSERIAL PRIMARY KEY,
        distributor_id BIGINT NULL, -- Distribuidora a la que está asignado el camión
        code VARCHAR(100), -- Código interno de flota
        plate VARCHAR(20) NOT NULL, -- Placa/Matrícula del vehículo
        capacity_weight_kg DECIMAL(12, 2) NOT NULL, -- Capacidad máxima de carga en KG
        capacity_volume_m3 DECIMAL(12, 2) NOT NULL, -- Capacidad máxima de carga en M3
        status VARCHAR(50), -- Estado operativo (DISPONIBLE, MANTENIMIENTO)
        truck_type VARCHAR(50), -- Tipo de carrocería (furgón, estacas, etc.)
        is_refrigerated BOOLEAN DEFAULT FALSE, -- Banderilla si cuenta con termo/cadena de frío
        is_external BOOLEAN DEFAULT FALSE, -- Indica si el camión es de un tercero/tercerizado
        shift_start TIME, -- Inicio de turno de circulación
        shift_end TIME, -- Fin de turno de circulación
        break_start TIME,
        break_end TIME,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_truck_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );

    CREATE TABLE plan_status (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL, -- Nombre del estado (DRAFT, IN_OPTIMIZATION, APPROVED)
        description VARCHAR(100) NOT NULL,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL
    );

    CREATE TABLE dispatch_plans (
        id BIGSERIAL PRIMARY KEY,
        plan_status_id BIGINT NOT NULL,
        distributor_id BIGINT NOT NULL, -- Centro de distribución que ejecuta la planificación
        plan_date DATE NOT NULL, -- Fecha operativa del despacho
        planned_order_count INTEGER DEFAULT 0, -- Cantidad de pedidos consolidados en el plan
        planned_truck_count INTEGER DEFAULT 0, -- Cantidad de camiones utilizados
        employee_id BIGINT NOT NULL, -- Planificador responsable

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_dispatch_plan_status FOREIGN KEY (plan_status_id) REFERENCES plan_status(id),
        CONSTRAINT fk_dispatch_plan_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );

    CREATE TABLE planning_trucks (
        id BIGSERIAL PRIMARY KEY,
        dispatch_plan_id BIGINT NOT NULL,
        truck_id BIGINT NOT NULL,
        assigned_weight_kg DECIMAL(12,2) DEFAULT 0.00, -- Peso total asignado en este plan
        assigned_volume_m3 DECIMAL(12,2) DEFAULT 0.00, -- Volumen total asignado en este plan
        is_included_in_routing BOOLEAN DEFAULT TRUE, -- Bandera para incluir/excluir en optimización
        -- POR QUÉ el camión quedó fuera del ruteo. El booleano de arriba no alcanza: no distingue
        -- "el planificador lo destildó" de "no puede circular hoy por pico y placa". El primero se
        -- revierte con un click; el segundo no, y sin el motivo a la vista el planificador lo va a
        -- intentar prender de nuevo y va a pensar que la pantalla está rota.
        exclusion_reason VARCHAR(50), -- NULL | 'MANUAL' | 'RESTRICTION'
        excluded_by_restriction_id BIGINT NULL, -- Qué restricción lo sacó, si fue 'RESTRICTION'

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_planning_truck_plan FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id),
        CONSTRAINT fk_planning_truck_master FOREIGN KEY (truck_id) REFERENCES trucks(id),
        CONSTRAINT fk_planning_truck_restriction FOREIGN KEY (excluded_by_restriction_id) REFERENCES planning_restrictions(id)
    );

    CREATE TABLE dispatch_delivery_points (
        id BIGSERIAL PRIMARY KEY,
        dispatch_plan_id BIGINT NOT NULL,
        sale_channel_id BIGINT NOT NULL,
        delivery_point_id BIGINT NOT NULL, -- ID del punto de entrega del cliente
        zone_id BIGINT,
        owner_id BIGINT NOT NULL, -- ID de la entidad/dueño comercial
        owner_name VARCHAR(50),
        customer_id BIGINT NOT NULL, -- ID del cliente receptor
        customer_name VARCHAR(50),
        phone_number VARCHAR(20), --NUMERO DE CONTACTO DEL CLIENTE
        address VARCHAR(255), -- Dirección física del punto de entrega
        warehouse_destination_id BIGINT, -- Almacén de despacho
        priority INTEGER,
        delivery_window_start TIME NULL, -- Ventana horaria inicio recepción
        delivery_window_end TIME NULL, -- Ventana horaria fin recepción
        total_weight_kg DECIMAL(12, 2), -- Sumatoria de peso acumulado en la parada
        total_volume_m3 DECIMAL(12, 2), -- Sumatoria de volumen acumulado
        total_neto DECIMAL(12, 2), -- Valor monetario de la parada
        forced_planning_truck_id BIGINT NULL, -- Camión forzado en unificación manual
        observations TEXT, -- observaciones del chofer, en caso de fotografia mal tomada, cambio de direccion, cambio de nuemero de telefono

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_dipatch_delivery_point_plan FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id),
        CONSTRAINT fk_dipatch_delivery_point_forced_truck FOREIGN KEY (forced_planning_truck_id) REFERENCES planning_trucks(id),
        CONSTRAINT fk_dipatch_delivery_point_zone FOREIGN KEY (zone_id) REFERENCES zones(id)
    );

    CREATE TABLE image_delivery_points(
        id BIGSERIAL PRIMARY KEY,
        dispatch_delivery_point_id BIGINT NULL,
        path_url TEXT, -- URL de fotos o fachadas del punto de entrega

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        CONSTRAINT fk_image_delivery_point FOREIGN KEY (dispatch_delivery_point_id) REFERENCES dispatch_delivery_points(id)
    );

    CREATE TABLE candidate_orders (
        id BIGSERIAL PRIMARY KEY,
        dispatch_delivery_point_id BIGINT NULL,
        sales_order_id BIGINT , -- ID del pedido comercial en SAP/Ventas
        document_id BIGINT NOT NULL, -- Documento de necesidad SAP
        distributor_id BIGINT NOT NULL,
        total_weight_kg DECIMAL(12, 2),
        total_volume_m3 DECIMAL(12, 2),
        type_movement VARCHAR(50),
        is_included BOOLEAN DEFAULT TRUE,
        refund_order_id BIGINT NULL, -- Referencia si proviene de devolución
        transfer_id BIGINT NULL, -- Referencia si proviene de traslado de almacén

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_candidate_order_plan_order FOREIGN KEY (dispatch_delivery_point_id) REFERENCES dispatch_delivery_points(id),
        CONSTRAINT fk_candidate_order_plan_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );

    CREATE TABLE routes (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100),
        planning_truck_id BIGINT,
        dispatch_plan_id BIGINT,
        employee_id BIGINT, -- Supervisor que aprueba o ejecuta el ruteo
        driver_employee_id BIGINT NULL, -- ID del chofer asignado a la ruta
        name_driver_employee VARCHAR(100) NULL, -- Nombre completo del chofer
        helper_employee_id BIGINT NULL, -- ID del ayudante asignado
        name_helper_employee VARCHAR(100) NULL, -- Nombre del ayudante
        engine VARCHAR(100), -- Motor de optimización (ej. GOOGLE, OR_TOOLS)
        executed_at TIMESTAMP,
        eta_total_distance_m DECIMAL(12, 2), -- Distancia total estimada en metros
        eta_total_time_s DECIMAL(12, 2), -- Tiempo total estimado en segundos
        score DECIMAL(12, 2),
        total_cost DECIMAL(12, 2), -- Costo estimado recalculado
        is_selected BOOLEAN DEFAULT FALSE, -- Indica si es la ruta activa elegida
        encode_polyline TEXT, -- Geometría de la ruta codificada (Polyline)
        color_hex VARCHAR(6),

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_routes_dispatch_plan FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id),
        CONSTRAINT fk_routes_planning_truck FOREIGN KEY (planning_truck_id) REFERENCES planning_trucks(id)
    );

    CREATE TABLE route_delivery_points (
        id BIGSERIAL PRIMARY KEY,
        route_id BIGINT NOT NULL,
        dispatch_delivery_point_id BIGINT NOT NULL,
        sequence INTEGER NOT NULL, -- Secuencia u orden de visita (1, 2, 3...)
        estimated_distance_m DECIMAL(12, 2), -- Metros hacia este tramo
        estimated_travel_s DECIMAL(12, 2), -- Segundos de tránsito hacia este tramo
        is_active BOOLEAN DEFAULT TRUE, -- Marca si el tramo está activo
        estimated_total_cost DECIMAL(12, 2),

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_route_dp_route FOREIGN KEY (route_id) REFERENCES routes(id),
        CONSTRAINT fk_route_dp_plan_order FOREIGN KEY (dispatch_delivery_point_id) REFERENCES dispatch_delivery_points(id)
    );

    CREATE TABLE transport_orders (
        id BIGSERIAL PRIMARY KEY,
        dispatch_plan_id BIGINT,
        distributor_id BIGINT NOT NULL,
        route_id BIGINT,
        truck_id BIGINT NULL, -- FK directa al camión asignado para tracking y consultas rápidas sin JOINs

        driver_employee_id BIGINT NULL, -- ID del chofer titular del viaje
        name_driver_employee VARCHAR(100) NULL, -- Nombre congelado del chofer asignado
        helper_employee_id BIGINT NULL, -- ID del ayudante de reparto asignado
        name_helper_employee VARCHAR(100) NULL, -- Nombre del ayudante de reparto
        supervisor_employee_id BIGINT NULL, -- ID del supervisor de rampa/despacho
        name_supervisor_employee VARCHAR(100) NULL, -- Nombre del supervisor responsable

        code BIGINT, -- Código numérico de OT (ej. 1000456)
        status VARCHAR(50), -- Estado operativo (CREATED, ENROUTE, CHECKED_OK, DISCREPANCY)
        checked_by VARCHAR(255), -- Usuario/Chofer que valida el conteo físico

        departure_date TIMESTAMP NULL,
        completed_date TIMESTAMP NULL,
        total_km DECIMAL(12,2) DEFAULT 0.00,
        assigned_weight_kg DECIMAL(12,2) DEFAULT 0.00,
        assigned_volume_m3 DECIMAL(12,2) DEFAULT 0.00,

        total_stops_count INTEGER DEFAULT 0, -- Total de paradas planificadas en la OT
        completed_stops_count INTEGER DEFAULT 0, -- Total de paradas entregadas exitosamente
        total_revenue_expected DECIMAL(12, 2) DEFAULT 0.00, -- Monto total proyectado a cobrar en ruta (Bs)
        total_revenue_collected DECIMAL(12, 2) DEFAULT 0.00, -- Monto real recaudado en calle (Bs)

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_transport_orders_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id),
        CONSTRAINT fk_transport_orders_plan FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id),
        CONSTRAINT fk_transport_orders_route FOREIGN KEY (route_id) REFERENCES routes(id),
        CONSTRAINT fk_transport_orders_truck FOREIGN KEY (truck_id) REFERENCES trucks(id)
    );

    CREATE TABLE transport_order_histories (
        id BIGSERIAL PRIMARY KEY,
        transport_order_id BIGINT NOT NULL,
        status VARCHAR(50), -- Estado -ENUM- CREATED, ENROUTE, PENDING, EST. REV.: (CHECKED_START,DIF O REVISION END, VALIDATE SUP, REV SEMAFORO, ORDER OUT)
        description VARCHAR(150), -- Detalle del evento/auditoría /
        capture_hour TIME, -- puede ser null, para tener la referencia de la hora en que inicio/fin conteo

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_transp_ord_hist_transport_order FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id)
    );

    CREATE TABLE transport_order_sales (
        id BIGSERIAL PRIMARY KEY,
        transport_order_id BIGINT NOT NULL,
        sales_order_id BIGINT, -- ID del pedido de venta comercial
        sales_order_split_id BIGINT, -- ID del pedido (split) de venta comercial
        invoice_id BIGINT,
        invoice_amount DECIMAL(12,2) DEFAULT 0.00,
        document_id BIGINT NOT NULL, -- ID del documento SAP de necesidad
        total_weight_kg DECIMAL(12,2) DEFAULT 0.00,
        total_volume_m3 DECIMAL(12,2) DEFAULT 0.00,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_transport_order_sales_to FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id)
    );

    CREATE TABLE transport_order_sales_items (
        id BIGSERIAL PRIMARY KEY,
        transport_order_sales_id BIGINT NOT NULL,
        product_id BIGINT NOT NULL,
        quantity_min DECIMAL(12, 2), -- Cantidad total esperada en unidad mínima
        equivalence_box_unit DECIMAL(12, 2), -- Unidad de equivalencia por caja

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_tos_items_tos FOREIGN KEY (transport_order_sales_id) REFERENCES transport_order_sales(id)
    );


    -- 1. TABLA: INVENTARIO CONSOLIDADO DEL CAMIÓN
    -- Almacena el estado oficial final de la carga para una Orden de Transporte (OT).
    CREATE TABLE truck_inventories (
        id BIGSERIAL PRIMARY KEY,                                    -- ID único del registro de inventario (Ej: 1, 45)
        truck_id BIGINT NOT NULL,                                    -- FK a trucks. ID del camión asignado al viaje (Ej: 12)
        transport_order_id BIGINT NOT NULL,                          -- FK a transport_orders. OT contenedora de la carga (Ej: 10045)
        product_id BIGINT NOT NULL,                                  -- ID del producto/SKU en catálogo (Ej: 501 = Cerveza 1L)

        equivalence_box_unit DECIMAL(12, 2) NOT NULL DEFAULT 1.00,  -- Factor de empaque (unidades por caja)
        expected_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Cantidad oficial esperada en unidades mínimas (Ej: 120.00 uds)
        expected_boxes DECIMAL(12, 2) NOT NULL DEFAULT 0.00,        -- Cantidad esperada en cajas completas (Ej: 10.00 cjas)
        loaded_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,            -- Cantidad física final en unidades mínimas (Ej: 120.00 uds)
        loaded_boxes DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Cantidad física final en cajas completas (Ej: 10.00 cjas)
        variance_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Diferencia acumulada final en unidades: loaded_qty - expected_qty (Ej: 0.00)
        damaged_qty DECIMAL(12, 2) DEFAULT 0.00,                     -- Cantidad de merma física descartada en rampa
        returned_warehouse_qty DECIMAL(12, 2) DEFAULT 0.00,          -- Cantidad devuelta a bodega por sobrepasar capacidad de carga

        temperature_celsius DECIMAL(4, 1) NULL,                      -- Temperatura medida en rampa para productos de cadena de frío (ej: 4.2 °C)
        status VARCHAR(50) DEFAULT 'PENDING',                        -- Estado consolidado ('PENDING', 'MATCH', 'MISMATCH', 'APPROVED')
        verified_supervisor_id BIGINT NULL,                          -- FK a usuarios/empleados. ID del supervisor que aprobó el descuadre (Ej: 98)

        -- Campos de auditoría y trazabilidad
        created_by VARCHAR(255),                                     -- Usuario/Sistema que creó el registro inicial
        updated_by VARCHAR(255),                                     -- Último usuario/sistema que actualizó el registro
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,              -- Fecha y hora de creación en base de datos
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,              -- Fecha y hora de última modificación
        deleted_at TIMESTAMP NULL,                                   -- Fecha de borrado lógico (Soft delete)

        CONSTRAINT fk_inventory_truck FOREIGN KEY (truck_id) REFERENCES trucks(id),
        CONSTRAINT fk_inventory_transport_order FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id)
    );


    -- 2. TABLA: SESIONES DE CONTEO (CABECERA)
    CREATE TABLE transport_order_count_sessions (
        id BIGSERIAL PRIMARY KEY,                                    -- ID único de la sesión de conteo (Ej: 101, 102)
        transport_order_id BIGINT NOT NULL,                          -- FK a transport_orders. OT auditada/contada en esta sesión (Ej: 10045)

        session_type VARCHAR(50) NOT NULL,                           -- Origen del conteo: 'DRIVER_INITIAL', 'SUPERVISOR_DISCREPANCY', 'SUPERVISOR_SEMAPHORE'
        review_scope VARCHAR(20) DEFAULT 'FULL',                     -- Alcance: 'PARTIAL' (solo discrepancias), 'FULL' (todos los ítems), 'NONE'
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',               -- Estado del conteo: 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'

        executor_id BIGINT NOT NULL,                                 -- ID del usuario que ejecuta el conteo físicamente (Ej: 1024)
        executor_role VARCHAR(50) NOT NULL,                          -- Rol del ejecutor para validación de permisos en API: 'DRIVER', 'SUPERVISOR'

        duration_minutes INTEGER NULL,                               -- Duración en minutos del conteo en rampa (para cálculo de Lead Time)
        signature_svg TEXT NULL,                                     -- Firma caligráfica digital vectorial SVG capturada en el móvil
        device_metadata JSONB NULL,                                  -- Metadatos de auditoría móvil (ej: {"model": "Samsung A54", "battery": 85})

        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,              -- Fecha/Hora exacta en que se abrió la pantalla de conteo en la app
        completed_at TIMESTAMP NULL,                                 -- Fecha/Hora exacta en que se guardó y envió el conteo
        notes TEXT,                                                  -- Observaciones generales del evento (Ej: "Caja dañada reportada desde rampa")

        -- Campos de auditoría y trazabilidad
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_count_session_transport_order FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id)
    );


    -- 3. TABLA: DETALLE DE ÍTEMS CONTADOS POR SESIÓN
    CREATE TABLE transport_order_count_session_items (
        id BIGSERIAL PRIMARY KEY,                                    -- ID único del renglón de detalle (Ej: 5001)
        transport_order_count_session_id BIGINT NOT NULL,            -- FK a transport_order_count_sessions. Sesión de conteo a la que pertenece
        product_id BIGINT NOT NULL,                                  -- ID del producto/SKU contado (Ej: 501)

        expected_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Foto congelada del valor oficial al iniciar la sesión (Ej: 100.00)
        counted_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,           -- Cantidad física ingresada por el usuario en esta sesión (Ej: 95.00)
        counted_boxes DECIMAL(12, 2) DEFAULT 0.00,                  -- Cajas completas digitadas por el usuario en pantalla (ej: 7 cajas)
        counted_loose_units DECIMAL(12, 2) DEFAULT 0.00,            -- Unidades sueltas digitadas por el usuario (ej: 9 unidades)
        variance_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Diferencia en este intento: counted_qty - expected_qty (Ej: -5.00)
        equivalence_box_unit DECIMAL(12, 2) NULL,                    -- Factor de conversión del SKU (Ej: 12.00 unidades por caja)

        is_damaged BOOLEAN DEFAULT FALSE,                            -- Flag que marca si el descuadre fue por producto dañado en rampa
        damage_reason_code VARCHAR(50) NULL,                         -- Motivo de la merma: 'BOTELLA_ROTA', 'EMPAQUE_ABIERTO', etc.
        item_status VARCHAR(30) DEFAULT 'PENDING',                   -- Estado del ítem en este intento: 'MATCH', 'MISMATCH', 'SKIPPED'
        observation TEXT,                                            -- Comentario puntual del producto (Ej: "Faltaban 5 botellas rotas")

        -- Campos de auditoría y trazabilidad
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_session_item_session FOREIGN KEY (transport_order_count_session_id) REFERENCES transport_order_count_sessions(id)
    );


    -- 4. ACTIVOS LOGÍSTICOS / BANDEO / ACCESORIOS DE ACTIVO FIJO
    CREATE TABLE logistic_assets (
        id BIGSERIAL PRIMARY KEY,
        distributor_id BIGINT NULL,                                  -- Distribuidora dueña (NULL si es de flota global/corporativa)
        code VARCHAR(50) NOT NULL,                                   -- Ej: 'PALLET-STD', 'CART-300KG', 'CANASTILLA-VERDE'
        name VARCHAR(100) NOT NULL,                                  -- Ej: 'Pallet Madera Estándar (1.20x1.00m)', 'Carrito de Carga 2 Ruedas'
        asset_type VARCHAR(50) NOT NULL,                             -- 'PALLET', 'HAND_TRUCK', 'CRATE', 'THERMO_LOGGER'
        is_serialized BOOLEAN DEFAULT FALSE,                         -- TRUE si se controla por código/placa de activo fijo único
        tare_weight_kg DECIMAL(12, 2) DEFAULT 0.00,                  -- Peso de tara del accesorio en KG
        tare_volume_m3 DECIMAL(12, 2) DEFAULT 0.00,                  -- Volumen ocupado en M3
        is_active BOOLEAN NOT NULL DEFAULT TRUE,

        -- Campos de auditoría y trazabilidad
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_logistic_asset_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );


    -- 5. TABLA: CONTROL DE ACTIVOS POR ORDEN DE TRANSPORTE (SALIDA VS RETORNO)
    CREATE TABLE transport_order_assets (
        id BIGSERIAL PRIMARY KEY,
        transport_order_id BIGINT NOT NULL,                          -- FK a transport_orders. Viaje/Camión asignado
        logistic_asset_id BIGINT NOT NULL,                           -- FK a logistic_assets
        asset_serial_number VARCHAR(100) NULL,                       -- Serial o placa de Activo Fijo escaneado (si aplica)

        planned_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,            -- Cantidad planificada por logística
        dispatched_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,         -- Cantidad con la que SALIÓ físicamente en rampa
        returned_qty DECIMAL(12, 2) NULL,                            -- Cantidad con la que VOLVIÓ tras terminar la ruta
        variance_qty DECIMAL(12, 2) DEFAULT 0.00,                    -- Diferencia: (returned_qty - dispatched_qty)

        status VARCHAR(50) DEFAULT 'PLANNED',                        -- 'PLANNED', 'DISPATCHED_OK', 'RETURNED_OK', 'DISCREPANCY', 'DAMAGED'
        discrepancy_reason VARCHAR(100) NULL,                        -- 'EN_CUSTODIA_CLIENTE', 'ROTURA', 'EXTRAVIO', 'INTERCAMBIO_VACIO'
        customer_custody_id BIGINT NULL,                             -- ID de cliente si quedó en custodia
        receipt_voucher_code VARCHAR(100) NULL,                      -- Número de vale o boleta de custodia

        checked_out_by VARCHAR(255) NULL,                            -- Chofer/Despachador que validó la salida
        checked_out_at TIMESTAMP NULL,                               -- Fecha/Hora de salida
        checked_in_by VARCHAR(255) NULL,                             -- Supervisor/Receptor que liquidó el retorno
        checked_in_at TIMESTAMP NULL,                                -- Fecha/Hora de retorno
        notes TEXT NULL,                                             -- Observaciones

        -- Campos de auditoría y trazabilidad
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_to_assets_transport_order FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id),
        CONSTRAINT fk_to_assets_master FOREIGN KEY (logistic_asset_id) REFERENCES logistic_assets(id)
    );


    CREATE TABLE delivery_orders (
        id BIGSERIAL PRIMARY KEY,
        transport_order_id BIGINT NOT NULL, -- OT contenedora del viaje
        dispatch_delivery_point_id BIGINT NOT NULL, -- Punto de entrega unificado del plan
        executed_sequence INTEGER, -- Orden real de visita ejecutado por el chofer
        delivery_note_number VARCHAR(100), -- Número de Nota de Entrega/Remisión
        delivery_result_code VARCHAR(50), -- Resultado (EXITOSO, RECHAZO_TOTAL, RECHAZO_PARCIAL)
        status VARCHAR(50) NOT NULL, -- Estado (PENDING, ENROUTE, ARRIVED, DELIVERED, REJECTED)
        arrival_latitude DECIMAL(12, 6), -- Coordenada GPS de llegada al cliente
        arrival_longitude DECIMAL(12, 6),
        arrived_at TIMESTAMP, -- Fecha/Hora exacta de llegada
        delivered_at TIMESTAMP NULL, -- Fecha/Hora de finalización y firma
        departure_at TIMESTAMP NULL, -- Fecha/Hora de salida hacia la siguiente parada
        service_time_seconds INTEGER NULL, -- Tiempo de atención efectivo en segundos
        travel_time_seconds INTEGER NULL, -- Tiempo de viaje desde la parada anterior en segundos

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_delivery_transport_order FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id),
        CONSTRAINT fk_delivery_dispatch_dp FOREIGN KEY (dispatch_delivery_point_id) REFERENCES dispatch_delivery_points(id)
    );

    CREATE TABLE delivery_order_sales(
        id BIGSERIAL PRIMARY KEY,
        delivery_order_id BIGINT NOT NULL,
        sale_order_id BIGINT,
        company_code BIGINT,
        invoice_id BIGINT,
        total_invoice DECIMAL(12, 2) NOT NULL,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_delivery_order_sales_delivery_order FOREIGN KEY (delivery_order_id) REFERENCES delivery_orders(id)
    );

    CREATE TABLE delivery_payment_references (
        id BIGSERIAL PRIMARY KEY,
        delivery_order_sale_id BIGINT NOT NULL,
        collection_payment_id BIGINT NOT NULL, -- ID devuelto por Ms Cobranzas

        payment_method VARCHAR(20) NOT NULL,   -- 'CASH', 'QR', 'TRANSFER', 'CHECK'
        reference_number VARCHAR(100),         -- Absorbe el id_qr, nro de recibo, nro de operación o cheque
        bank_name VARCHAR(100) NULL,           -- Banco emisor para cheques y transferencias
        authorization_code VARCHAR(100) NULL,  -- Código de autorización/aprobación de la transacción
        amount DECIMAL(12, 2) NOT NULL,        -- Monto exacto cobrado
        currency VARCHAR(10) DEFAULT 'BOB',
        status VARCHAR(30) DEFAULT 'PENDING',  -- PENDING, COMPLETED, EXPIRED, CANCELLED

        cash_breakdown JSONB NULL,             -- Arqueo de efectivo rápido (ej. {"b100": 5, "b50": 2})
        metadata JSONB,                        -- Datos extra
        notes VARCHAR(100),                    -- Glosa o comentario del pago ingresado por el chofer

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,


        CONSTRAINT fk_delivery_payment_order
            FOREIGN KEY (delivery_order_sale_id)
            REFERENCES delivery_order_sales(id)
            ON DELETE CASCADE
    );

    CREATE TABLE delivery_order_items (
        id BIGSERIAL PRIMARY KEY,
        delivery_order_sale_id BIGINT NOT NULL,
        product_id BIGINT NOT NULL,
        planned_qty DECIMAL(12, 2) NOT NULL, -- Cantidad programada en unidad mínima
        delivered_qty DECIMAL(12, 2) DEFAULT 0.00, -- Cantidad entregada/aceptada
        returned_qty DECIMAL(12, 2) DEFAULT 0.00, -- Cantidad rechazada/devuelta en rampa
        unit_price_snapshot DECIMAL(12, 2) DEFAULT 0.00, -- Precio unitario original para recálculo
        rejection_reason_code VARCHAR(50) NULL, -- Motivo si returned_qty > 0 (ej. DANIADO, VENCIDO)
        item_status VARCHAR(50), -- Estado (PENDING, DELIVERED, PARTIALLY_REJECTED)
        notes TEXT,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_delivery_order_item_sale_order FOREIGN KEY (delivery_order_sale_id) REFERENCES delivery_order_sales(id)
    );

    CREATE TABLE proof_of_deliveries (
        id BIGSERIAL PRIMARY KEY,
        delivery_order_id BIGINT NOT NULL,
        receiver_name VARCHAR(255), -- Nombre de quien recibe físicamente
        receiver_document VARCHAR(100), -- CI/DNI del receptor
        receiver_relationship VARCHAR(100), -- Relación con el cliente (ej. PROPIETARIO, ENCARGADO)
        signature_url TEXT, -- URL de la firma digital
        image_url TEXT, -- URL de la fotografía tomada como evidencia
        latitude DECIMAL(12, 6), -- Coordenadas GPS de captura del POD
        longitude DECIMAL(12, 6),
    --     is_offline_captured BOOLEAN DEFAULT FALSE, -- Registra si se tomó sin conexión a internet
    --     battery_level INTEGER NULL, -- Nivel de batería del celular al capturar
        status VARCHAR(50), -- Estado (CAPTURED, UPLOADED, APPROVED)
        device_id BIGINT, -- ID del dispositivo móvil
        captured_at TIMESTAMP, -- Hora de captura en el celular
        uploaded_at TIMESTAMP NULL, -- Hora de sincronización con el servidor
        notes TEXT,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_pod_delivery_order FOREIGN KEY (delivery_order_id) REFERENCES delivery_orders(id)
    );

    CREATE TABLE delivery_incidents (
        id BIGSERIAL PRIMARY KEY,
        delivery_order_id BIGINT NOT NULL,
        product_id BIGINT NULL, -- FK opcional al producto si el daño fue puntual
        incident_code VARCHAR(50), -- Código (ej. CLIENTE_CERRADO, PRODUCTO_DANIADO)
    --     incident_type VARCHAR(100), -- Categoría (LOGISTICO, PRODUCTO, COMERCIAL)
        severity VARCHAR(50), -- Severidad (BAJA, MEDIA, ALTA, CRITICA)
        description TEXT,
        image_url TEXT,
        requires_return BOOLEAN DEFAULT FALSE, -- Indica si exige retorno físico al almacén
        resolution_status VARCHAR(50), -- Estado de resolución (PENDING, APPROVED)
        resolved_at TIMESTAMP,

        created_by VARCHAR(255), -- Usuario/Chofer que reportó (Estandarizado a VARCHAR)
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_incident_delivery_order FOREIGN KEY (delivery_order_id) REFERENCES delivery_orders(id)
    );

    CREATE TABLE delivery_order_histories (
        id BIGSERIAL PRIMARY KEY,
        delivery_order_id BIGINT NOT NULL,
        status VARCHAR(100) NOT NULL, -- Estado transicionado (ARRIVED, DELIVERED, REJECTED)
        reason TEXT,
        captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp de ocurrencia offline

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_history_delivery_order FOREIGN KEY (delivery_order_id) REFERENCES delivery_orders(id)
    );


    -- =========================================================================
    -- 18. TABLA: CIERRE LOGÍSTICO DE ALMACÉN (LIQUIDACIÓN FÍSICA DE CARGA)
    -- =========================================================================
    -- Registra el cierre físico de inventario al retorno del camión a la rampa de almacén.
    -- Relación 1 a 1 estricta con la Orden de Transporte (transport_orders).
    CREATE TABLE transport_order_warehouse_closings (
        id BIGSERIAL PRIMARY KEY,                                    -- ID único del registro de cierre de almacén (Ej: 1)
        transport_order_id BIGINT NOT NULL UNIQUE,                  -- FK a transport_orders. Relación 1 a 1 con la OT contenedora (Ej: 10045)
        closing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,            -- Fecha y hora en que se cerró la liquidación en almacén (Ej: '2026-02-12 18:30:00')
        status VARCHAR(50) DEFAULT 'CLOSED',                         -- Estado del cierre ('DRAFT', 'CLOSED', 'OBSERVED', 'AUDITED')

        -- Resumen de Cantidades Físicas
        total_dispatch_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,    -- Total de unidades físicas despachadas inicialmente en el camión (Ej: 197.00)
        total_invoiced_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,    -- Total de unidades efectivamente facturadas y entregadas a clientes (Ej: 177.00)
        total_bonus_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,       -- Total de unidades entregadas como bonificación/promoción comercial (Ej: 12.00)
        total_delivered_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,   -- Total entregado a clientes: facturado + bonificado (Ej: 189.00)
        total_returned_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,    -- Total de unidades físicas que retornan al almacén por rechazo (Ej: 8.00)
        total_shortage_qty DECIMAL(12, 2) DEFAULT 0.00,             -- Cantidad faltante sin justificar en rampa de retorno (Ej: 0.00)
        total_surplus_qty DECIMAL(12, 2) DEFAULT 0.00,              -- Cantidad sobrante física reportada en rampa de retorno (Ej: 0.00)

        -- Resumen de Valores Monetarios (Valorización en Bolivianos)
        total_dispatch_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Valor monetario total de la carga despachada (Ej: 1252.70 Bs)
        total_invoiced_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Valor monetario total de los productos facturados (Ej: 1118.70 Bs)
        total_bonus_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,    -- Valor monetario de los productos bonificados (Ej: 92.80 Bs)
        total_returned_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Valor monetario de los productos devueltos no entregados (Ej: 41.20 Bs)

        -- Actores y Firmas de Conformidad
        driver_employee_id BIGINT NULL,                             -- FK al chofer que firma la entrega física del camión
        driver_signature_svg TEXT NULL,                              -- Firma digital en vector SVG del chofer responsable
        warehouse_responsible_id BIGINT NULL,                       -- FK al bodeguero/almacenero que recibe la carga
        warehouse_responsible_name VARCHAR(255) NULL,                -- Nombre del encargado de almacén (Ej: 'EDUARDO.STARTARI09')
        warehouse_signature_svg TEXT NULL,                           -- Firma digital en vector SVG del encargado de almacén
        notes TEXT NULL,                                             -- Observaciones generales de la recepción de carga en rampa

        -- Auditoría y control
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_wh_closing_transport_order FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id)
    );


    -- =========================================================================
    -- 19. TABLA: CIERRE LOGÍSTICO DE COBRANZAS (LIQUIDACIÓN FINANCIERA DE CAJA)
    -- =========================================================================
    -- Registra el arqueo financiero y la conciliación de medios de pago al cierre de ruta.
    -- Relación 1 a 1 estricta con la Orden de Transporte (transport_orders).
    CREATE TABLE transport_order_collection_closings (
        id BIGSERIAL PRIMARY KEY,                                    -- ID único de la liquidación de cobranzas (Ej: 1)
        transport_order_id BIGINT NOT NULL UNIQUE,                  -- FK a transport_orders. Relación 1 a 1 con la OT contenedora (Ej: 10045)
        closing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,            -- Fecha y hora del cierre financiero (Ej: '2026-02-12 19:15:00')
        status VARCHAR(50) DEFAULT 'LIQUIDATED',                     -- Estado ('PENDING_CASHIER', 'LIQUIDATED', 'AUDITED', 'OBSERVED')

        -- Resumen de Ventas y Facturación
        total_invoiced_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Importe total facturado a los clientes de la ruta (Ej: 1118.74 Bs)
        total_bonus_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,    -- Importe total de bonificaciones comerciales (Ej: 92.81 Bs)
        total_delivered_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,-- Importe entregado total: facturado + bonificado (Ej: 1211.55 Bs)
        total_returned_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Importe total de mercadería devuelta no cobrada (Ej: 41.15 Bs)
        total_dispatch_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Valor monetario total inicial despachado (Ej: 1252.70 Bs)

        -- Desglose por Medio de Pago Recaudado en Mano por Chofer
        cash_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,           -- Efectivo recaudado en moneda local BOB (Ej: 400.00 Bs)
        transfer_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,       -- Monto total en transferencias bancarias BCP/Ganadero (Ej: 300.00 Bs)
        qr_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,             -- Monto total recaudado mediante pagos QR BISA/otros (Ej: 252.70 Bs)
        check_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Monto total en cheques recibidos (Ej: 0.00 Bs)
        driver_collected_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Total recaudación en mano del chofer: Efectivo + Transf + QR + Cheque (Ej: 952.70 Bs)

        -- Desglose de Ventas No Cobradas en Mano
        credit_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,         -- Ventas a crédito autorizadas en ruta (Ej: 166.04 Bs)
        collector_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,      -- Ventas entregadas para cobro posterior por cobrador externo (Ej: 0.00 Bs)
        total_to_render DECIMAL(12, 2) NOT NULL DEFAULT 0.00,       -- TOTAL A RENDIR OFICIAL: Cobranza Chofer + Crédito + Cobrador (Ej: 1118.74 Bs)

        -- Estadísticas de Pedidos
        total_orders_dispatched INTEGER DEFAULT 0,                   -- Total de pedidos despachados (Ej: 30)
        total_orders_invoiced INTEGER DEFAULT 0,                     -- Total de pedidos facturados y cobrados/a crédito (Ej: 28)
        total_orders_returned INTEGER DEFAULT 0,                     -- Total de pedidos rechazados/devueltos (Ej: 2)

        -- Arqueo de Billetes y Monedas (Desglose Físico)
        cash_bob_breakdown JSONB NULL,                               -- Detalle de monedas (0.1, 0.2, 0.5, 1, 2, 5) y billetes (10, 20, 50, 100, 200) en Bs
        cash_usd_breakdown JSONB NULL,                               -- Detalle de billetes en dólares ($10, $20, $50, $100)
        deposit_vouchers JSONB NULL,                                 -- Lista de boletas de depósito en ruta [{"bank": "BISA", "voucher": "1234", "amount": 500.0}]

        -- Firmas de los 4 Roles Requeridos en la Liquidación
        driver_signature_svg TEXT NULL,                              -- 1. Firma del Chofer Responsable
        supervisor_signature_svg TEXT NULL,                          -- 2. Firma del Supervisor de Distribución
        cashier_signature_svg TEXT NULL,                             -- 3. Firma del Cajero / Liquidador Central
        admin_signature_svg TEXT NULL,                               -- 4. Firma del Administrador / Jefe de Finanzas

        -- Auditoría y control
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_coll_closing_transport_order FOREIGN KEY (transport_order_id) REFERENCES transport_orders(id)
    );



-- ── CONFIGURACIÓN ────────────────────────────────────────────────────────
CREATE TABLE refund_approval_levels (
    id BIGSERIAL PRIMARY KEY,
    workflow_version_id BIGINT NOT NULL, -- Agrupa las filas que forman una misma versión publicada de la escalera
    level_order SMALLINT NOT NULL, -- Posición en la escalera (1, 2, 3, 4…)
    name VARCHAR(100) NOT NULL, -- Nombre del escritorio (ej. 'Analista de Experiencia al Cliente')
    role_code VARCHAR(50) NOT NULL, -- Rol que resuelve el aprobador contra el servicio externo de roles
    activation_min_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Monto mínimo desde el que este nivel entra a jugar; el techo es el activation_min_amount del siguiente nivel
    approval_policy VARCHAR(20) NOT NULL DEFAULT 'ANY', -- 'ANY', 'ALL', 'QUORUM'
    required_approvals SMALLINT DEFAULT 1, -- Solo tiene sentido con approval_policy = 'QUORUM'
    on_reject VARCHAR(30) NOT NULL DEFAULT 'TERMINATE', -- 'TERMINATE', 'RETURN_PREVIOUS', 'RETURN_INITIATOR'
    sla_hours SMALLINT NULL, -- Horas hasta que el nivel se considera vencido. NULL = sin plazo
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT ck_refund_level_policy CHECK (approval_policy IN ('ANY', 'ALL', 'QUORUM')),
    CONSTRAINT ck_refund_level_on_reject CHECK (on_reject IN ('TERMINATE', 'RETURN_PREVIOUS', 'RETURN_INITIATOR')),
    CONSTRAINT ck_refund_level_required_approvals CHECK (
        (approval_policy = 'QUORUM' AND required_approvals >= 1) OR
        (approval_policy <> 'QUORUM' AND required_approvals = 1)
    ),
    -- El nivel 1 no tiene anterior al que devolver
    CONSTRAINT ck_refund_level_return_previous CHECK (NOT (level_order = 1 AND on_reject = 'RETURN_PREVIOUS')),
    CONSTRAINT ck_refund_level_order CHECK (level_order >= 1),
    CONSTRAINT ck_refund_level_min_amount CHECK (activation_min_amount >= 0),
    CONSTRAINT ck_refund_level_sla CHECK (sla_hours IS NULL OR sla_hours > 0)
);

-- Un solo nivel por posiciòn dentro de cada versiòn publicada
CREATE UNIQUE INDEX uq_refund_approval_levels_version_order ON refund_approval_levels (workflow_version_id, level_order) WHERE deleted_at IS NULL;
-- La escalera vigente se lee por acà
CREATE INDEX ix_refund_approval_levels_active ON refund_approval_levels (is_active, workflow_version_id, level_order) WHERE deleted_at IS NULL;


-- ── NEGOCIO ──────────────────────────────────────────────────────────────
DROP TABLE refund_orders cascade;
CREATE TABLE refund_orders (
    id BIGSERIAL PRIMARY KEY,
    external_sales_id VARCHAR(100) NOT NULL, -- Id de la nota en Ventas. Idempotencia del intake: el mismo id externo nunca crea dos notas
    note_number VARCHAR(50) NOT NULL, -- NÙMERO DE NOTA 1001
    split_sequence SMALLINT NOT NULL DEFAULT 0, -- NOTA ORIGINAL / DISOCIADA

    source_refund_order_id BIGINT NULL, -- NULL en la ORIGINAL / la fuente a la nota de la que salió
    document_type VARCHAR(20) NOT NULL DEFAULT 'ORIGINAL', -- 'ORIGINAL', 'DISSOCIATED
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'APPROVED', 'REJECTED', 'ANNULLED' / Estado de la devoluciòn

    current_workflow_instance_id BIGINT NULL, -- Cual de las instancias està corriendo ahora. | Cambia si es que hay màs de una instancia

    -- item_selection_locked BOOLEAN NOT NULL DEFAULT FALSE, -- ninguna pantalla vuelve a mostrar casillas
    distributor_id BIGINT NOT NULL, -- Distribuidora bajo la que se registró
    employee_id BIGINT NOT NULL, -- Vendedor que registró la nota
    owner_id BIGINT NOT NULL, -- Cliente
    customer_id BIGINT NOT NULL,
    replacement_date DATE NULL, -- Fecha estimada de reposición acordada con el cliente
    justification TEXT, -- Por qué se pide la devolución, en palabras del vendedor
    total DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Suma de refund_order_details.quantity × price_unit para las líneas ACTIVE de esta nota
    approved_total DECIMAL(12, 2) NULL, -- Monto finalmente autorizado. Se escribe al cerrar la instancia; NULL mientras està en curso
    rejected_total DECIMAL(12, 2) NULL, -- Monto que quedò afuera al cerrar (total - approved_total)
    settlement_type VARCHAR(20) NULL, -- 'NOTA_CREDITO', 'CAMBIO_STOCK' — cómo se liquida. Se define al aprobar; NULL mientras no cerrò

    edit_count SMALLINT NOT NULL DEFAULT 0, -- Correcciones que el vendedor ya usò. El tope de negocio es 1

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_refund_order_source FOREIGN KEY (source_refund_order_id) REFERENCES refund_orders(id),
    -- CONSTRAINT fk_refund_order_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id)

    CONSTRAINT ck_refund_order_document_type CHECK (document_type IN ('ORIGINAL', 'DISSOCIATED')),
    CONSTRAINT ck_refund_order_status CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED', 'ANNULLED')),
    CONSTRAINT ck_refund_order_settlement CHECK (settlement_type IS NULL OR settlement_type IN ('NOTA_CREDITO', 'CAMBIO_STOCK')),
    CONSTRAINT ck_refund_order_edit_count CHECK (edit_count >= 0),
    -- La ORIGINAL no apunta a nadie y va con split_sequence = 0; la DISOCIADA siempre apunta a su fuente
    CONSTRAINT ck_refund_order_split_origin CHECK (
        (document_type = 'ORIGINAL'    AND split_sequence = 0 AND source_refund_order_id IS NULL) OR
        (document_type = 'DISSOCIATED' AND split_sequence > 0 AND source_refund_order_id IS NOT NULL)
    )
);

-- El nùmero de nota se repite entre la original y sus disociadas: lo ùnico es el par con el split
CREATE UNIQUE INDEX uq_refund_orders_note_split ON refund_orders (note_number, split_sequence) WHERE deleted_at IS NULL;
-- Idempotencia del intake de Ventas: el mismo id externo no puede volver a crear la ORIGINAL
CREATE UNIQUE INDEX uq_refund_orders_external_split ON refund_orders (external_sales_id, split_sequence) WHERE deleted_at IS NULL;
-- Bandeja: filtra por distribuidora y estado, ordena por fecha
CREATE INDEX ix_refund_orders_inbox ON refund_orders (distributor_id, status, created_at DESC) WHERE deleted_at IS NULL;
-- Bandeja del vendedor
CREATE INDEX ix_refund_orders_employee ON refund_orders (employee_id, created_at DESC) WHERE deleted_at IS NULL;
-- Familia del split: "quiènes salieron de esta nota"
CREATE INDEX ix_refund_orders_source ON refund_orders (source_refund_order_id) WHERE source_refund_order_id IS NOT NULL;

-- Catàlogo cerrado de motivos del reclamo. Cada motivo dice què evidencia exige,
-- y de ahì sale la validaciòn del formulario de Ventas: no se decide en el front.
CREATE TABLE refund_reasons (
    code VARCHAR(100) PRIMARY KEY, -- 'CONTAMINACION_FISICA', 'VENCIDO', 'RECALL'…
    name VARCHAR(150) NOT NULL, -- Etiqueta visible
    lot_requirement VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL', -- 'REQUIRED', 'OPTIONAL', 'HIDDEN' — què hacer con el lote
    due_date_requirement VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL', -- 'REQUIRED', 'OPTIONAL', 'HIDDEN' — què hacer con el vencimiento
    requires_photo BOOLEAN NOT NULL DEFAULT TRUE, -- Hoy todos los motivos exigen foto; queda por motivo para poder relajarlo
    requires_notes BOOLEAN NOT NULL DEFAULT TRUE, -- La observaciòn del vendedor
    sort_order SMALLINT NOT NULL DEFAULT 0, -- Orden en el selector
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT ck_refund_reason_lot CHECK (lot_requirement IN ('REQUIRED', 'OPTIONAL', 'HIDDEN')),
    CONSTRAINT ck_refund_reason_due_date CHECK (due_date_requirement IN ('REQUIRED', 'OPTIONAL', 'HIDDEN'))
);

CREATE TABLE refund_order_details (
    id BIGSERIAL PRIMARY KEY,
    refund_order_id BIGINT NOT NULL, -- Devoluciòn a la que pertenece esta fila/detalle
    source_detail_id BIGINT NULL, -- Hace referencia al item original por trazabilidad
    product_id BIGINT NOT NULL, -- ID del producto

    source_quantity DECIMAL(12, 2) NOT NULL, -- Cantidad original cuando se crea/ nunca cambia.
    quantity DECIMAL(12, 2) NOT NULL, -- Cantidad vigente. Puede que se haya reducido en una nota/EDITING

    price_unit DECIMAL(12, 2) NOT NULL, -- Precio unitario congelado al momento del reclamo
    line_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'DISSOCIATED'

    reason VARCHAR(100) NOT NULL, -- Motivo clasificado del reclamo 'CONTAMINACION_FISICA'. FK a refund_reasons: ya no es texto libre
    notes TEXT, -- Observación libre del vendedor sobre este producto

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_refund_order_detail_order FOREIGN KEY (refund_order_id) REFERENCES refund_orders(id),
    CONSTRAINT fk_refund_order_detail_source FOREIGN KEY (source_detail_id) REFERENCES refund_order_details(id),
    CONSTRAINT fk_refund_order_detail_reason FOREIGN KEY (reason) REFERENCES refund_reasons(code),
    CONSTRAINT ck_refund_order_detail_qty CHECK (quantity >= 0 AND quantity <= source_quantity),
    CONSTRAINT ck_refund_order_detail_line_status CHECK (line_status IN ('ACTIVE', 'DISSOCIATED'))
);

CREATE INDEX ix_refund_order_details_order ON refund_order_details (refund_order_id) WHERE deleted_at IS NULL;
-- Elegibilidad: cuànto ya reclamò el cliente de un producto
CREATE INDEX ix_refund_order_details_product ON refund_order_details (product_id, line_status) WHERE deleted_at IS NULL;


-- Orìgenes de la lìnea: de què factura y de què lote sale lo que se devuelve.
-- La suma de origins.quantity tiene que dar exactamente refund_order_details.quantity;
-- eso se valida en la transacciòn del intake, no con un CHECK de fila.
CREATE TABLE refund_order_detail_sources (
    id BIGSERIAL PRIMARY KEY,
    refund_order_detail_id BIGINT NOT NULL,

    invoice_number VARCHAR(50) NULL, -- Nùmero visible de la factura 'F-004512'
    invoice_sap_doc VARCHAR(50) NULL, -- Documento SAP de la factura. Referencia lògica: SAP no es nuestra base
    invoiced_at DATE NULL, -- Fecha de la factura. Sirve para la ventana de 90 dìas
    lot VARCHAR(50) NULL, -- Lote del producto devuelto
    due_date DATE NULL, -- Vencimiento del lote
    quantity DECIMAL(12, 2) NOT NULL, -- Cuànto de la lìnea sale de este origen

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_refund_source_detail FOREIGN KEY (refund_order_detail_id) REFERENCES refund_order_details(id),
    CONSTRAINT ck_refund_source_qty CHECK (quantity > 0),
    -- Un origen sin factura y sin lote no identifica nada
    CONSTRAINT ck_refund_source_identified CHECK (invoice_number IS NOT NULL OR invoice_sap_doc IS NOT NULL OR lot IS NOT NULL)
);

CREATE INDEX ix_refund_order_detail_sources_detail ON refund_order_detail_sources (refund_order_detail_id) WHERE deleted_at IS NULL;


-- Fotos de evidencia de la lìnea. Es lo primero que abre el revisor: sin esto no hay decisiòn.
-- Guardamos la clave del objeto en el storage y la URL pùblica que hoy sirve el CDN.
CREATE TABLE refund_order_detail_photos (
    id BIGSERIAL PRIMARY KEY,
    refund_order_detail_id BIGINT NOT NULL,

    storage_key VARCHAR(500) NOT NULL, -- Clave en el bucket. Es la fuente: la URL se puede regenerar
    url VARCHAR(1000) NULL, -- URL servida al front. NULL si se firma en cada lectura
    content_type VARCHAR(100) NULL, -- 'image/jpeg', 'image/png'
    size_bytes BIGINT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0, -- Orden en el carrusel del detalle
    taken_at TIMESTAMP NULL, -- Cuàndo se sacò la foto, si el mòvil lo informa
    uploaded_by VARCHAR(255) NULL, -- Quièn la subiò

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_refund_photo_detail FOREIGN KEY (refund_order_detail_id) REFERENCES refund_order_details(id),
    CONSTRAINT ck_refund_photo_size CHECK (size_bytes IS NULL OR size_bytes > 0)
);

CREATE INDEX ix_refund_order_detail_photos_detail ON refund_order_detail_photos (refund_order_detail_id, sort_order) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_refund_order_detail_photos_key ON refund_order_detail_photos (storage_key) WHERE deleted_at IS NULL;


-- ── WORKFLOW ─────────────────────────────────────────────────────────────
CREATE TABLE refund_workflow_instances (
    id BIGSERIAL PRIMARY KEY,
    refund_order_id BIGINT NOT NULL, -- La devoluciòn | cada instancia estarà asociada a una refound_order
    attempt SMALLINT NOT NULL DEFAULT 1, -- Nùmero de intento
    status VARCHAR(20) NOT NULL DEFAULT 'IN_APPROVAL', -- 'EDITING', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'
    current_level_order SMALLINT NULL, -- Nivel de revisiòn: LVL 1, LVL 2, LVL 3, LVL 4
    reactivated_from_instance_id BIGINT NULL, -- Cuando se hace la reversiòn - aqui se guarda la referencia
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Cuando se iniciò
    finished_at TIMESTAMP NULL, -- Cuando se finalizò

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_refund_wf_instance_order FOREIGN KEY (refund_order_id) REFERENCES refund_orders(id),
    CONSTRAINT fk_refund_wf_instance_reactivated FOREIGN KEY (reactivated_from_instance_id) REFERENCES refund_workflow_instances(id),

    CONSTRAINT ck_refund_wf_instance_status CHECK (status IN ('EDITING', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT ck_refund_wf_instance_attempt CHECK (attempt >= 1),
    -- Una instancia cerrada no tiene nivel activo
    CONSTRAINT ck_refund_wf_instance_current_level CHECK (
        (status = 'IN_APPROVAL' AND current_level_order IS NOT NULL) OR
        (status <> 'IN_APPROVAL' AND current_level_order IS NULL)
    )
);

-- Un intento por nùmero y por nota
CREATE UNIQUE INDEX uq_refund_wf_instance_order_attempt ON refund_workflow_instances (refund_order_id, attempt) WHERE deleted_at IS NULL;

CREATE TABLE refund_workflow_instance_levels (
    id BIGSERIAL PRIMARY KEY,
    workflow_instance_id BIGINT NOT NULL, -- Referencia a la instancia
    level_order SMALLINT NOT NULL, -- EL ORDEN DEL NIVEL
    level_name VARCHAR(100) NOT NULL, -- NOMBRE DEL NIVEL
    role_code VARCHAR(50) NOT NULL, -- EL ROL QUE PUEDE APROBAR ESTE NIVEL

    min_amount DECIMAL(12, 2) NOT NULL, -- Monto mìnimo para activarse
    max_amount DECIMAL(12, 2) NULL, -- Techo de la banda = piso del nivel siguiente. NULL en el ùltimo nivel: no tiene techo

    -- La polìtica de firma tambièn se congela acà: republicar la escalera no reescribe la historia
    approval_policy VARCHAR(20) NOT NULL DEFAULT 'ANY', -- 'ANY', 'ALL', 'QUORUM' — copiado de refund_approval_levels
    required_approvals SMALLINT NOT NULL DEFAULT 1, -- Solo tiene sentido con 'QUORUM'
    on_reject VARCHAR(30) NOT NULL DEFAULT 'TERMINATE', -- 'TERMINATE', 'RETURN_PREVIOUS', 'RETURN_INITIATOR'
    sla_hours SMALLINT NULL, -- Plazo del nivel, congelado. NULL = sin plazo

    decision_mode VARCHAR(20) NOT NULL DEFAULT 'DOCUMENT_DECISION', -- 'ITEM_SELECTION' | 'DOCUMENT_DECISION'
        -- Solo en el nivel 1 se selecciona, los demàs ya no

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'SKIPPED'
        -- Esto sirve para mostrar el estado del nivel

    first_viewed_at TIMESTAMP NULL, -- Cuándo se lo abre
        -- Al abrirse no cambia | Indica si ya fue abierto por alguien
    first_viewed_by VARCHAR(255) NULL, -- La persona que lo vio

    started_at TIMESTAMP NULL, -- Fecha que se inicio
    finished_at TIMESTAMP NULL, -- Fecha que finalizò

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_refund_wf_instance_level_instance FOREIGN KEY (workflow_instance_id) REFERENCES refund_workflow_instances(id),

    CONSTRAINT ck_refund_wf_level_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'SKIPPED')),
    CONSTRAINT ck_refund_wf_level_decision_mode CHECK (decision_mode IN ('ITEM_SELECTION', 'DOCUMENT_DECISION')),
    CONSTRAINT ck_refund_wf_level_policy CHECK (approval_policy IN ('ANY', 'ALL', 'QUORUM')),
    CONSTRAINT ck_refund_wf_level_on_reject CHECK (on_reject IN ('TERMINATE', 'RETURN_PREVIOUS', 'RETURN_INITIATOR')),
    CONSTRAINT ck_refund_wf_level_band CHECK (max_amount IS NULL OR max_amount >= min_amount)
);

-- Un nivel por posiciòn dentro del intento
CREATE UNIQUE INDEX uq_refund_wf_level_instance_order ON refund_workflow_instance_levels (workflow_instance_id, level_order) WHERE deleted_at IS NULL;
-- "Quièn tiene que firmar ahora": los niveles abiertos por rol
CREATE INDEX ix_refund_wf_level_open ON refund_workflow_instance_levels (status, role_code) WHERE deleted_at IS NULL;




CREATE TABLE refund_workflow_actions (
    id BIGSERIAL PRIMARY KEY,
    workflow_instance_id BIGINT NOT NULL, -- Referencia a la instancia
    workflow_instance_level_id BIGINT NULL, -- NULL en acciones que no pertenecen a un nivel puntual (ej. CREATED, DISSOCIATED_CREATED)

    related_refund_order_id BIGINT NULL, -- Se guarda el FK de la disociada.

    action VARCHAR(30) NOT NULL,
        -- 'CREATED', 'VIEWED', 'LEVEL1_ITEM_SELECTION', 'DISSOCIATED_CREATED', 'CLOSED'
        -- 'APPROVE', 'SELLER_RESUBMITTED', 'REJECT', 'AUTO_ROUTED', 'REACTIVATE', 'CANCEL'
        -- 'COMMENT' — comentar sin decidir: no consume la firma del nivel ni mueve estados
        -- 'RETURNED_PREVIOUS' — el rechazo con on_reject = 'RETURN_PREVIOUS' devolviò la nota al nivel anterior

    actor_employee_code BIGINT NULL, -- Quièn hizo la acciòn
    actor_role_code VARCHAR(50) NULL, -- Que rol hizo la acciòn

    system_summary TEXT,
    -- Frase autogenerada ( 'Se aprobaron 5 de 7 ítems por Bs 5.260,63.') — va junto al comentario del revisor
    comment TEXT,
    -- Comentario Agregado por el revisor

    reason TEXT, -- Motivo del rechazo, de la reactivación o de la corrección — obligatorio según la acción

    previous_status VARCHAR(20) NULL, -- IN_APPROVAL | REJECTED | EDITING
    new_status VARCHAR(20) NULL,
    amount_before DECIMAL(12, 2) NULL, -- Solo las acciones que mueven el monto de la nota llevan estos dos
    amount_after DECIMAL(12, 2) NULL,
    -- at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_refund_wf_action_instance FOREIGN KEY (workflow_instance_id) REFERENCES refund_workflow_instances(id),
    CONSTRAINT fk_refund_wf_action_level FOREIGN KEY (workflow_instance_level_id) REFERENCES refund_workflow_instance_levels(id),
    CONSTRAINT fk_refund_wf_action_related_order FOREIGN KEY (related_refund_order_id) REFERENCES refund_orders(id),

    CONSTRAINT ck_refund_wf_action_action CHECK (action IN (
        'CREATED', 'VIEWED', 'LEVEL1_ITEM_SELECTION', 'DISSOCIATED_CREATED', 'CLOSED',
        'APPROVE', 'SELLER_RESUBMITTED', 'REJECT', 'AUTO_ROUTED', 'REACTIVATE', 'CANCEL',
        'COMMENT', 'RETURNED_PREVIOUS'
    )),
    -- El motivo es obligatorio en las acciones que lo exigen; en el resto es opcional
    CONSTRAINT ck_refund_wf_action_reason CHECK (
        action NOT IN ('REJECT', 'REACTIVATE', 'CANCEL') OR (reason IS NOT NULL AND length(trim(reason)) > 0)
    ),
    -- La fila puente del split es la ùnica que apunta a otra nota
    CONSTRAINT ck_refund_wf_action_related CHECK (
        related_refund_order_id IS NULL OR action = 'DISSOCIATED_CREATED'
    )
);

-- Historial de la nota y conteo de firmas del nivel
CREATE INDEX ix_refund_wf_action_instance ON refund_workflow_actions (workflow_instance_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_refund_wf_action_level ON refund_workflow_actions (workflow_instance_level_id, action) WHERE deleted_at IS NULL;
-- "¿de dònde saliò esta disociada?"
CREATE INDEX ix_refund_wf_action_related ON refund_workflow_actions (related_refund_order_id) WHERE related_refund_order_id IS NOT NULL;
-- Una persona firma una sola vez cada nivel
CREATE UNIQUE INDEX uq_refund_wf_action_one_signature ON refund_workflow_actions (workflow_instance_level_id, actor_employee_code)
    WHERE action = 'APPROVE' AND deleted_at IS NULL;


-- La selección binaria de Nivel 1, y solo eso
CREATE TABLE refund_order_detail_decisions (
    id BIGSERIAL PRIMARY KEY,
    workflow_action_id BIGINT NOT NULL, -- La acción LEVEL1_ITEM_SELECTION que registró esta decisión
    refund_order_detail_id BIGINT NOT NULL,
    decision VARCHAR(20) NOT NULL, -- 'SELECTED', 'DISSOCIATED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_refund_detail_decision_action FOREIGN KEY (workflow_action_id) REFERENCES refund_workflow_actions(id),
    CONSTRAINT fk_refund_detail_decision_detail FOREIGN KEY (refund_order_detail_id) REFERENCES refund_order_details(id),

    CONSTRAINT ck_refund_detail_decision CHECK (decision IN ('SELECTED', 'DISSOCIATED'))
);

-- Una decisiòn por lìnea en cada selecciòn
CREATE UNIQUE INDEX uq_refund_detail_decision ON refund_order_detail_decisions (workflow_action_id, refund_order_detail_id);



-- ── SEMILLA: catàlogo de motivos ─────────────────────────────────────────
-- Las tres reglas de evidencia salen de acà, no del front:
--   HIDDEN   -> el dato no existe para ese motivo y no se pide
--   OPTIONAL -> se puede cargar
--   REQUIRED -> sin el dato no se registra la lìnea
INSERT INTO refund_reasons (code, name, lot_requirement, due_date_requirement, requires_photo, requires_notes, sort_order) VALUES
    ('VENCIDO',               'Producto vencido',              'REQUIRED', 'REQUIRED', TRUE, TRUE, 10),
    ('PROXIMO_VENCIMIENTO',   'Pròximo a vencer',              'REQUIRED', 'REQUIRED', TRUE, TRUE, 20),
    ('CONTAMINACION_FISICA',  'Contaminaciòn fìsica',          'REQUIRED', 'REQUIRED', TRUE, TRUE, 30),
    ('RECALL',                'Retiro de mercado (recall)',    'REQUIRED', 'REQUIRED', TRUE, TRUE, 40),
    ('MUESTRAS_LABORATORIO',  'Muestras para laboratorio',     'REQUIRED', 'REQUIRED', TRUE, TRUE, 50),
    ('DANOS_MANEJO_CLIENTE',  'Daños por manejo del cliente',  'OPTIONAL', 'OPTIONAL', TRUE, TRUE, 60),
    ('ERROR_PEDIDO',          'Error en el pedido',            'OPTIONAL', 'OPTIONAL', TRUE, TRUE, 70),
    ('ERROR_ENTREGA',         'Error en la entrega',           'OPTIONAL', 'OPTIONAL', TRUE, TRUE, 80),
    ('BAJO_RENDIMIENTO',      'Bajo rendimiento de venta',     'OPTIONAL', 'OPTIONAL', TRUE, TRUE, 90),
    ('CIERRE_NEGOCIO',        'Cierre del negocio',            'OPTIONAL', 'OPTIONAL', TRUE, TRUE, 100),
    ('VIGENTE_BUEN_ESTADO',   'Vigente y en buen estado',      'OPTIONAL', 'OPTIONAL', TRUE, TRUE, 110),
    ('EXCEPCIONAL',           'Caso excepcional',              'OPTIONAL', 'OPTIONAL', TRUE, TRUE, 120),
    ('SIN_LOTE_NI_VENCIMIENTO','Sin lote ni vencimiento',      'HIDDEN',   'HIDDEN',   TRUE, TRUE, 130),
    ('FALTANTE_CAJA_CERRADA', 'Faltante en caja cerrada',      'HIDDEN',   'HIDDEN',   TRUE, TRUE, 140);


-- ── SEMILLA: la escalera publicada ───────────────────────────────────────
-- Un piso por nivel; el techo de cada uno es el piso del siguiente y el ùltimo no tiene techo.
INSERT INTO refund_approval_levels (workflow_version_id, level_order, name, role_code,
                                    activation_min_amount, approval_policy, required_approvals, on_reject, sla_hours, is_active) VALUES
    (1, 1, 'Analista CX',       'analista_cx',       0.00,    'ANY',    1, 'RETURN_INITIATOR', 24,   TRUE),
    (1, 2, 'Gerente CX',        'gerente_cx',        500.00,  'ANY',    1, 'TERMINATE',        NULL, TRUE),
    (1, 3, 'Gerente Comercial', 'gerente_comercial', 2000.00, 'QUORUM', 2, 'TERMINATE',        48,   TRUE),
    (1, 4, 'Gerente General',   'gerente_general',   5000.00, 'ALL',    1, 'TERMINATE',        72,   TRUE);


-- ═════════════════════════════════════════════════════════════════════════
-- CASO 1 — Sin disociaciòn: el nivel 1 selecciona todo y la nota sube al nivel 2
-- Nota 2001, total 800 Bs (5 x 60 = 300 y 2 x 250 = 500).
-- ═════════════════════════════════════════════════════════════════════════

-- 1) Nace la nota
INSERT INTO refund_orders (id, external_sales_id, note_number, split_sequence, document_type, status,
                           distributor_id, employee_id, owner_id, customer_id, justification, total)
VALUES (2001, 'SALE-2001', 'DEV-2001', 0, 'ORIGINAL', 'OPEN', 10, 555, 777, 661,
        'Producto entregado con empaque dañado en la ùltima visita.', 800.00);

INSERT INTO refund_order_details (id, refund_order_id, product_id, source_quantity, quantity, price_unit, line_status, reason, notes)
VALUES (3001, 2001, 900, 5, 5, 60.00,  'ACTIVE', 'CONTAMINACION_FISICA', 'Tres cajas con el film roto.'),
       (3002, 2001, 901, 2, 2, 250.00, 'ACTIVE', 'VENCIDO',              'Vencido en gòndola.');

-- De què factura y de què lote sale cada lìnea: la suma da exactamente la cantidad de la lìnea
INSERT INTO refund_order_detail_sources (refund_order_detail_id, invoice_number, invoice_sap_doc, invoiced_at, lot, due_date, quantity)
VALUES (3001, 'F-004512', '4500231', '2026-07-14', 'L-2291', '2026-11-30', 3),
       (3001, 'F-004890', '4500377', '2026-08-02', 'L-2318', '2026-12-15', 2),
       (3002, 'F-004890', '4500377', '2026-08-02', 'L-2201', '2026-08-20', 2);

-- La evidencia. Sin foto el revisor no decide, y todos los motivos la exigen
INSERT INTO refund_order_detail_photos (refund_order_detail_id, storage_key, url, content_type, sort_order, uploaded_by)
VALUES (3001, 'refunds/2001/3001/a1.jpg', 'https://cdn.wetrade.bo/refunds/2001/3001/a1.jpg', 'image/jpeg', 1, '555'),
       (3001, 'refunds/2001/3001/a2.jpg', 'https://cdn.wetrade.bo/refunds/2001/3001/a2.jpg', 'image/jpeg', 2, '555'),
       (3002, 'refunds/2001/3002/b1.jpg', 'https://cdn.wetrade.bo/refunds/2001/3002/b1.jpg', 'image/jpeg', 1, '555');

-- 2) Arranca el workflow: instancia + snapshot de los niveles.
--    Con 800 Bs entran el 1 (piso 0) y el 2 (piso 500); el 3 y el 4 nacen SKIPPED.
INSERT INTO refund_workflow_instances (id, refund_order_id, attempt, status, current_level_order)
VALUES (90, 2001, 1, 'IN_APPROVAL', 1);

UPDATE refund_orders SET current_workflow_instance_id = 90 WHERE id = 2001;

INSERT INTO refund_workflow_instance_levels (id, workflow_instance_id, level_order, level_name, role_code,
                                             min_amount, max_amount, approval_policy, required_approvals, on_reject, sla_hours,
                                             decision_mode, status, started_at)
VALUES (200, 90, 1, 'Analista CX',       'analista_cx',       0.00,    500.00,  'ANY',    1, 'RETURN_INITIATOR', 24,   'ITEM_SELECTION',    'IN_PROGRESS', now()),
       (201, 90, 2, 'Gerente CX',        'gerente_cx',        500.00,  2000.00, 'ANY',    1, 'TERMINATE',        NULL, 'DOCUMENT_DECISION', 'PENDING',     NULL),
       (202, 90, 3, 'Gerente Comercial', 'gerente_comercial', 2000.00, 5000.00, 'QUORUM', 2, 'TERMINATE',        48,   'DOCUMENT_DECISION', 'SKIPPED',     NULL),
       (203, 90, 4, 'Gerente General',   'gerente_general',   5000.00, NULL,    'ALL',    1, 'TERMINATE',        72,   'DOCUMENT_DECISION', 'SKIPPED',     NULL);

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, system_summary, new_status, amount_after)
VALUES (500, 90, NULL, 'CREATED', 555, 'vendedor', 'Nota registrada por Bs 800,00.', 'IN_APPROVAL', 800.00);

-- 3) El nivel 1 abre el documento: se sella la primera vista, una sola vez
UPDATE refund_workflow_instance_levels SET first_viewed_at = now(), first_viewed_by = '57' WHERE id = 200;

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action, actor_employee_code, actor_role_code)
VALUES (501, 90, 200, 'VIEWED', 57, 'analista_cx');

-- 4) El nivel 1 selecciona TODO: no hay split
INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, system_summary)
VALUES (502, 90, 200, 'LEVEL1_ITEM_SELECTION', 57, 'analista_cx', 'Se seleccionaron 2 de 2 ìtems.');

INSERT INTO refund_order_detail_decisions (workflow_action_id, refund_order_detail_id, decision)
VALUES (502, 3001, 'SELECTED'),
       (502, 3002, 'SELECTED');

-- 5) El nivel 1 aprueba. 800 > 500 (su techo), asì que la nota sube al nivel 2:
--    la instancia sigue IN_APPROVAL y solo cambia el nivel activo
UPDATE refund_workflow_instance_levels SET status = 'APPROVED',    finished_at = now() WHERE id = 200;
UPDATE refund_workflow_instance_levels SET status = 'IN_PROGRESS', started_at  = now() WHERE id = 201;
UPDATE refund_workflow_instances       SET current_level_order = 2                     WHERE id = 90;

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, comment, previous_status, new_status)
VALUES (503, 90, 200, 'APPROVE',     57, 'analista_cx', 'Evidencia correcta.', 'IN_APPROVAL', 'IN_APPROVAL'),
       (504, 90, 201, 'AUTO_ROUTED', NULL, NULL,        NULL,                  'IN_APPROVAL', 'IN_APPROVAL');

-- 6) El nivel 2 aprueba. 800 <= 2000 (su techo): se liquida acà, se cierra la instancia
--    y la nota queda aprobada
UPDATE refund_workflow_instance_levels SET status = 'APPROVED', finished_at = now() WHERE id = 201;
UPDATE refund_workflow_instances
   SET status = 'APPROVED', current_level_order = NULL, finished_at = now()
 WHERE id = 90;
UPDATE refund_orders
   SET status = 'APPROVED', approved_total = 800.00, rejected_total = 0.00, settlement_type = 'NOTA_CREDITO'
 WHERE id = 2001;

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, system_summary, previous_status, new_status)
VALUES (505, 90, 201, 'APPROVE', 72, 'gerente_cx', 'Se aprobaron 2 de 2 ìtems por Bs 800,00.', 'IN_APPROVAL', 'APPROVED'),
       (506, 90, NULL, 'CLOSED',  NULL, NULL,      'Nota cerrada por nota de crèdito.',        'APPROVED',    'APPROVED');

-- El historial de la 2001, en orden. El 'at' del DDL està comentado: el orden sale de created_at
SELECT a.created_at, a.action, a.actor_employee_code, l.level_name, a.previous_status, a.new_status,
       a.system_summary, a.comment, a.reason
  FROM refund_workflow_actions a
  JOIN refund_workflow_instances i ON i.id = a.workflow_instance_id
  LEFT JOIN refund_workflow_instance_levels l ON l.id = a.workflow_instance_level_id
 WHERE i.refund_order_id = 2001
 ORDER BY a.created_at, a.id;


-- ═════════════════════════════════════════════════════════════════════════
-- CASO 2 — Con disociaciòn: el nivel 1 selecciona parcial
-- Nota 1001, total 1000 Bs (detalle 4001 = 600, detalle 4002 = 400). El nivel 1 excluye el 4002.
-- ═════════════════════════════════════════════════════════════════════════

-- 1) Nace la nota original
INSERT INTO refund_orders (id, external_sales_id, note_number, split_sequence, document_type, status,
                           distributor_id, employee_id, owner_id, customer_id, justification, total)
VALUES (1001, 'SALE-1001', 'DEV-1001', 0, 'ORIGINAL', 'OPEN', 10, 555, 777, 661,
        'Reclamo del cliente por dos productos.', 1000.00);

INSERT INTO refund_order_details (id, refund_order_id, product_id, source_quantity, quantity, price_unit, line_status, reason)
VALUES (4001, 1001, 900, 10, 10, 60.00,  'ACTIVE', 'CONTAMINACION_FISICA'),
       (4002, 1001, 901, 4,  4,  100.00, 'ACTIVE', 'VENCIDO');

INSERT INTO refund_order_detail_sources (refund_order_detail_id, invoice_number, invoice_sap_doc, invoiced_at, lot, due_date, quantity)
VALUES (4001, 'F-004512', '4500231', '2026-07-14', 'L-2291', '2026-11-30', 10),
       (4002, 'F-004512', '4500231', '2026-07-14', 'L-2201', '2026-08-20', 4);

INSERT INTO refund_order_detail_photos (refund_order_detail_id, storage_key, url, content_type, sort_order, uploaded_by)
VALUES (4001, 'refunds/1001/4001/a1.jpg', 'https://cdn.wetrade.bo/refunds/1001/4001/a1.jpg', 'image/jpeg', 1, '555'),
       (4002, 'refunds/1001/4002/b1.jpg', 'https://cdn.wetrade.bo/refunds/1001/4002/b1.jpg', 'image/jpeg', 1, '555');

INSERT INTO refund_workflow_instances (id, refund_order_id, attempt, status, current_level_order)
VALUES (55, 1001, 1, 'IN_APPROVAL', 1);

UPDATE refund_orders SET current_workflow_instance_id = 55 WHERE id = 1001;

INSERT INTO refund_workflow_instance_levels (id, workflow_instance_id, level_order, level_name, role_code,
                                             min_amount, max_amount, approval_policy, required_approvals, on_reject, sla_hours,
                                             decision_mode, status, started_at)
VALUES (210, 55, 1, 'Analista CX', 'analista_cx', 0.00,   500.00,  'ANY', 1, 'RETURN_INITIATOR', 24,   'ITEM_SELECTION',    'IN_PROGRESS', now()),
       (211, 55, 2, 'Gerente CX',  'gerente_cx',  500.00, 2000.00, 'ANY', 1, 'TERMINATE',        NULL, 'DOCUMENT_DECISION', 'PENDING',     NULL);

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, system_summary, new_status, amount_after)
VALUES (600, 55, NULL, 'CREATED', 555, 'vendedor', 'Nota registrada por Bs 1.000,00.', 'IN_APPROVAL', 1000.00);

-- 2) El nivel 1 selecciona PARCIAL: el 4001 queda, el 4002 se disocia
INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, system_summary)
VALUES (601, 55, 210, 'LEVEL1_ITEM_SELECTION', 57, 'analista_cx', 'Se seleccionò 1 de 2 ìtems.');

INSERT INTO refund_order_detail_decisions (workflow_action_id, refund_order_detail_id, decision)
VALUES (601, 4001, 'SELECTED'),
       (601, 4002, 'DISSOCIATED');

-- 3) La transacciòn del split: la original se recalcula y nace la disociada
UPDATE refund_order_details SET line_status = 'DISSOCIATED' WHERE id = 4002;
UPDATE refund_orders        SET total = 600.00              WHERE id = 1001; -- solo queda el 4001

INSERT INTO refund_orders (id, external_sales_id, note_number, split_sequence, source_refund_order_id,
                           document_type, status, distributor_id, employee_id, owner_id, customer_id, total)
VALUES (1004, 'SALE-1001', 'DEV-1001', 1, 1001, 'DISSOCIATED', 'OPEN', 10, 555, 777, 661, 400.00);

-- La lìnea se clona apuntando a la de origen; la cantidad recibida queda como techo del vendedor
INSERT INTO refund_order_details (id, refund_order_id, source_detail_id, product_id, source_quantity, quantity, price_unit, line_status, reason)
VALUES (4010, 1004, 4002, 901, 4, 4, 100.00, 'ACTIVE', 'VENCIDO');

INSERT INTO refund_order_detail_sources (refund_order_detail_id, invoice_number, invoice_sap_doc, invoiced_at, lot, due_date, quantity)
VALUES (4010, 'F-004512', '4500231', '2026-07-14', 'L-2201', '2026-08-20', 4);

INSERT INTO refund_order_detail_photos (refund_order_detail_id, storage_key, url, content_type, sort_order, uploaded_by)
VALUES (4010, 'refunds/1004/4010/b1.jpg', 'https://cdn.wetrade.bo/refunds/1004/4010/b1.jpg', 'image/jpeg', 1, '555');

-- La disociada NO entra en aprobaciòn: arranca en EDITING, esperando al vendedor
INSERT INTO refund_workflow_instances (id, refund_order_id, attempt, status, current_level_order)
VALUES (56, 1004, 1, 'EDITING', NULL);

UPDATE refund_orders SET current_workflow_instance_id = 56 WHERE id = 1004;

-- Fila puente: vive en la instancia de la ORIGINAL y apunta a la disociada
INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, related_refund_order_id,
                                     system_summary, amount_before, amount_after)
VALUES (602, 55, NULL, 'DISSOCIATED_CREATED', 57, 'analista_cx', 1004,
        'Se disociò 1 ìtem por Bs 400,00.', 1000.00, 600.00);

-- 4) La original sigue con lo que le quedò. 600 > 500 (techo del nivel 1), asì que sube al nivel 2,
--    y ahì 600 <= 2000: se liquida y cierra
UPDATE refund_workflow_instance_levels SET status = 'APPROVED',    finished_at = now() WHERE id = 210;
UPDATE refund_workflow_instance_levels SET status = 'IN_PROGRESS', started_at  = now() WHERE id = 211;
UPDATE refund_workflow_instances       SET current_level_order = 2                     WHERE id = 55;

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, previous_status, new_status)
VALUES (603, 55, 210, 'APPROVE', 57, 'analista_cx', 'IN_APPROVAL', 'IN_APPROVAL');

UPDATE refund_workflow_instance_levels SET status = 'APPROVED', finished_at = now() WHERE id = 211;
UPDATE refund_workflow_instances
   SET status = 'APPROVED', current_level_order = NULL, finished_at = now()
 WHERE id = 55;
UPDATE refund_orders
   SET status = 'APPROVED', approved_total = 600.00, rejected_total = 0.00, settlement_type = 'NOTA_CREDITO'
 WHERE id = 1001;

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, system_summary, previous_status, new_status)
VALUES (604, 55, 211, 'APPROVE', 72, 'gerente_cx', 'Se aprobò 1 de 1 ìtem por Bs 600,00.', 'IN_APPROVAL', 'APPROVED');

-- 5) Mientras tanto el vendedor corrige la disociada (recorta de 4 a 2) y la reenvìa.
--    La escalera se recalcula con el total nuevo: 200 Bs entra solo en el nivel 1.
UPDATE refund_order_details SET quantity = 2      WHERE id = 4010;
UPDATE refund_order_detail_sources SET quantity = 2 WHERE refund_order_detail_id = 4010;
UPDATE refund_orders SET total = 200.00, edit_count = edit_count + 1 WHERE id = 1004;

INSERT INTO refund_workflow_instance_levels (id, workflow_instance_id, level_order, level_name, role_code,
                                             min_amount, max_amount, approval_policy, required_approvals, on_reject, sla_hours,
                                             decision_mode, status, started_at)
VALUES (220, 56, 1, 'Analista CX', 'analista_cx', 0.00, 500.00, 'ANY', 1, 'RETURN_INITIATOR', 24, 'DOCUMENT_DECISION', 'IN_PROGRESS', now());
-- Ojo: el reenvìo va con DOCUMENT_DECISION. La selecciòn de ìtems ocurriò una sola vez, en la original

UPDATE refund_workflow_instances SET status = 'IN_APPROVAL', current_level_order = 1 WHERE id = 56;

INSERT INTO refund_workflow_actions (id, workflow_instance_id, workflow_instance_level_id, action,
                                     actor_employee_code, actor_role_code, system_summary,
                                     previous_status, new_status, amount_before, amount_after)
VALUES (605, 56, NULL, 'SELLER_RESUBMITTED', 555, 'vendedor', 'El vendedor recortò la nota a Bs 200,00.',
        'EDITING', 'IN_APPROVAL', 400.00, 200.00);


-- ── CONSULTAS DE LECTURA ─────────────────────────────────────────────────

-- Historial completo de la original, incluido el momento en que saliò la disociada
SELECT a.created_at, a.action, a.related_refund_order_id, a.amount_before, a.amount_after
  FROM refund_workflow_actions a
  JOIN refund_workflow_instances i ON i.id = a.workflow_instance_id
 WHERE i.refund_order_id = 1001
 ORDER BY a.created_at, a.id;

-- Historial de la disociada, desde su propia instancia: arranca en EDITING
SELECT a.created_at, a.action, a.previous_status, a.new_status
  FROM refund_workflow_actions a
  JOIN refund_workflow_instances i ON i.id = a.workflow_instance_id
 WHERE i.refund_order_id = 1004
 ORDER BY a.created_at, a.id;

-- "¿De dònde saliò la 1004?" — la fila puente, buscada desde el otro lado
SELECT i.refund_order_id AS nota_origen, a.created_at, a.amount_before, a.amount_after
  FROM refund_workflow_actions a
  JOIN refund_workflow_instances i ON i.id = a.workflow_instance_id
 WHERE a.related_refund_order_id = 1004
   AND a.action = 'DISSOCIATED_CREATED';

-- La lìnea con su evidencia y sus orìgenes, que es lo que abre el revisor
SELECT d.id AS detalle, d.product_id, d.quantity, d.price_unit, d.line_status, d.reason,
       r.name AS motivo, r.lot_requirement, r.due_date_requirement,
       (SELECT count(*) FROM refund_order_detail_photos p  WHERE p.refund_order_detail_id = d.id AND p.deleted_at IS NULL) AS fotos,
       (SELECT sum(s.quantity) FROM refund_order_detail_sources s WHERE s.refund_order_detail_id = d.id AND s.deleted_at IS NULL) AS cantidad_en_origenes
  FROM refund_order_details d
  JOIN refund_reasons r ON r.code = d.reason
 WHERE d.refund_order_id = 1001
   AND d.deleted_at IS NULL
 ORDER BY d.id;

-- Cuànto ya reclamò el cliente de cada producto: es la base de la elegibilidad
SELECT d.product_id, sum(d.quantity) AS reclamado_vigente
  FROM refund_order_details d
  JOIN refund_orders o ON o.id = d.refund_order_id
 WHERE o.owner_id = 777
   AND o.status NOT IN ('REJECTED', 'ANNULLED')
   AND d.line_status = 'ACTIVE'
   AND d.deleted_at IS NULL
   AND o.deleted_at IS NULL
 GROUP BY d.product_id;
