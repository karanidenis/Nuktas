'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('./db');

/**
 * Initialize the short-lived, synthetic-only Render judge database.
 * Both files are idempotent so a Render restart is safe.
 */
async function bootstrapSyntheticDatabase() {
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  const seedPath = path.join(__dirname, '../db/render-seed.sql');
  const [schema, seed] = await Promise.all([
    fs.readFile(schemaPath, 'utf8'),
    fs.readFile(seedPath, 'utf8'),
  ]);

  process.stderr.write('[nuktas-triage-mcp-http] initializing synthetic judge database\n');
  await db.query(schema);
  await db.query(seed);
  process.stderr.write('[nuktas-triage-mcp-http] synthetic judge database ready\n');
}

module.exports = { bootstrapSyntheticDatabase };
