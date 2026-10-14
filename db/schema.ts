// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaceState = sqliteTable('workspace_state', {id:text('id').primaryKey(), version:integer('version').notNull(), payload:text('payload').notNull()});
