export type EvmProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (name: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (name: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  rdns?: string;
};

const eip6963Providers = new Map<string, EvmProvider>();

export function asEvmProvider(value: unknown): EvmProvider | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return typeof (value as EvmProvider).request === 'function' ? (value as EvmProvider) : undefined;
}

/** Phantom spoofs `isMetaMask`. A Phantom flag always wins over that spoof. */
export function normalizeEvmProvider(provider: EvmProvider, extra?: Partial<EvmProvider>): EvmProvider {
  const isPhantom = Boolean(extra?.isPhantom ?? provider.isPhantom);
  return {
    request: (args) => provider.request(args),
    on: provider.on ? (name, handler) => provider.on?.(name, handler) : undefined,
    removeListener: provider.removeListener
      ? (name, handler) => provider.removeListener?.(name, handler)
      : undefined,
    isPhantom,
    isMetaMask: Boolean(extra?.isMetaMask ?? provider.isMetaMask) && !isPhantom,
    rdns: extra?.rdns ?? provider.rdns,
  };
}

/** Lower is better. MetaMask outranks generic injected wallets; Phantom is last. */
export function evmProviderRank(provider: EvmProvider): number {
  if (provider.isMetaMask && !provider.isPhantom) return 0;
  if (provider.isPhantom) return 2;
  return 1;
}

export function eip6963InjectedProviders(): EvmProvider[] {
  return [...eip6963Providers.values()];
}

/** EIP-6963: each extension announces itself instead of fighting over window.ethereum. */
export function listenForEip6963Providers() {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __liftEip6963?: boolean };
  if (w.__liftEip6963) {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return;
  }
  w.__liftEip6963 = true;
  window.addEventListener('eip6963:announceProvider', ((event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { info?: { rdns?: string; uuid?: string; name?: string }; provider?: unknown }
      | undefined;
    const provider = asEvmProvider(detail?.provider);
    if (!provider) return;
    const rdns = String(detail?.info?.rdns || detail?.info?.uuid || '');
    const label = `${rdns} ${detail?.info?.name || ''}`;
    const isPhantom = /phantom/i.test(label);
    const isMetaMask = /metamask/i.test(label) && !isPhantom;
    const key = rdns || `${isPhantom ? 'phantom' : isMetaMask ? 'metamask' : 'evm'}:${eip6963Providers.size}`;
    eip6963Providers.set(key, normalizeEvmProvider(provider, { isPhantom, isMetaMask, rdns: key }));
  }) as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/** Collect injected providers without assuming window.ethereum belongs to the selected wallet. */
export function collectInjectedEvmProviders(
  ethereum: unknown,
  phantomEthereum?: unknown,
  extra: EvmProvider[] = [],
): EvmProvider[] {
  const providers: EvmProvider[] = [];
  const add = (value: unknown, extraFlags?: Partial<EvmProvider>) => {
    const provider = asEvmProvider(value);
    if (!provider) return;
    const normalized = normalizeEvmProvider(provider, extraFlags);
    if (providers.some((item) => item.request === normalized.request)) return;
    providers.push(normalized);
  };

  if (ethereum && typeof ethereum === 'object') {
    const announced = (ethereum as { providers?: unknown }).providers;
    if (Array.isArray(announced)) announced.forEach((item) => add(item));
  }
  add(ethereum);
  add(phantomEthereum, { isPhantom: true });
  extra.forEach((item) => add(item));
  return providers;
}

/** Prefer MetaMask for a generic injected EVM connection when several extensions coexist. */
export function preferredInjectedEvmProvider(providers: EvmProvider[]): EvmProvider | undefined {
  return [...providers].sort((a, b) => evmProviderRank(a) - evmProviderRank(b))[0];
}

/** Resolve the provider whose currently selected account matches the connected UI account. */
export async function findEvmProviderForAddress(
  providers: Array<EvmProvider | null | undefined>,
  address: string,
): Promise<EvmProvider | undefined> {
  const expected = address.toLowerCase();
  const seen = new Set<EvmProvider>();
  const matches: EvmProvider[] = [];
  for (const provider of providers) {
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    try {
      const accounts = (await provider.request({ method: 'eth_accounts' })) as unknown;
      if (
        Array.isArray(accounts) &&
        typeof accounts[0] === 'string' &&
        accounts[0].toLowerCase() === expected
      ) {
        matches.push(provider);
      }
    } catch {
      /* an unavailable extension must not prevent checking the selected wallet */
    }
  }
  matches.sort((a, b) => evmProviderRank(a) - evmProviderRank(b));
  return matches[0];
}

export function thrownMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function describeEvmWalletError(err: unknown) {
  const raw = thrownMessage(err, '');
  if (/user rejected|denied|cancel/i.test(raw)) return 'Transaction was cancelled in the wallet.';
  if (/unexpected error|internal error/i.test(raw)) {
    return 'Phantom intercepted this Base transaction. Disconnect, then connect MetaMask — not Phantom.';
  }
  return raw || 'The wallet could not send this transaction.';
}
