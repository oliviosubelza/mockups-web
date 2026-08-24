    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;

    CREATE TABLE distributors (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(50) NOT NULL, -- Nombre comercial de la distribuidora/agencia
        latitude NUMERIC(9,6) NOT NULL, -- Coordenada GPS de la planta/centro
        longitude NUMERIC(9,6) NOT NULL,
    --     department_id BIGINT NOT NULL, -- Departamento/Estado geográfico
        city_id BIGINT NOT NULL,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
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

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_planning_truck_plan FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id),
        CONSTRAINT fk_planning_truck_master FOREIGN KEY (truck_id) REFERENCES trucks(id)
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

        code BIGINT, -- Código numérico de OT (ej. 1000456)
        status VARCHAR(50), -- Estado operativo (CREATED, ENROUTE, CHECKED_OK, DISCREPANCY)
        checked_by VARCHAR(255), -- Usuario/Chofer que valida el conteo físico

        departure_date TIMESTAMP NULL,
        completed_date TIMESTAMP NULL,
        total_km DECIMAL(12,2) DEFAULT 0.00,
        assigned_weight_kg DECIMAL(12,2) DEFAULT 0.00,
        assigned_volume_m3 DECIMAL(12,2) DEFAULT 0.00,

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        CONSTRAINT fk_transport_orders_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id),
        CONSTRAINT fk_transport_orders_plan FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id),
        CONSTRAINT fk_transport_orders_route FOREIGN KEY (route_id) REFERENCES routes(id)
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

        expected_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Cantidad oficial esperada según los pedidos de la OT (Ej: 100.00)
        loaded_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,            -- Cantidad física final validada en el camión (Ej: 95.00)
        variance_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Diferencia acumulada final: loaded_qty - expected_qty (Ej: -5.00)

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
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',               -- Estado del conteo: 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'

        executor_id BIGINT NOT NULL,                                 -- ID del usuario que ejecuta el conteo físicamente (Ej: 1024)
        executor_role VARCHAR(50) NOT NULL,                          -- Rol del ejecutor para validación de permisos en API: 'DRIVER', 'SUPERVISOR'

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
        variance_qty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,          -- Diferencia en este intento: counted_qty - expected_qty (Ej: -5.00)
        equivalence_box_unit DECIMAL(12, 2) NULL,                    -- Factor de conversión del SKU (Ej: 12.00 unidades por caja)

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
    --     verification_pin VARCHAR(10) NULL, -- Código OTP opcional de validación
        arrived_at TIMESTAMP, -- Fecha/Hora exacta de llegada
        delivered_at TIMESTAMP NULL, -- Fecha/Hora de finalización y firma

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
        amount DECIMAL(12, 2) NOT NULL,        -- Monto exacto cobrado
        currency VARCHAR(10) DEFAULT 'BOB',
        status VARCHAR(30) DEFAULT 'PENDING',  -- PENDING, COMPLETED, EXPIRED, CANCELLED

    --     proof_image_url TEXT,                  -- URL de AWS S3 (Evidencia de cheque o comprobante)
        metadata JSONB,                        -- Datos extra (ej. {"bank_name": "BNB", "account": "1234"})
        notes VARCHAR(100),                            -- Glosa o comentario del pago ingresado por el chofer

        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,


        CONSTRAINT fk_delivery_payment_order
            FOREIGN KEY (delivery_order_sale_id) --- REFERENCIA A LA ORDEN DIVIDIDA POR EMPRESA
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