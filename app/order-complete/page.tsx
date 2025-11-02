import Link from 'next/link';

export default function OrderCompletePage() {
    return (
        <div>
            <h1>Thank You!</h1>
            <p>Thank you for your order! Your project is now in production.</p>
            <p>You can track its status from your dashboard.</p>
            <Link href="/legacy-portal/dashboard.html">
                Go to Dashboard
            </Link>
        </div>
    );
}
