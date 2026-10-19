ALTER TABLE "games" ADD COLUMN "final_fen" text;
--> statement-breakpoint
-- D3: three exercise kinds. Same kind as the new buildExercises output, so a re-analysis keeps box/due_at.
UPDATE "exercises" SET "kind" = 'miss', "updated_at" = now() WHERE "kind" <> 'miss' AND ("class" = 'miss' OR ("kind" = 'brilliant' AND "brilliant_played" = false));
