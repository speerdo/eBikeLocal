-- eBikeLocal Database Schema
-- Run against your Neon DB to initialize all tables and indexes.
-- Requires: PostGIS, pg_trgm, uuid-ossp extensions

-- ===== EXTENSIONS =====
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== TABLES =====

-- Geographic lookup: states
CREATE TABLE states (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  ebike_law_summary TEXT,
  ebike_classes_allowed TEXT,
  helmet_required BOOLEAN,
  min_age INTEGER,
  registration_required BOOLEAN,
  rebate_programs JSONB,
  law_last_updated TIMESTAMPTZ,
  shop_count INTEGER DEFAULT 0
);

-- Geographic lookup: cities
CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  state_code CHAR(2) REFERENCES states(code),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  population INTEGER,
  metro_area TEXT,
  shop_count INTEGER DEFAULT 0,
  has_dedicated_page BOOLEAN DEFAULT false
);

-- Primary directory listing: shops
CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  state_code CHAR(2) NOT NULL,
  zip TEXT,
  country CHAR(2) DEFAULT 'US',
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  phone TEXT,
  website TEXT,
  email TEXT,
  google_maps_uri TEXT,
  google_rating DECIMAL(2,1),
  google_review_count INTEGER,
  google_business_status TEXT,
  opening_hours JSONB,
  description TEXT,
  is_ebike_specialist BOOLEAN DEFAULT false,
  ebike_confidence_score DECIMAL(3,2),
  services TEXT[],
  shop_type TEXT,
  price_tier TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_claimed BOOLEAN DEFAULT false,
  is_partner BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  featured_image_url TEXT,
  photos TEXT[],
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- eBike brand directory
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  website TEXT,
  description TEXT,
  founded_year INTEGER,
  headquarters TEXT,
  country_of_origin TEXT,
  price_range_low INTEGER,
  price_range_high INTEGER,
  affiliate_program_url TEXT,
  affiliate_platform TEXT,
  affiliate_commission_rate DECIMAL(4,2),
  affiliate_cookie_days INTEGER,
  dealer_locator_url TEXT,
  estimated_us_dealers INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction: which brands each shop carries (the data moat)
CREATE TABLE shop_brands (
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  is_authorized_dealer BOOLEAN DEFAULT false,
  dealer_tier TEXT,
  source TEXT,
  verified_at TIMESTAMPTZ,
  PRIMARY KEY (shop_id, brand_id)
);

-- Product catalog: bikes
CREATE TABLE bikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  year INTEGER,
  msrp INTEGER,
  sale_price INTEGER,
  category TEXT NOT NULL,
  ebike_class INTEGER CHECK (ebike_class IN (1, 2, 3)),
  motor_watts INTEGER,
  motor_type TEXT,
  motor_torque_nm INTEGER,
  battery_wh INTEGER,
  range_miles_low INTEGER,
  range_miles_high INTEGER,
  top_speed_mph INTEGER,
  charge_time_hours DECIMAL(3,1),
  weight_lbs DECIMAL(4,1),
  max_payload_lbs INTEGER,
  wheel_size TEXT,
  frame_material TEXT,
  frame_types TEXT[],
  gearing TEXT,
  brakes TEXT,
  suspension TEXT,
  has_throttle BOOLEAN,
  has_torque_sensor BOOLEAN,
  has_gps BOOLEAN,
  has_app BOOLEAN,
  has_removable_battery BOOLEAN,
  ul_certified BOOLEAN,
  colors TEXT[],
  key_features TEXT[],
  hero_image_url TEXT,
  gallery_images TEXT[],
  affiliate_url TEXT,
  buy_urls JSONB,
  expert_rating DECIMAL(3,1),
  pros TEXT[],
  cons TEXT[],
  best_for TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Taxonomy: categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id),
  icon TEXT,
  sort_order INTEGER
);

-- Junction: bikes to categories
CREATE TABLE bike_categories (
  bike_id UUID REFERENCES bikes(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (bike_id, category_id)
);

-- Native user reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_name TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  visit_date DATE,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== INDEXES =====

-- Shops
CREATE INDEX idx_shops_city_state ON shops(city, state_code);
CREATE INDEX idx_shops_location ON shops USING gist(
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);
CREATE INDEX idx_shops_slug ON shops(slug);
CREATE INDEX idx_shops_google_place_id ON shops(google_place_id);
CREATE INDEX idx_shops_ebike_confidence ON shops(ebike_confidence_score DESC);
CREATE INDEX idx_shops_name_trgm ON shops USING gin(name gin_trgm_ops);

-- Bikes
CREATE INDEX idx_bikes_brand ON bikes(brand_id);
CREATE INDEX idx_bikes_category ON bikes(category);
CREATE INDEX idx_bikes_slug ON bikes(slug);

-- Junctions
CREATE INDEX idx_shop_brands_shop ON shop_brands(shop_id);
CREATE INDEX idx_shop_brands_brand ON shop_brands(brand_id);

-- Cities
CREATE INDEX idx_cities_state ON cities(state_code);
CREATE INDEX idx_cities_slug ON cities(slug);

-- Reviews
CREATE INDEX idx_reviews_shop ON reviews(shop_id);
