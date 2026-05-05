import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  jsonb,
  decimal,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: integer('github_id').unique().notNull(),
  githubLogin: text('github_login').notNull(),
  email: text(),
  role: text().default('candidate'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  tokens: many(tokens),
  events: many(events),
  scorecards: many(scorecards),
}));

export const tokens = pgTable('tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  value: text().unique().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tokensRelations = relations(tokens, ({ one }) => ({
  user: one(users, {
    fields: [tokens.userId],
    references: [users.id],
  }),
}));

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    source: text().notNull(),
    model: text().notNull(),
    ts: timestamp('ts').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cacheRead: integer('cache_read').default(0),
    cacheCreation: integer('cache_creation').default(0),
    costUsd: decimal('cost_usd').default('0'),
    projectHash: text('project_hash'),
    toolName: text('tool_name'),
    messageId: text('message_id'),
    requestId: text('request_id'),
    sessionId: text('session_id'),
    isSubagent: boolean('is_subagent').default(false),
  },
  (table) => ({
    dedupeIdx: uniqueIndex('dedupe_idx').on(table.messageId, table.requestId),
    userIdIdx: index('events_user_id_idx').on(table.userId),
    tsIdx: index('events_ts_idx').on(table.ts),
  }),
);

export const eventsRelations = relations(events, ({ one }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
}));

export const scorecards = pgTable('scorecards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
  payload: jsonb().notNull(),
});

export const scorecardsRelations = relations(scorecards, ({ one }) => ({
  user: one(users, {
    fields: [scorecards.userId],
    references: [users.id],
  }),
}));

import { index } from 'drizzle-orm/pg-core';
