// Simple test to check if DATABASE_URL is loaded
require('dotenv').config()

console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'Yes' : 'No')
if (process.env.DATABASE_URL) {
  // Show first and last 20 chars only for security
  const url = process.env.DATABASE_URL
  const masked = url.substring(0, 30) + '...' + url.substring(url.length - 20)
  console.log('DATABASE_URL (masked):', masked)
}
