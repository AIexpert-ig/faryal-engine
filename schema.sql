-- ============================================================
-- FARYAL AL HOSARY — Database Schema
-- Run: node schema.js  (or paste directly into psql)
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_units (
  id              SERIAL PRIMARY KEY,
  sku             VARCHAR(50) UNIQUE NOT NULL,
  model_name      VARCHAR(200) NOT NULL,
  designer        VARCHAR(200),
  category        VARCHAR(50) DEFAULT 'bridal',
  size_label      VARCHAR(20),
  color           VARCHAR(50),
  rental_price    DECIMAL(10,2) NOT NULL DEFAULT 0,
  current_status  VARCHAR(20) DEFAULT 'ready',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id              SERIAL PRIMARY KEY,
  full_name       VARCHAR(200) NOT NULL,
  email           VARCHAR(200) UNIQUE,
  phone           VARCHAR(30),
  wedding_date    DATE,
  bust_cm         DECIMAL(5,1),
  waist_cm        DECIMAL(5,1),
  hips_cm         DECIMAL(5,1),
  shoe_size       VARCHAR(10),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id                  SERIAL PRIMARY KEY,
  customer_id         INT REFERENCES customers(id) ON DELETE CASCADE,
  inventory_unit_id   INT REFERENCES inventory_units(id) ON DELETE CASCADE,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  buffer_end_date     DATE,
  total_fee           DECIMAL(10,2) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_unit ON bookings(inventory_unit_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);