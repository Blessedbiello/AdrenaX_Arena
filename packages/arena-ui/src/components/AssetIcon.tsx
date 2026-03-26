const ASSET_ICONS: Record<string, string> = {
  SOL: '\u25CE',
  BTC: '\u20BF',
  ETH: '\u039E',
  BONK: '\uD83D\uDC15',
  JTO: '\u26A1',
  JITOSOL: '\u25CE',
  ANY: '\uD83C\uDF10',
};

export default function AssetIcon({ symbol, className }: { symbol: string; className?: string }) {
  return <span className={className}>{ASSET_ICONS[symbol.toUpperCase()] || '\uD83D\uDCCA'}</span>;
}
