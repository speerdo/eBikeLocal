-- Adds canonical dedup + review moderation fields for shops.
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS normalized_address TEXT,
  ADD COLUMN IF NOT EXISTS listing_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS pending_review_reason TEXT,
  ADD COLUMN IF NOT EXISTS description_generated BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shops_listing_status ON shops(listing_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_normalized_address_city_state
  ON shops(normalized_address, city, state_code)
  WHERE normalized_address IS NOT NULL;
