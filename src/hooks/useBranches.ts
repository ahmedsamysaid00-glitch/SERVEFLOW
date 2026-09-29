import { useEffect, useState } from 'react';
import { supabase } from '@/supabase/client';
import { useAuth } from './useAuth';
import type { Branch } from '@/types';

export function useBranches() {
  const { restaurant } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) {
      setBranches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('branches')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('name')
      .then(({ data }) => {
        setBranches((data as Branch[]) ?? []);
        setLoading(false);
      });
  }, [restaurant]);

  return { branches, loading };
}
