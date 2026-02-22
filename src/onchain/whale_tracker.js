const axios = require('axios');
const path = require('path');

let config;
try { config = require(path.resolve(__dirname, '../../config/config.json')); } catch { config = {}; }

const TIMEOUT = config?.aggregator?.requestTimeoutMs || 15000;
const WHALE_THRESHOLD_USD = 1_000_000;

const ax = axios.create({ timeout: TIMEOUT });

// Known exchange addresses (simplified set)
const KNOWN_EXCHANGES = {
  btc: [
    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // genesis
    'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3', // Binance
    '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6', // Binance
    'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', // Binance
  ],
  eth: [
    '0x28c6c06298d514db089934071355e5743bf21d60', // Binance
    '0x21a31ee1afc51d94c2efccaa2092ad1028285549', // Binance
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', // Binance
    '0x56eddb7aa87536c09ccc2793473599fd21a8b17f', // Binance
    '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2', // FTX
    '0xf977814e90da44bfa03b6295a0616a897441acec', // Binance
  ],
};

async function fetchBTCWhaleTransactions() {
  const txs = [];
  try {
    // blockchain.info latest blocks / unconfirmed transactions
    const { data } = await ax.get('https://blockchain.info/unconfirmed-transactions?format=json', {
      params: { limit: 50 },
    });

    const unconfirmed = data?.txs || [];
    for (const tx of unconfirmed) {
      const totalOut = (tx.out || []).reduce((sum, o) => sum + (o.value || 0), 0) / 1e8; // satoshi to BTC
      // Rough BTC price estimate — we use a conservative $60k
      const estimatedUSD = totalOut * 60000;
      if (estimatedUSD >= WHALE_THRESHOLD_USD) {
        const isExchangeRelated = (tx.inputs || []).some(i =>
          KNOWN_EXCHANGES.btc.includes(i.prev_out?.addr)
        ) || (tx.out || []).some(o => KNOWN_EXCHANGES.btc.includes(o.addr));

        txs.push({
          chain: 'BTC',
          hash: tx.hash,
          valueBTC: parseFloat(totalOut.toFixed(4)),
          estimatedUSD: Math.round(estimatedUSD),
          isExchangeRelated,
          direction: isExchangeRelated ? 'exchange_flow' : 'unknown',
          time: tx.time ? new Date(tx.time * 1000).toISOString() : null,
        });
      }
    }
  } catch (e) {
    txs.push({ error: `btc_whale: ${e.message}` });
  }
  return txs;
}

async function fetchETHWhaleTransactions() {
  const txs = [];
  try {
    // Use Etherscan-like public API (no key needed for basic calls, rate-limited)
    // Fallback: blockchair
    const { data } = await ax.get('https://api.blockchair.com/ethereum/transactions', {
      params: { limit: 25, s: 'value(desc)' },
    });

    const ethTxs = data?.data || [];
    for (const tx of ethTxs) {
      const valueETH = parseFloat(tx.value) / 1e18;
      const estimatedUSD = valueETH * 3000; // conservative ETH price
      if (estimatedUSD >= WHALE_THRESHOLD_USD) {
        const sender = (tx.sender || '').toLowerCase();
        const recipient = (tx.recipient || '').toLowerCase();
        const isExchangeRelated = KNOWN_EXCHANGES.eth.some(e =>
          sender === e.toLowerCase() || recipient === e.toLowerCase()
        );

        let direction = 'unknown';
        if (isExchangeRelated) {
          const senderIsExchange = KNOWN_EXCHANGES.eth.some(e => sender === e.toLowerCase());
          const recipientIsExchange = KNOWN_EXCHANGES.eth.some(e => recipient === e.toLowerCase());
          if (senderIsExchange && !recipientIsExchange) direction = 'exchange_outflow';
          else if (!senderIsExchange && recipientIsExchange) direction = 'exchange_inflow';
          else direction = 'exchange_internal';
        }

        txs.push({
          chain: 'ETH',
          hash: tx.hash,
          valueETH: parseFloat(valueETH.toFixed(4)),
          estimatedUSD: Math.round(estimatedUSD),
          from: sender,
          to: recipient,
          isExchangeRelated,
          direction,
          time: tx.time || null,
        });
      }
    }
  } catch (e) {
    txs.push({ error: `eth_whale: ${e.message}` });
  }
  return txs;
}

async function trackWhales() {
  const [btc, eth] = await Promise.allSettled([
    fetchBTCWhaleTransactions(),
    fetchETHWhaleTransactions(),
  ]);

  const btcTxs = btc.status === 'fulfilled' ? btc.value : [{ error: btc.reason?.message }];
  const ethTxs = eth.status === 'fulfilled' ? eth.value : [{ error: eth.reason?.message }];

  const allTxs = [...btcTxs, ...ethTxs].filter(t => !t.error);
  const errors = [...btcTxs, ...ethTxs].filter(t => t.error).map(t => t.error);

  // Summarize exchange flows
  const inflows = allTxs.filter(t => t.direction === 'exchange_inflow');
  const outflows = allTxs.filter(t => t.direction === 'exchange_outflow');

  return {
    transactions: allTxs.sort((a, b) => (b.estimatedUSD || 0) - (a.estimatedUSD || 0)),
    summary: {
      totalWhaleTransactions: allTxs.length,
      totalValueUSD: allTxs.reduce((s, t) => s + (t.estimatedUSD || 0), 0),
      exchangeInflows: inflows.length,
      exchangeInflowUSD: inflows.reduce((s, t) => s + (t.estimatedUSD || 0), 0),
      exchangeOutflows: outflows.length,
      exchangeOutflowUSD: outflows.reduce((s, t) => s + (t.estimatedUSD || 0), 0),
    },
    errors,
  };
}

module.exports = { trackWhales };
