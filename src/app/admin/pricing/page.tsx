// Pricing became part of Settings (DECISIONS #191).
import { redirect } from 'next/navigation';

export default function PricingMoved() {
  redirect('/admin/settings');
}
