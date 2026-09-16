// Real wallet connections, read-only. We only ask for the public address and read its balance.
// Nothing here requests a signature or a transaction.
//  - Solana (and other Wallet Standard chains): Phantom, Solflare, Backpack, Glow, OKX, Coinbase, Trust, ...
//  - EVM via EIP-6963 discovery: MetaMask, Rabby, Coinbase Wallet, Brave, OKX, Trust, Zerion, Rainbow, ...
import { getWallets } from '@wallet-standard/app'
import { bus } from './state.js'

const KEY = 'playground-wallet-v1'
const SOLANA_RPCS = [import.meta.env.VITE_SOLANA_RPC, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean)

const EVM_CHAINS = {
  1: ['Ethereum', 'ETH'], 10: ['Optimism', 'ETH'], 56: ['BNB Chain', 'BNB'], 137: ['Polygon', 'POL'], 8453: ['Base', 'ETH'],
  42161: ['Arbitrum', 'ETH'], 43114: ['Avalanche', 'AVAX'], 59144: ['Linea', 'ETH'], 324: ['zkSync', 'ETH'], 81457: ['Blast', 'ETH'],
  11155111: ['Sepolia', 'ETH'],
}

const standard = getWallets()
const evmProviders = new Map() // uuid -> { info, provider }
let unsubscribe = null

export const wallet = {
  connected: null, // { id, name, icon, kind, address, network, balance, symbol }

  init() {
    standard.on('register', () => bus.emit('wallets-detected'))
    standard.on('unregister', () => bus.emit('wallets-detected'))
    window.addEventListener('eip6963:announceProvider', (e) => {
      const { info, provider } = e.detail || {}
      if (!info?.uuid || !provider) return
      evmProviders.set(info.uuid, { info, provider })
      bus.emit('wallets-detected')
    })
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => this.autoReconnect(), 600)
  },

  // Every wallet we can talk to in this browser
  list() {
    const out = []
    for (const w of standard.get()) {
      if (!w.features['standard:connect']) continue
      const chains = w.chains || []
      const kind = chains.some((c) => c.startsWith('solana:')) ? 'solana' : 'other'
      const chainName = kind === 'solana' ? 'Solana' : (chains[0] || '').split(':')[0] || 'Wallet'
      out.push({ id: `std:${w.name}`, name: w.name, icon: w.icon, kind, chainName })
    }
    for (const { info } of evmProviders.values()) {
      out.push({ id: `evm:${info.rdns || info.uuid}`, name: info.name, icon: info.icon, kind: 'evm', chainName: 'EVM' })
    }
    // Older injected EVM wallets that don't support EIP-6963
    if (!evmProviders.size && window.ethereum) {
      out.push({ id: 'evm:injected', name: 'Browser wallet', icon: null, kind: 'evm', chainName: 'EVM' })
    }
    return out
  },

  async connect(id, { silent = false } = {}) {
    try {
      if (id.startsWith('std:')) await this.connectStandard(id, silent)
      else await this.connectEvm(id, silent)
      if (!this.connected) return false
      try { localStorage.setItem(KEY, id) } catch {}
      bus.emit('wallet-change', { connected: true, silent })
      this.refreshBalance()
      return true
    } catch (err) {
      if (!silent) {
        const rejected = err?.code === 4001 || /reject|denied|cancel/i.test(err?.message || '')
        bus.emit('toast', { title: rejected ? 'Connection cancelled' : 'Could not connect', text: rejected ? 'You declined the request in your wallet.' : (err?.message || 'The wallet did not respond.').slice(0, 140), bad: true })
      }
      return false
    }
  },

  async connectStandard(id, silent) {
    const w = standard.get().find((x) => `std:${x.name}` === id)
    if (!w) throw new Error('Wallet not found in this browser.')
    const { accounts } = await w.features['standard:connect'].connect(silent ? { silent: true } : undefined)
    const account = accounts?.[0] || w.accounts?.[0]
    if (!account) { if (silent) return; throw new Error('The wallet returned no accounts.') }
    this.cleanupListeners()
    const chain = account.chains?.[0] || w.chains?.[0] || ''
    const isSolana = chain.startsWith('solana:')
    this.connected = {
      id, name: w.name, icon: w.icon, kind: isSolana ? 'solana' : 'other', address: account.address,
      network: isSolana ? `Solana ${chain.split(':')[1] || ''}`.trim() : chain || 'Unknown network',
      balance: null, symbol: isSolana ? 'SOL' : '',
    }
    const events = w.features['standard:events']
    if (events) {
      unsubscribe = events.on('change', ({ accounts: next }) => {
        if (!next) return
        if (!next.length) return this.disconnect({ quiet: true })
        this.connected.address = next[0].address
        bus.emit('wallet-change', { connected: true })
        this.refreshBalance()
      })
    }
    this._std = w
  },

  async connectEvm(id, silent) {
    const entry = [...evmProviders.values()].find(({ info }) => `evm:${info.rdns || info.uuid}` === id)
    const provider = entry?.provider || (id === 'evm:injected' ? window.ethereum : null)
    if (!provider) throw new Error('Wallet not found in this browser.')
    const accounts = await provider.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' })
    if (!accounts?.length) { if (silent) return; throw new Error('The wallet returned no accounts.') }
    this.cleanupListeners()
    this.connected = { id, name: entry?.info.name || 'Browser wallet', icon: entry?.info.icon || null, kind: 'evm', address: accounts[0], network: '', balance: null, symbol: 'ETH' }
    this._evm = provider
    const onAccounts = (next) => {
      if (!next?.length) return this.disconnect({ quiet: true })
      this.connected.address = next[0]
      bus.emit('wallet-change', { connected: true })
      this.refreshBalance()
    }
    const onChain = () => this.refreshBalance()
    provider.on?.('accountsChanged', onAccounts)
    provider.on?.('chainChanged', onChain)
    unsubscribe = () => {
      provider.removeListener?.('accountsChanged', onAccounts)
      provider.removeListener?.('chainChanged', onChain)
    }
  },

  async refreshBalance() {
    const c = this.connected
    if (!c) return
    try {
      if (c.kind === 'evm') {
        const chainId = parseInt(await this._evm.request({ method: 'eth_chainId' }), 16)
        const [name, symbol] = EVM_CHAINS[chainId] || [`Chain ${chainId}`, 'ETH']
        c.network = name
        c.symbol = symbol
        const wei = BigInt(await this._evm.request({ method: 'eth_getBalance', params: [c.address, 'latest'] }))
        c.balance = Number(wei / 10n ** 12n) / 1e6
      } else if (c.kind === 'solana' && /mainnet/.test(c.network)) {
        c.balance = await solanaBalance(c.address)
      }
    } catch {
      c.balance = null
    }
    if (this.connected === c) bus.emit('wallet-change', { connected: true, balance: true })
  },

  async disconnect({ quiet = false } = {}) {
    const c = this.connected
    this.cleanupListeners()
    try {
      if (c?.kind === 'evm') await this._evm?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
      else await this._std?.features['standard:disconnect']?.disconnect()
    } catch {} // not every wallet supports disconnecting from the app side
    this.connected = null
    this._std = this._evm = null
    try { localStorage.removeItem(KEY) } catch {}
    bus.emit('wallet-change', { connected: false })
    if (quiet) bus.emit('toast', { title: 'Wallet disconnected', text: 'Your wallet ended the connection.' })
  },

  cleanupListeners() {
    try { unsubscribe?.() } catch {}
    unsubscribe = null
  },

  async autoReconnect() {
    let id
    try { id = localStorage.getItem(KEY) } catch {}
    if (!id || this.connected) return
    // Wallets can register a little after page load; give them a moment
    for (let i = 0; i < 10 && !this.list().some((w) => w.id === id); i++) await new Promise((r) => setTimeout(r, 300))
    if (this.list().some((w) => w.id === id)) await this.connect(id, { silent: true })
  },
}

async function solanaBalance(address) {
  for (const url of SOLANA_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] }),
      })
      const json = await res.json()
      if (typeof json?.result?.value === 'number') return json.result.value / 1e9
    } catch {}
  }
  return null
}

// Wallets to suggest when nothing is installed. On phones, the links open Playground inside the wallet's own browser,
// where the wallet is injected and the normal connect flow above works.
export function walletLinks() {
  const url = location.href.split('#')[0]
  const enc = encodeURIComponent(url)
  const ref = encodeURIComponent(location.origin)
  const hostPath = `${location.host}${location.pathname}`
  return [
    { name: 'Phantom', chain: 'Solana + EVM', install: 'https://phantom.app/download', mobile: `https://phantom.app/ul/browse/${enc}?ref=${ref}` },
    { name: 'Solflare', chain: 'Solana', install: 'https://solflare.com/download', mobile: `https://solflare.com/ul/v1/browse/${enc}?ref=${ref}` },
    { name: 'Backpack', chain: 'Solana + EVM', install: 'https://backpack.app/download', mobile: null },
    { name: 'MetaMask', chain: 'EVM', install: 'https://metamask.io/download/', mobile: `https://metamask.app.link/dapp/${hostPath}` },
    { name: 'Coinbase Wallet', chain: 'EVM + Solana', install: 'https://www.coinbase.com/wallet/downloads', mobile: `https://go.cb-w.com/dapp?cb_url=${enc}` },
    { name: 'Trust Wallet', chain: 'Multi-chain', install: 'https://trustwallet.com/download', mobile: `https://link.trustwallet.com/open_url?coin_id=60&url=${enc}` },
    { name: 'Rabby', chain: 'EVM', install: 'https://rabby.io/', mobile: null },
  ]
}

export const shortAddress = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '')
