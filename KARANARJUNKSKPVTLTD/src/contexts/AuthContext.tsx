import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type UserRole = 'admin' | 'analyst' | 'retailer' | 'manufacturer' | 'customer';

interface TenantData {
    businessName: string;
    logoUrl?: string;
    location?: string;
    purpose?: string;
    plan?: string;
    planStatus?: string;
    planExpiryAt?: any;
}

export type AppScreen =
    | 'dashboard'
    | 'b2c_dashboard'
    | 'retailers'
    | 'worklist'
    | 'dispatch'
    | 'pos'
    | 'inventory'
    | 'settings'
    | 'manage_retailers'
    | 'admin'
    | 'invoice_settings'
    | 'schema_builder'
    | 'invoice_templates'
    | 'manufacturers'
    | 'order_history'
    | 'online_orders'
    | 'online_dashboard'
    | 'manage_store'
    | 'analytics'
    | 'krishidukan'
    // ── Finance operations (HighRadius-style O2C + S2P) ──
    | 'accounts'
    | 'ar'
    | 'ap'
    | 'cash'
    | 'credit'
    | 'collections'
    | 'disputes'
    | 'promotions'
    | 'contracts'
    | 'finance_analytics';

export type RolePermissions = Record<UserRole, Record<AppScreen, boolean>>;
export const defaultPermissions: RolePermissions = {
    admin: { dashboard: true, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: true, worklist: true, dispatch: true, pos: true, inventory: true, online_orders: true, order_history: true, settings: true, admin: true, manufacturers: true, invoice_templates: true, invoice_settings: true, schema_builder: true, manage_retailers: true, manage_store: true, krishidukan: true, accounts: true, ar: true, ap: true, cash: true, credit: true, collections: true, disputes: true, promotions: true, contracts: true, finance_analytics: true },
    analyst: { dashboard: true, b2c_dashboard: true, online_dashboard: true, analytics: true, retailers: true, worklist: true, dispatch: true, pos: true, inventory: true, online_orders: false, order_history: true, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, accounts: true, ar: true, ap: true, cash: true, credit: true, collections: true, disputes: true, promotions: true, contracts: true, finance_analytics: true },
    retailer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false },
    manufacturer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false },
    customer: { dashboard: false, b2c_dashboard: false, online_dashboard: false, analytics: false, retailers: false, worklist: false, dispatch: false, pos: false, inventory: false, online_orders: false, order_history: false, settings: true, admin: false, manufacturers: false, invoice_templates: false, invoice_settings: false, schema_builder: false, manage_retailers: false, manage_store: false, krishidukan: false, accounts: false, ar: false, ap: false, cash: false, credit: false, collections: false, disputes: false, promotions: false, contracts: false, finance_analytics: false }
};

interface AuthContextType {
    currentUser: User | null;
    userRole: UserRole | null;
    tenantId: string | null;
    tenantData: TenantData | null;
    linkedId: string | null;
    userName: string | null;
    permissions: RolePermissions;
    loading: boolean;
    logout: () => Promise<void>;
    // Module system
    enabledModules: string[];
    tenantPlan: string;
    modulesLoading: boolean;
    hasModule: (moduleId: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
    currentUser: null,
    userRole: null,
    tenantId: null,
    tenantData: null,
    linkedId: null,
    userName: null,
    permissions: defaultPermissions,
    loading: true,
    logout: async () => { },
    enabledModules: [],
    tenantPlan: 'free',
    modulesLoading: true,
    hasModule: () => false,
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [tenantData, setTenantData] = useState<TenantData | null>(null);
    const [linkedId, setLinkedId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<RolePermissions>(defaultPermissions);
    const [loading, setLoading] = useState(true);
    const [enabledModules, setEnabledModules] = useState<string[]>([]);
    const [tenantPlan, setTenantPlan] = useState<string>('free');
    const [modulesLoading, setModulesLoading] = useState(true);

    useEffect(() => {
        let unsubscribePerms: (() => void) | null = null;
        let unsubscribeModules: (() => void) | null = null;

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDoc = await getDoc(userDocRef);
                    const emailLC = user.email?.toLowerCase() || '';
                    
                    const MASTER_ADMIN_EMAILS = [
                        'arjuntanpure@karanarjun.com',
                        'arjutanpure@karanarjun.com',
                        'arjun1829@karanarjun.com',
                        'karanarjun@karanarjun.com',
                        'arjutanpure@gmail.com'
                    ];
                    const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(emailLC);

                    let existingRole = userDoc.exists() ? (userDoc.data().role as UserRole) : null;
                    let existingTenantId = userDoc.exists() ? userDoc.data().tenantId : null;

                    let role: UserRole = isMasterAdmin ? 'admin' : (existingRole || 'analyst');
                    let tId = isMasterAdmin ? (existingTenantId && existingTenantId !== 'master' ? existingTenantId : 'master') : existingTenantId;
                    let lId: string | null = userDoc.exists() ? (userDoc.data().linkedId || null) : null;

                    // Avoid unnecessary writes for master admin if doc already exists
                    if (!userDoc.exists()) {
                        await setDoc(userDocRef, {
                            email: user.email,
                            name: user.displayName || user.email?.split('@')[0] || 'Member',
                            role: role,
                            tenantId: tId,
                            linkedId: lId,
                            updatedAt: serverTimestamp(),
                            createdAt: serverTimestamp()
                        }, { merge: true });
                    }

                    setUserRole(role);
                    setTenantId(tId);
                    setLinkedId(lId);
                    
                    // Priority: Firestore name -> Auth displayName -> Email prefix
                    const resolvedName = userDoc.exists() 
                        ? (userDoc.data().name || user.displayName || user.email?.split('@')[0] || null)
                        : (user.displayName || user.email?.split('@')[0] || null);
                    
                    setUserName(resolvedName);

                    if (tId && tId !== 'master') {
                        const tenantDoc = await getDoc(doc(db, 'tenants', tId));
                        if (tenantDoc.exists()) {
                            setTenantData(tenantDoc.data() as TenantData);
                        }
                    } else if (tId === 'master') {
                        setTenantData({ businessName: 'KaranArjun' });
                    }

                    // Fetch or Initialize Role Permissions
                    if (tId) {
                        try {
                            const [getTenantDoc] = await Promise.all([
                                import('../utils/tenantPath').then(m => m.getTenantDoc)
                            ]);
                            const permDocRef = getTenantDoc(db, tId, 'settings', 'rolePermissions');

                            if (unsubscribePerms) unsubscribePerms();

                            unsubscribePerms = onSnapshot(permDocRef, async (permDoc) => {
                                if (permDoc.exists() && Object.keys(permDoc.data() || {}).length > 0) {
                                    const fetchedPerms = permDoc.data() as RolePermissions;
                                    const mergedPerms: any = { ...defaultPermissions };

                                    for (const [r, pObj] of Object.entries(fetchedPerms)) {
                                        mergedPerms[r] = {
                                            ...(defaultPermissions[r as UserRole] || {}),
                                            ...pObj
                                        };
                                    }
                                    setPermissions(mergedPerms as RolePermissions);
                                } else {
                                    await setDoc(permDocRef, defaultPermissions);
                                    // Snapshot will trigger again automatically after setDoc
                                }
                            }, (_err) => {
                                setPermissions(defaultPermissions);
                            });
                        } catch (permErr) {
                            console.error("Error fetching permissions", permErr);
                            setPermissions(defaultPermissions);
                        }

                        // Subscribe to tenant's purchased modules
                        try {
                            const tenantSnap = await getDoc(doc(db, 'tenants', tId));
                            setTenantPlan(tenantSnap.data()?.plan || 'free');

                            if (unsubscribeModules) unsubscribeModules();
                            const modulesColRef = collection(db, 'tenants', tId, 'modules');
                            unsubscribeModules = onSnapshot(modulesColRef, (snap) => {
                                const now = new Date();
                                const active = snap.docs
                                    .filter(d => {
                                        const data = d.data();
                                        if (!['active', 'cancelled_at_period_end'].includes(data.status)) return false;
                                        if (data.expiresAt && data.expiresAt.toDate() < now) return false;
                                        return true;
                                    })
                                    .map(d => d.id);
                                setEnabledModules(active);
                                setModulesLoading(false);
                            }, (_err) => {
                                // permission-denied on free/unauthenticated tenants — silent fallback
                                setModulesLoading(false);
                            });
                        } catch (modErr) {
                            console.error("Error fetching modules", modErr);
                            setModulesLoading(false);
                        }
                    } else {
                        if (unsubscribePerms) {
                            unsubscribePerms();
                            unsubscribePerms = null;
                        }
                        setModulesLoading(false);
                    }

                } catch (error) {
                    console.error("Error fetching user role:", error);
                    
                    // Fallback to ensure owner never gets locked out
                    const emailLC = user.email?.toLowerCase() || '';
                    const isMasterAdmin = emailLC.includes('arjuntanpure') || emailLC.includes('arjutanpure') || emailLC.includes('arjun1829') || emailLC.includes('karanarjun');
                    
                    setUserRole(isMasterAdmin ? 'admin' : 'analyst');
                    if (isMasterAdmin) {
                        setTenantId('master');
                        setTenantData({ businessName: 'KaranArjun' });
                    } else {
                        setTenantId(null);
                        setTenantData(null);
                    }
                    setPermissions(defaultPermissions);
                }
            } else {
                setUserRole(null);
                setTenantId(null);
                setTenantData(null);
                setLinkedId(null);
                setPermissions(defaultPermissions);
            }
            setCurrentUser(user);
            setLoading(false);
        });

        return () => {
            unsubscribe();
            if (unsubscribePerms) unsubscribePerms();
            if (unsubscribeModules) unsubscribeModules();
        };
    }, []);

    const logout = () => {
        return signOut(auth);
    };

    const hasModule = (moduleId: string): boolean => enabledModules.includes(moduleId);

    const value = {
        currentUser,
        userRole,
        tenantId,
        tenantData,
        linkedId,
        userName,
        permissions,
        loading,
        logout,
        enabledModules,
        tenantPlan,
        modulesLoading,
        hasModule,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
