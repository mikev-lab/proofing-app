"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function CheckoutForm({ projectId }: { projectId: string }) {
    const stripe = useStripe();
    const elements = useElements();
    const router = useRouter();

    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            // Stripe.js has not yet loaded.
            // Make sure to disable form submission until Stripe.js has loaded.
            return;
        }

        setIsLoading(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Make sure to change this to your payment completion page
                return_url: `${window.location.origin}/order-complete`,
            },
            redirect: 'if_required', // This prevents the automatic redirect
        });

        if (error) {
            setMessage(error.message || 'An unexpected error occurred.');
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            // Payment succeeded
            try {
                const projectRef = doc(db, 'projects', projectId);
                await updateDoc(projectRef, {
                    status: 'In Production',
                });
                router.push('/order-complete');
            } catch (dbError) {
                console.error("Error updating project status:", dbError);
                setMessage("Payment succeeded, but we couldn't update your order status. Please contact us.");
            }
        } else {
             setMessage("An unexpected error occurred.");
        }


        setIsLoading(false);
    };

    return (
        <form id="payment-form" onSubmit={handleSubmit}>
            <PaymentElement id="payment-element" />
            <button disabled={isLoading || !stripe || !elements} id="submit">
                <span id="button-text">
                    {isLoading ? <div className="spinner" id="spinner"></div> : 'Pay now'}
                </span>
            </button>
            {/* Show any error or success messages */}
            {message && <div id="payment-message">{message}</div>}
        </form>
    );
}
