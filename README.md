# Smoothie

A Stellar wallet dashboard for tracking your [Blend Protocol](https://blend.capital/) lending and borrowing positions.

## Features

- **Position Tracking** - View your supply, collateral, and borrow positions across Blend pools
- **Pool Analytics** - See pool APYs, utilization rates, and reserve details
- **Health Monitoring** - Track borrow limits and liquidation risk per pool
- **Balance History** - Historical charts of your position values over time
- **BLND Emissions** - Track claimable BLND token rewards
- **Multi-Wallet** - Connect via Freighter, Lobstr, or other Stellar wallets

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Blockchain**: Stellar SDK + Blend SDK
- **State**: Zustand + TanStack Query
- **Database**: PostgreSQL (Neon) for balance history

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/your-username/smoothie.git
cd smoothie
npm install
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
# Network: 'testnet' or 'public'
NEXT_PUBLIC_STELLAR_NETWORK=public

# Stellar endpoints
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_RPC_URL=https://mainnet.sorobanrpc.com

# Database (optional - for balance history)
DATABASE_URL=postgresql://...
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
├── app/                 # Next.js pages and API routes
│   ├── api/            # Backend API endpoints
│   └── pool/[poolId]/  # Pool details page
├── components/          # React components
├── hooks/              # Custom React hooks
├── lib/
│   ├── blend/          # Blend Protocol SDK utilities
│   ├── stellar/        # Stellar network helpers
│   └── db/             # Database queries
├── stores/             # Zustand state stores
└── types/              # TypeScript definitions
```