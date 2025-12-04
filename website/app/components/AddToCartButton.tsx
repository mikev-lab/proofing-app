'use client';

import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';

interface AddToCartButtonProps {
    productName: string;
}

export default function AddToCartButton({ productName }: AddToCartButtonProps) {
    const { addItem } = useStore();
    const [quantity, setQuantity] = useState(100);

    const handleAddToCart = () => {
        addItem({
            title: productName,
            quantity: 1, // Treat the bundle of 100 as 1 unit for cart logic, or calculate differently
            unit_price: 25000, // $250.00 mock price
            metadata: {
                quantity_ordered: quantity
            },
            variant: {
                title: `${quantity} Units`
            }
        });
    };

    return (
        <div className="flex gap-4">
            <button
                onClick={handleAddToCart}
                className="flex-1 bg-indigo-600 border border-transparent rounded-md py-3 px-8 flex items-center justify-center text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
            >
                Add to Cart
            </button>
        </div>
    );
}
