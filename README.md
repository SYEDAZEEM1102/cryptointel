# CryptoIntel 🧠

**Open-source crypto research automation pipeline.**

Turn fragmented crypto data into actionable intelligence briefings — automatically.

## What It Does

CryptoIntel automates the full crypto research lifecycle:

```
Hypothesis → Data Aggregation → Normalization → Pattern Detection → Narrative Mapping → Synthesis → Briefing
```

Instead of spending 3+ hours manually gathering data across chains, dashboards, CT, and news sites, CryptoIntel compresses this into a structured pipeline that runs on schedule and delivers a daily intelligence briefing.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  CLI / Cron Orchestrator         │
├──────────┬──────────┬──────────┬────────────────┤
│  Data    │    CT    │  News/YT │   On-Chain     │
│Aggregator│ Scanner  │ Scanner  │   Anomaly      │
│          │          │          │   Detector     │
├──────────┴──────────┴──────────┴────────────────┤
│              Synthesis Engine                     │
│         (Structured Intelligence Briefing)        │
└─────────────────────────────────────────────────┘
```

### Modules

| Module | Description | Data Sources |
|--------|-------------|-------------|
| **Data Aggregator** | Market data, TVL, derivatives, token metrics | DeFiLlama, CoinGlass, CoinGecko |
| **CT Scanner** | Narrative detection, sentiment, KOL tracking | X/Twitter lists, trending topics |
| **News/YT Scanner** | Headlines, video summaries, breaking news | CoinDesk, Decrypt, The Block, YouTube |
| **On-Chain Anomaly Detector** | Whale flows, TVL spikes, funding shifts | DeFiLlama, CoinGlass, public APIs |
| **Synthesis Engine** | Combines all signals into final briefing | All module outputs → LLM synthesis |

## Quick Start

```bash
# Install dependencies
npm install

# Configure API keys
cp config/example.env config/.env

# Run full pipeline
node src/cli/index.js --full

# Run individual modules
node src/cli/index.js --module aggregator
node src/cli/index.js --module ct-scanner
node src/cli/index.js --module news
node src/cli/index.js --module onchain
node src/cli/index.js --module synthesis
```

## Configuration

Edit `config/config.json` to customize:
- API keys (CoinGecko, DeFiLlama, etc.)
- X list URLs for CT scanning
- YouTube channels to monitor
- News sources
- Briefing format and output preferences
- Cron schedule

## Output

Daily briefings are saved to `output/` as both JSON (structured data) and Markdown (readable briefing).

Example output:
- `output/2026-02-22-briefing.md` — Full intelligence briefing
- `output/2026-02-22-data.json` — Raw structured data

## Philosophy

> The edge isn't automation — it's judgment, verified and applied faster.

CryptoIntel doesn't replace your analysis. It eliminates the 80% of time spent gathering and normalizing data, so you can focus on the 20% that actually generates alpha: pattern recognition, narrative judgment, and trade thesis formation.

## Tech Stack

- **Runtime:** Node.js
- **APIs:** DeFiLlama, CoinGlass, CoinGecko (all free tiers)
- **LLMs:** Configurable (Claude, Gemini, Grok, ChatGPT)
- **Scraping:** Puppeteer / fetch for CT and news
- **Output:** Markdown + JSON + optional PDF

## License

MIT

## Built By

[BomBiggy.eth](https://x.com/BomBiggy) — Crypto Market Strategist & Research Automation
