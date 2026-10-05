// Team confirmation of quotes, per brand (SPEC v2.6 §8 point 5, DECISIONS #172).
//
// With confirmation on (the default) the team delivers every Signage.com quote
// by hand. With it off, a package goes to the franchisee the moment it is routed
// — but only one the team has nothing left to do on: Signage.com's own (an
// external vendor quotes off-platform) and fully priced (a custom-quote item is
// always priced by hand, and the franchisee should not see a quote missing it).

export interface RoutedPackage {
  quoteId: string;
  external: boolean;
  manualCount: number;
}

export function packagesToAutoDeliver<T extends RoutedPackage>(
  teamConfirmsQuotes: boolean,
  packages: readonly T[],
): T[] {
  if (teamConfirmsQuotes) return [];
  return packages.filter((pkg) => !pkg.external && pkg.manualCount === 0);
}
