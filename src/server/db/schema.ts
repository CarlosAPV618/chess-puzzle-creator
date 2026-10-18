import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { MoveAnalysis, PositionAnalysis } from "~/lib/types";

// ---------- Better Auth (user, session, account, verification, rateLimit) ----------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
});

/** Better Auth rate limiter (`rateLimit.storage = "database"`). Export name must be `rateLimit`. */
export const rateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---------- App ----------

/** Single source of truth for `max_users` (D11). Seeded by migration. */
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Own fixed-window rate limiter, one row per key (D11). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["pgn", "lichess", "chesscom"] }).notNull(),
    sourceId: text("source_id").notNull(),
    pgn: text("pgn").notNull(),
    white: text("white").notNull(),
    black: text("black").notNull(),
    whiteElo: integer("white_elo"),
    blackElo: integer("black_elo"),
    result: text("result").notNull(),
    timeClass: text("time_class"),
    playedAt: timestamp("played_at", { withTimezone: true }),
    userColor: text("user_color", { enum: ["w", "b"] }),
    openingName: text("opening_name"),
    // Derived server-side from the PGN at import time (chess.js replay).
    startFen: text("start_fen").notNull(),
    movesUci: text("moves_uci").array().notNull(),
    movesSan: text("moves_san").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("games_user_source_uq").on(t.userId, t.source, t.sourceId),
    index("games_user_played_idx").on(t.userId, t.playedAt),
  ]
);

export const playerNames = pgTable(
  "player_names",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nameLower: text("name_lower").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.nameLower] })]
);

export const analyses = pgTable("analyses", {
  gameId: uuid("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  depth: integer("depth").notNull(),
  engine: text("engine").notNull(),
  classifierVersion: integer("classifier_version").notNull(),
  positions: jsonb("positions").$type<PositionAnalysis[]>().notNull(),
  moves: jsonb("moves").$type<MoveAnalysis[]>().notNull(),
  accuracyWhite: real("accuracy_white").notNull(),
  accuracyBlack: real("accuracy_black").notNull(),
  // Per-color counters for "Mis partidas" (avoid loading the jsonb in the list).
  mistakesWhite: integer("mistakes_white").notNull().default(0),
  mistakesBlack: integer("mistakes_black").notNull().default(0),
  brilliantsWhite: integer("brilliants_white").notNull().default(0),
  brilliantsBlack: integer("brilliants_black").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    ply: integer("ply").notNull(), // index of the move in movesUci (0-based)
    color: text("color", { enum: ["w", "b"] }).notNull(), // side to move in `fen`
    fen: text("fen").notNull(),
    playedUci: text("played_uci").notNull(),
    kind: text("kind", { enum: ["mistake", "brilliant"] }).notNull(),
    side: text("side", { enum: ["me", "opponent"] }),
    bestUci: text("best_uci").notNull(),
    acceptedUci: text("accepted_uci").array().notNull(),
    refutationPv: text("refutation_pv").array().notNull(),
    cls: text("class").notNull(),
    epLoss: real("ep_loss").notNull(),
    phase: text("phase", { enum: ["opening", "middlegame", "endgame"] }).notNull(),
    brilliantPlayed: boolean("brilliant_played"),
    box: integer("box").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }).defaultNow().notNull(),
    attempts: integer("attempts").notNull().default(0),
    solvedCount: integer("solved_count").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("exercises_game_ply_uq").on(t.gameId, t.ply),
    index("exercises_user_due_idx")
      .on(t.userId, t.dueAt)
      .where(sql`${t.archivedAt} is null`),
  ]
);

export const exerciseAttempts = pgTable(
  "exercise_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firstTryCorrect: boolean("first_try_correct").notNull(),
    usedHint: boolean("used_hint").notNull(),
    viewedSolution: boolean("viewed_solution").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("attempts_user_created_idx").on(t.userId, t.createdAt),
    index("attempts_exercise_idx").on(t.exerciseId),
  ]
);

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));
