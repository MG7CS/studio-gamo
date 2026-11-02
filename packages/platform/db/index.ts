/**
 * The database layer: the D1 client, the platform tables' Drizzle schema, the `SqlDatabase` type and the D1
 * helpers every platform folder and feature uses. Import as `@gamo/platform/db`; tests use `@gamo/platform/db/testing`.
 */
export * from './client.ts';
export * from './schema.ts';
export * from './sql-database.ts';
