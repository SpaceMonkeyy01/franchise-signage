// Forgot password (SPEC v2.3 §10.3.3). The answer is the same sentence whether
// or not an account exists for the address.

import { AuthCard } from '@/components/AuthCard';
import { RESET_TTL_MINUTES } from '@/lib/auth/password-reset';

import { ForgotForm } from './ForgotForm';

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle={`Enter your email and we'll send a link to choose a new password. It works for ${RESET_TTL_MINUTES} minutes.`}
    >
      <ForgotForm />
    </AuthCard>
  );
}
