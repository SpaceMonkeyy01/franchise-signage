// The Signage.com wordmark (public/brands/signage). Two versions: black
// lettering for light backgrounds, white for dark ones like the console header.
// Signage.com is the company that operates the portal; the product itself is
// still "Franchise by Signage" (CLAUDE.md), and this never replaces that name.

export function SignageLogo({
  onDark = false,
  className = 'h-5 w-auto',
}: {
  onDark?: boolean;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={onDark ? '/brands/signage/logo-on-dark.png' : '/brands/signage/logo.png'}
      alt="Signage.com"
      width={1000}
      height={238}
      className={className}
    />
  );
}
