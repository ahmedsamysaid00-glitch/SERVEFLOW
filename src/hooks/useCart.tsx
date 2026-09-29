import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CustomerMenuItem } from '@/services/customerService';
import type { Branch } from '@/types';

interface CartEntry {
  item: CustomerMenuItem;
  quantity: number;
}

interface CartContextValue {
  cart: Record<string, CartEntry>;
  cartBranch: Branch | null;
  cartCount: number;
  cartList: CartEntry[];
  subtotal: number;
  addToCart: (item: CustomerMenuItem, branch: Branch) => void;
  increment: (itemId: string) => void;
  decrement: (itemId: string) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  setCartBranch: (branch: Branch | null) => void;
  branchMismatch: (branch: Branch) => boolean;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [cartBranch, setCartBranch] = useState<Branch | null>(null);

  const addToCart = useCallback((item: CustomerMenuItem, branch: Branch) => {
    setCartBranch(branch);
    setCart((prev) => {
      const existing = prev[item.id];
      return { ...prev, [item.id]: { item, quantity: (existing?.quantity ?? 0) + 1 } };
    });
  }, []);

  const increment = useCallback((itemId: string) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      return { ...prev, [itemId]: { ...existing, quantity: existing.quantity + 1 } };
    });
  }, []);

  const decrement = useCallback((itemId: string) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...existing, quantity: existing.quantity - 1 } };
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart((prev) => {
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart({});
    setCartBranch(null);
  }, []);

  const setCartBranchSafe = useCallback((branch: Branch | null) => {
    setCartBranch(branch);
  }, []);

  const cartList = Object.values(cart);
  const cartCount = cartList.reduce((sum, e) => sum + e.quantity, 0);
  const subtotal = cartList.reduce((sum, e) => sum + e.item.price * e.quantity, 0);

  const branchMismatch = useCallback((branch: Branch) => {
    return cartBranch !== null && cartBranch.id !== branch.id && cartCount > 0;
  }, [cartBranch, cartCount]);

  return (
    <CartContext.Provider
      value={{
        cart,
        cartBranch,
        cartCount,
        cartList,
        subtotal,
        addToCart,
        increment,
        decrement,
        removeFromCart,
        clearCart,
        setCartBranch: setCartBranchSafe,
        branchMismatch,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
