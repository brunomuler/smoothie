/**
 * Token Icon API Route
 *
 * Fetches token icon from the issuer's stellar.toml file.
 * Flow:
 * 1. Get issuer account from Horizon to find home_domain
 * 2. Fetch stellar.toml from home_domain
 * 3. Parse TOML to find the token's image URL
 * 4. Redirect to that image URL
 *
 * Caches results aggressively (1 week) since token logos rarely change.
 */

import { NextRequest, NextResponse } from "next/server"
import { getHorizonServer } from "@/lib/stellar/horizon"

// Cache for 1 week
const CACHE_MAX_AGE = 60 * 60 * 24 * 7

// In-memory cache for resolved icon URLs (persists across requests in same instance)
const iconUrlCache = new Map<string, { url: string | null; timestamp: number }>()
const MEMORY_CACHE_TTL = 60 * 60 * 1000 // 1 hour in ms

function getCacheKey(code: string, issuer: string): string {
  return `${code}-${issuer}`
}

function getFromMemoryCache(key: string): string | null | undefined {
  const cached = iconUrlCache.get(key)
  if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
    return cached.url
  }
  return undefined
}

function setMemoryCache(key: string, url: string | null): void {
  iconUrlCache.set(key, { url, timestamp: Date.now() })
}

// Simple TOML parser for stellar.toml [[CURRENCIES]] section
function parseTomlForImage(tomlContent: string, assetCode: string, issuer: string): string | null {
  try {
    // Find all [[CURRENCIES]] blocks
    const currencyBlocks = tomlContent.split(/\[\[CURRENCIES\]\]/i).slice(1)

    for (const block of currencyBlocks) {
      // Extract until next section (starts with [ or end of string)
      const blockContent = block.split(/\n\[/)[0]

      // Parse key-value pairs
      const lines = blockContent.split("\n")
      let blockCode: string | null = null
      let blockIssuer: string | null = null
      let blockImage: string | null = null

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue

        // Match key = "value" or key = 'value'
        const match = trimmed.match(/^(\w+)\s*=\s*["'](.*)["']/)
        if (match) {
          const [, key, value] = match
          const keyLower = key.toLowerCase()
          if (keyLower === "code") blockCode = value
          if (keyLower === "issuer") blockIssuer = value
          if (keyLower === "image") blockImage = value
        }
      }

      // Check if this block matches our asset
      if (
        blockCode?.toUpperCase() === assetCode.toUpperCase() &&
        blockIssuer === issuer &&
        blockImage
      ) {
        return blockImage
      }
    }

    return null
  } catch (error) {
    console.error("[Token Icon API] Error parsing TOML:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const issuer = searchParams.get("issuer")

  if (!code || !issuer) {
    return NextResponse.json(
      { error: "Missing code or issuer parameter" },
      { status: 400 }
    )
  }

  const cacheKey = getCacheKey(code, issuer)

  // Check memory cache first
  const cachedUrl = getFromMemoryCache(cacheKey)
  if (cachedUrl !== undefined) {
    if (cachedUrl === null) {
      // Cached "not found" - return 404
      return NextResponse.json(
        { error: "No icon found for this asset" },
        {
          status: 404,
          headers: {
            "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
          },
        }
      )
    }
    // Redirect to cached URL
    return NextResponse.redirect(cachedUrl, {
      status: 302,
      headers: {
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
      },
    })
  }

  try {
    // Step 1: Get issuer account to find home_domain
    const server = getHorizonServer()
    let homeDomain: string | undefined

    try {
      const account = await server.loadAccount(issuer)
      homeDomain = account.home_domain
    } catch (error) {
      console.error("[Token Icon API] Error loading issuer account:", error)
      setMemoryCache(cacheKey, null)
      return NextResponse.json(
        { error: "Could not load issuer account" },
        {
          status: 404,
          headers: {
            "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
          },
        }
      )
    }

    if (!homeDomain) {
      setMemoryCache(cacheKey, null)
      return NextResponse.json(
        { error: "Issuer has no home_domain set" },
        {
          status: 404,
          headers: {
            "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
          },
        }
      )
    }

    // Step 2: Fetch stellar.toml from home_domain
    const tomlUrl = `https://${homeDomain}/.well-known/stellar.toml`
    let tomlContent: string

    try {
      const tomlResponse = await fetch(tomlUrl, {
        headers: {
          Accept: "text/plain, application/toml, */*",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      if (!tomlResponse.ok) {
        throw new Error(`Failed to fetch stellar.toml: ${tomlResponse.status}`)
      }

      tomlContent = await tomlResponse.text()
    } catch (error) {
      console.error("[Token Icon API] Error fetching stellar.toml:", error)
      setMemoryCache(cacheKey, null)
      return NextResponse.json(
        { error: "Could not fetch stellar.toml" },
        {
          status: 404,
          headers: {
            "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
          },
        }
      )
    }

    // Step 3: Parse TOML to find image URL
    const imageUrl = parseTomlForImage(tomlContent, code, issuer)

    if (!imageUrl) {
      setMemoryCache(cacheKey, null)
      return NextResponse.json(
        { error: "No icon found in stellar.toml" },
        {
          status: 404,
          headers: {
            "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
          },
        }
      )
    }

    // Cache and redirect to image URL
    setMemoryCache(cacheKey, imageUrl)
    return NextResponse.redirect(imageUrl, {
      status: 302,
      headers: {
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
      },
    })
  } catch (error) {
    console.error("[Token Icon API] Unexpected error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
