// Who is signed in, and Sign out — for the brand's own screens (SPEC v2.3).

import { SignOutButton } from '@/app/sign-in/SignOutButton';

export function AccountBadge({ name, email }: { name: string | null; email: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="hidden sm:inline" title={email}>
        {name ?? email}
      </span>
      <SignOutButton className="text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline" />
    </div>
  );
}
