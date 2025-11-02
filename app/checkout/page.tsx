import { Suspense } from 'react';
import CheckoutClientPage from './CheckoutClientPage';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Loading Checkout...</div>}>
      <CheckoutClientPage />
    </Suspense>
  );
}
