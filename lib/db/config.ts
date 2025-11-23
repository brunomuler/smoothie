import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL

console.log('[DB Config] DATABASE_URL exists:', !!DATABASE_URL)
if (DATABASE_URL) {
  console.log('[DB Config] DATABASE_URL preview:', DATABASE_URL.substring(0, 30) + '...')
}

if (!DATABASE_URL) {
  console.warn('DATABASE_URL is not set - database features will be unavailable')
}

// Serverless-friendly connection pool with singleton pattern
// This prevents creating multiple pools in serverless environments
let cachedPool: Pool | null = null

function getPool(): Pool | null {
  if (!DATABASE_URL) {
    return null
  }

  // In serverless environments, reuse existing pool if available
  if (cachedPool) {
    console.log('[DB Config] Reusing cached pool')
    return cachedPool
  }

  console.log('[DB Config] Creating new pool with connection string')
  // Create new pool with serverless-optimized settings
  cachedPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Required for Neon
    },
    // Serverless-optimized settings
    max: 5, // Allow multiple concurrent connections
    idleTimeoutMillis: 30000, // Keep connections alive longer
    connectionTimeoutMillis: 30000, // Increase timeout for slow connections
    // Allow graceful termination
    allowExitOnIdle: true,
  })

  console.log('[DB Config] Pool created successfully')
  return cachedPool
}

// Export the pool getter
export const pool = getPool()

// Test connection on initialization
if (pool) {
  pool.on('connect', () => {
    console.log('Connected to PostgreSQL database')
  })

  pool.on('error', (err) => {
    console.error('Unexpected database error:', err)
  })
}

// Helper function to test connection
export async function testConnection(): Promise<boolean> {
  if (!pool) {
    console.warn('No database pool available')
    return false
  }

  try {
    const client = await pool.connect()
    const result = await client.query('SELECT NOW()')
    console.log('Database connection successful:', result.rows[0].now)
    client.release()
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    console.log('Database pool closed')
  }
}
