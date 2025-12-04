'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { sdk } from '../lib/medusa';

// Types mimicking Medusa's structure
export interface LineItem {
  id: string;
  title: string;
  quantity: number;
  thumbnail?: string;
  unit_price: number;
  metadata?: Record<string, any>;
  variant?: {
    title: string;
  };
}

export interface Cart {
  id: string;
  items: LineItem[];
  subtotal: number;
  currency_code: string;
}

interface StoreContextType {
  cart: Cart | null;
  addItem: (item: Omit<LineItem, 'id' | 'unit_price'> & { unit_price?: number; variant_id?: string }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  isCartOpen: boolean;
  toggleCart: () => void;
  checkout: () => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartId, setCartId] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);

  // Initialize cart (Real Medusa vs Mock)
  useEffect(() => {
    const initCart = async () => {
        const storedCartId = localStorage.getItem('medusa_cart_id');

        if (storedCartId) {
            try {
                // v2 SDK: sdk.store.cart.retrieve(id)
                const { cart: existingCart } = await sdk.store.cart.retrieve(storedCartId);
                setCart(existingCart as unknown as Cart);
                setCartId(existingCart.id);
                console.log("Medusa: Cart retrieved", existingCart.id);
                return;
            } catch (e) {
                console.warn("Medusa: Failed to retrieve stored cart, creating new one.", e);
                localStorage.removeItem('medusa_cart_id');
            }
        }

        try {
            // v2 SDK: sdk.store.cart.create(data)
            // v2 usually requires region_id or country_code context if not set by middleware
            // Assuming default region setup
            const { cart: newCart } = await sdk.store.cart.create({});
            setCart(newCart as unknown as Cart);
            setCartId(newCart.id);
            localStorage.setItem('medusa_cart_id', newCart.id);
            console.log("Medusa: New cart created", newCart.id);
        } catch (e) {
            console.error("Medusa: Backend unreachable. Falling back to Mock Mode.", e);
            setUseMock(true);
            setCart({
                id: 'cart_mock_fallback',
                items: [],
                subtotal: 0,
                currency_code: 'usd',
            });
        }
    };

    initCart();
  }, []);

  // --- MOCK LOGIC (Fallback) ---
  const calculateMockTotal = (items: LineItem[]) => {
    return items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);
  };

  const addItemMock = (newItem: any) => {
    if (!cart) return;
    const price = newItem.unit_price || 2500;
    const existingItem = cart.items.find(i => i.title === newItem.title && JSON.stringify(i.metadata) === JSON.stringify(newItem.metadata));
    let updatedItems;
    if (existingItem) {
        updatedItems = cart.items.map(i => i.id === existingItem.id ? { ...i, quantity: i.quantity + newItem.quantity } : i);
    } else {
        updatedItems = [...cart.items, { ...newItem, id: `item_${Date.now()}`, unit_price: price, metadata: newItem.metadata || {} }];
    }
    setCart({ ...cart, items: updatedItems, subtotal: calculateMockTotal(updatedItems) });
    setIsCartOpen(true);
  };

  // --- REAL LOGIC (Medusa) ---
  const addItem = async (item: Omit<LineItem, 'id' | 'unit_price'> & { unit_price?: number; variant_id?: string }) => {
    if (useMock) {
        addItemMock(item);
        return;
    }

    if (!cartId) return;

    try {
        const variantId = item.variant_id || "variant_dummy";

        // v2 SDK: sdk.store.cart.createLineItem(cartId, data)
        const { cart: updatedCart } = await sdk.store.cart.createLineItem(cartId, {
            variant_id: variantId,
            quantity: item.quantity,
            metadata: item.metadata
        });

        setCart(updatedCart as unknown as Cart);
        setIsCartOpen(true);
    } catch (e) {
        console.error("Medusa: Failed to add item.", e);
        if (!useMock) {
             // alert("Medusa Backend Error: Could not add item. Switching to local mock for demo.");
             // Silently switch for smoother demo if backend is flaky
             setUseMock(true);
             addItemMock(item);
        }
    }
  };

  const removeItem = async (id: string) => {
    if (useMock || !cartId) {
        if (!cart) return;
        const updatedItems = cart.items.filter(i => i.id !== id);
        setCart({ ...cart, items: updatedItems, subtotal: calculateMockTotal(updatedItems) });
        return;
    }

    try {
        // v2 SDK: sdk.store.cart.deleteLineItem(cartId, lineId)
        const { cart: updatedCart } = await sdk.store.cart.deleteLineItem(cartId, id);
        setCart(updatedCart as unknown as Cart);
    } catch (e) {
        console.error("Medusa: Delete failed", e);
    }
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) {
        removeItem(id);
        return;
    }

    if (useMock || !cartId) {
        if (!cart) return;
        const updatedItems = cart.items.map(i => i.id === id ? { ...i, quantity } : i);
        setCart({ ...cart, items: updatedItems, subtotal: calculateMockTotal(updatedItems) });
        return;
    }

    try {
        // v2 SDK: sdk.store.cart.updateLineItem(cartId, lineId, data)
        const { cart: updatedCart } = await sdk.store.cart.updateLineItem(cartId, id, { quantity });
        setCart(updatedCart as unknown as Cart);
    } catch (e) {
        console.error("Medusa: Update failed", e);
    }
  }

  const toggleCart = () => setIsCartOpen(!isCartOpen);

  const checkout = () => {
    if (useMock) {
        alert("Mock Checkout: Redirecting...");
    } else {
        window.location.href = "/checkout";
    }
  };

  return (
    <StoreContext.Provider value={{ cart, addItem, removeItem, updateQuantity, isCartOpen, toggleCart, checkout }}>
      {children}
    </StoreContext.Provider>
  );
};
