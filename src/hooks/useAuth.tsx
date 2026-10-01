
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/supabase/client';

import type {
  Profile,
  RestaurantMember,
  Restaurant,
  Branch,
} from '@/types';

import type { CustomerIdentity } from '@/services/customerService';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  membership: RestaurantMember | null;
  restaurant: Restaurant | null;
  branch: Branch | null;
  customer: CustomerIdentity | null;
  isSuperAdmin: boolean;
  isApprovedOwner: boolean;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<{ error: string | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] =
    useState<RestaurantMember | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [customer, setCustomer] = useState<CustomerIdentity | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isApprovedOwner, setIsApprovedOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadContext(s: Session | null) {
    setLoading(true);
    setSession(s);
    setUser(s?.user ?? null);

    if (!s?.user) {
      setProfile(null);
      setMembership(null);
      setRestaurant(null);
      setBranch(null);
      setCustomer(null);
      setIsSuperAdmin(false);
      setIsApprovedOwner(false);
      setLoading(false);
      return;
    }

    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', s.user.id)
        .maybeSingle();

      setProfile(prof as Profile | null);

      const { data: member } = await supabase
        .from('restaurant_members')
        .select('*')
        .eq('user_id', s.user.id)
        .eq('status', 'active')
        .maybeSingle();

      setMembership(member as RestaurantMember | null);

      if (member) {
        const { data: rest } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', member.restaurant_id)
          .maybeSingle();

        setRestaurant(rest as Restaurant | null);

        if (member.branch_id) {
          const { data: br } = await supabase
            .from('branches')
            .select('*')
            .eq('id', member.branch_id)
            .maybeSingle();

          setBranch(br as Branch | null);
        } else {
          setBranch(null);
        }
      } else {
        setRestaurant(null);
        setBranch(null);
      }

      // Check for an existing customer account.
      // Do not automatically create customer accounts here.
      if (!member) {
        const { data: { user: currentUser } } =
          await supabase.auth.getUser();

        if (currentUser) {
          const { data: cust } = await supabase
            .from('customers')
            .select('id, restaurant_id, full_name, phone, email, status')
            .eq('user_id', currentUser.id)
            .eq('status', 'active')
            .maybeSingle();

          setCustomer(cust as CustomerIdentity | null);
        } else {
          setCustomer(null);
        }
      } else {
        setCustomer(null);
      }

      // Check whether this email has an approved owner request.
      const { data: ownerApproved, error: ownerApprovalError } =
        await supabase.rpc('is_owner_email_approved', {
          p_email: s.user.email ?? '',
        });

      setIsApprovedOwner(
        !ownerApprovalError && ownerApproved === true
      );

      // Check super admin status.
      const isDesignatedSuperAdmin =
        (s.user.email ?? '').trim().toLowerCase() ===
        'ahmedsamysaid00@gmail.com';

      const { data: adminResult } =
        await supabase.rpc('is_super_admin');

      setIsSuperAdmin(
        adminResult === true || isDesignatedSuperAdmin
      );
    } catch (error) {
      console.error('Failed to load authentication context:', error);
      setIsApprovedOwner(false);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    await loadContext(data.session);
  }

  useEffect(() => {
    let mounted = true;
    let initialized = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION' && !initialized) {
        return;
      }

      if (mounted) {
        void loadContext(s);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      initialized = true;
      void loadContext(data.session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    fullName?: string
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    return { error: error?.message ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setProfile(null);
    setMembership(null);
    setRestaurant(null);
    setBranch(null);
    setCustomer(null);
    setIsSuperAdmin(false);
    setIsApprovedOwner(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        membership,
        restaurant,
        branch,
        customer,
        isSuperAdmin,
        isApprovedOwner,
        loading,
        signUp,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return ctx;
}