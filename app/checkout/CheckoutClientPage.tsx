"use client";

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, DocumentData } from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from './CheckoutForm';

// It's recommended to set your Stripe publishable key in a secure way, for example, using environment variables.
// const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
const stripePromise = loadStripe('YOUR_STRIPE_PUBLISHABLE_KEY'); // Replace with your actual publishable key or use environment variables

interface ProjectData extends DocumentData {
  status: string;
  jobDetails: {
    quantity: number;
    finishedHeight: number;
    finishedWidth: number;
    bindingMethod: string;
    totalPrice: number;
  };
}

export default function CheckoutPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId');

    const [clientSecret, setClientSecret] = useState('');
    const [project, setProject] = useState<ProjectData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!projectId) {
            router.push('/');
            return;
        }

        const fetchProjectAndCreateIntent = async () => {
            try {
                const projectRef = doc(db, 'projects', projectId);
                const projectDoc = await getDoc(projectRef);

                if (!projectDoc.exists()) {
                    setError('Project not found.');
                    setTimeout(() => router.push('/'), 3000);
                    return;
                }

                const projectData = projectDoc.data() as ProjectData;

                if (projectData.status !== 'Pending') {
                    setError('This project is not pending payment.');
                    setTimeout(() => router.push('/legacy-portal/dashboard.html'), 3000);
                    return;
                }

                setProject(projectData);

                const createPaymentIntent = httpsCallable(functions, 'createPaymentIntent');
                const result = await createPaymentIntent({ projectId });
                const { clientSecret } = result.data as { clientSecret: string };
                setClientSecret(clientSecret);

            } catch (err) {
                console.error("Error fetching project or creating payment intent:", err);
                setError('An error occurred. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchProjectAndCreateIntent();
    }, [projectId, router]);

    const appearance = {
        theme: 'stripe' as const,
    };
    const options = {
        clientSecret,
        appearance,
    };

    const constructOrderSummary = () => {
        if (!project || !project.jobDetails) return "Loading order details...";
        const { quantity, finishedHeight, finishedWidth, bindingMethod } = project.jobDetails;
        return `Order: ${quantity} ${finishedWidth}x${finishedHeight} ${bindingMethod} Books`;
    }

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }

    return (
        <div>
            <h1>Checkout</h1>
            <div>
                <h2>Order Summary</h2>
                <p>{constructOrderSummary()}</p>
                <p>Total: ${project?.jobDetails?.totalPrice.toFixed(2)}</p>
            </div>
            {clientSecret && projectId && (
                <Elements options={options} stripe={stripePromise}>
                    <CheckoutForm projectId={projectId} />
                </Elements>
            )}
        </div>
    );
}
