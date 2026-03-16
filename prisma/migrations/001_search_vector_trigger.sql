-- Creates the tsvector trigger for full-text search on Product.
-- Prisma cannot write to Unsupported("tsvector") fields directly,
-- so this trigger maintains search_vector automatically on INSERT/UPDATE.

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW."catalogNumber", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."familyName", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."displayName", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."description", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_search_vector_update ON "Product";

CREATE TRIGGER product_search_vector_update
BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

-- GIN index for fast tsvector search
CREATE INDEX IF NOT EXISTS product_search_vector_idx ON "Product" USING GIN (search_vector);
