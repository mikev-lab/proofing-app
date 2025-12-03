'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

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
  addItem: (item: Omit<LineItem, 'id' | 'unit_price'> & { unit_price?: number }) => void;
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

  // Initialize mock cart
  useEffect(() => {
    // In a real app, we would fetch the cart from Medusa using a session ID
    setCart({
      id: 'cart_mock_123',
      items: [],
      subtotal: 0,
      currency_code: 'usd',
    });
  }, []);

  // Recalculate totals helper
  const calculateTotal = (items: LineItem[]) => {
    return items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);
  };

  const addItem = (newItem: Omit<LineItem, 'id' | 'unit_price'> & { unit_price?: number }) => {
    if (!cart) return;

    // Use provided price or default random for demo
    const price = newItem.unit_price || 2500; // $25.00 default (cents)

    const existingItem = cart.items.find(i => i.title === newItem.title && JSON.stringify(i.metadata) === JSON.stringify(newItem.metadata));

    let updatedItems;
    if (existingItem) {
      updatedItems = cart.items.map(i =>
        i.id === existingItem.id
          ? { ...i, quantity: i.quantity + newItem.quantity }
          : i
      );
    } else {
      updatedItems = [...cart.items, {
        ...newItem,
        id: `item_${Date.now()}`,
        unit_price: price,
        metadata: newItem.metadata || {},
      }];
    }

    setCart({
      ...cart,
      items: updatedItems,
      subtotal: calculateTotal(updatedItems)
    });

    setIsCartOpen(true); // Open cart when adding
  };

  const removeItem = (id: string) => {
    if (!cart) return;
    const updatedItems = cart.items.filter(i => i.id !== id);
    setCart({
      ...cart,
      items: updatedItems,
      subtotal: calculateTotal(updatedItems)
    });
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (!cart) return;
    if (quantity < 1) {
        removeItem(id);
        return;
    }
    const updatedItems = cart.items.map(i => i.id === id ? { ...i, quantity } : i);
    setCart({
        ...cart,
        items: updatedItems,
        subtotal: calculateTotal(updatedItems)
    });
  }

  const toggleCart = () => setIsCartOpen(!isCartOpen);

  const checkout = () => {
    alert("This would redirect to the Medusa Checkout flow.");
  };

  return (
    <StoreContext.Provider value={{ cart, addItem, removeItem, updateQuantity, isCartOpen, toggleCart, checkout }}>
      {children}
    </StoreContext.Provider>
  );
};
