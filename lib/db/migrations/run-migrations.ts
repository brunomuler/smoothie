/**
 * Database Migration Runner
 * Run with: npx tsx lib/db/migrations/run-migrations.ts
 */

import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import { config } from 'dotenv'

// Load environment variables from .env.local and .env files
const envLocalPath = path.resolve(process.cwd(), '.env.local')
const envPath = path.resolve(process.cwd(), '.env')

if (fs.existsSync(envLocalPath)) {
  console.log('Loading environment from .env.local')
  config({ path: envLocalPath })
} else if (fs.existsSync(envPath)) {
  console.log('Loading environment from .env')
  config({ path: envPath })
}

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  console.error('Please ensure .env.local or .env file exists with DATABASE_URL set')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function runMigrations() {
  const client = await pool.connect()

  try {
    console.log('Starting migrations...\n')

    // Get all SQL files in order
    const migrationsDir = path.dirname(__filename)
    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of sqlFiles) {
      console.log(`Running migration: ${file}`)
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')

      try {
        await client.query(sql)
        console.log(`  ✓ ${file} completed\n`)
      } catch (error) {
        console.error(`  ✗ ${file} failed:`, error)
        throw error
      }
    }

    console.log('All migrations completed successfully!')

    // Verify tables were created
    console.log('\nVerifying schema...')

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('pools', 'tokens', 'parsed_events')
    `)
    console.log('Tables:', tables.rows.map(r => r.table_name).join(', '))

    const views = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('daily_rates', 'user_action_history')
    `)
    console.log('Views:', views.rows.map(r => `${r.table_name} (${r.table_type})`).join(', '))

    // Show sample data
    const poolCount = await client.query('SELECT COUNT(*) FROM pools')
    const tokenCount = await client.query('SELECT COUNT(*) FROM tokens')
    console.log(`\nSeeded: ${poolCount.rows[0].count} pools, ${tokenCount.rows[0].count} tokens`)

  } finally {
    client.release()
    await pool.end()
  }
}

runMigrations().catch(console.error)
