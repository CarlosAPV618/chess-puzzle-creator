-- D11: signup cap. app_config.max_users is the single source of truth.
INSERT INTO "app_config" ("key", "value") VALUES ('max_users', '20') ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Final guarantee against concurrent signups: serialize inserts on "user" with a
-- transaction-scoped advisory lock (works with Neon's transaction pooler).
CREATE OR REPLACE FUNCTION enforce_max_users() RETURNS trigger AS $$
DECLARE
  max_users integer;
BEGIN
  PERFORM pg_advisory_xact_lock(727274001);
  SELECT value::integer INTO max_users FROM app_config WHERE key = 'max_users';
  IF max_users IS NOT NULL AND (SELECT count(*) FROM "user") >= max_users THEN
    RAISE EXCEPTION 'SIGNUP_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER user_max_users_trigger
  BEFORE INSERT ON "user"
  FOR EACH ROW EXECUTE FUNCTION enforce_max_users();
