-- Raw data staging table for unprocessed scraper output
-- Stores all scraped records before deduplication and classification
CREATE TABLE IF NOT EXISTS staging_shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,              -- 'aventon', 'lectric', 'google_places', etc.
  source_id TEXT,                    -- original ID from the source (place_id, dealer_id)
  raw_data JSONB NOT NULL,           -- full raw record as scraped
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  state_code CHAR(2),
  zip TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  phone TEXT,
  website TEXT,
  email TEXT,
  brand_name TEXT,                   -- which brand's locator this came from (if any)
  dealer_tier TEXT,
  status TEXT DEFAULT 'pending',     -- pending, processed, duplicate, rejected
  ebike_confidence_score DECIMAL(3,2),
  matched_shop_id UUID,              -- FK to shops.id after dedup
  error_message TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_staging_source ON staging_shops(source);
CREATE INDEX IF NOT EXISTS idx_staging_status ON staging_shops(status);
CREATE INDEX IF NOT EXISTS idx_staging_state ON staging_shops(state_code);
CREATE INDEX IF NOT EXISTS idx_staging_source_id ON staging_shops(source, source_id);
