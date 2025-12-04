import React from 'react';
import OrderDetailClient from './OrderDetailClient';

export async function generateStaticParams() {
  return [
    { id: '1024' },
    { id: '1023' },
    { id: '1022' },
    { id: '1021' },
  ];
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailClient id={id} />;
}
