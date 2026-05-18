'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ICONS } from '../../app/constants';
import { auth, getUserProfile } from '../../app/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../app/i18n/I18nContext';
import { MarketplaceProduct } from '../../types/product';
import { reverseGeocodeToDisplay } from '../../app/utils/geolocation';
import { HelperIcon } from '../helpers';

type View = 'home' | 'market' | 'hub' | 'product' | 'map' | 'about' | 'profile' | 'login' | 'signup' | 'subscription' | 'cart';

interface NavbarProps {
  currentView?: View;
  onNavigate?: (view: View) => void;
  productSearch?: string;
  setProductSearch?: (search: string) => void;
  isDashboard?: boolean;
  locationQuery?: string;
  onLocationChange?: (location: string, coordinates?: { lat: number, lng: number }) => void;
  externalUser?: any;
  externalUserRole?: string;
  externalUserProfile?: { isPaid?: boolean };
  allProducts?: MarketplaceProduct[];
  allStores?: any[];
  onProductClick?: (id: string) => void;
  onStoreClick?: (id: string) => void;
  cartCount?: number;
  onCartClick?: () => void;
}

export function Navbar({
  currentView,
  onNavigate,
  productSearch = '',
  setProductSearch,
  isDashboard = false,
  locationQuery = 'Pune, Maharashtra',
  onLocationChange,
  externalUser,
  externalUserRole,
  externalUserProfile,
  allProducts = [],
  allStores = [],
  onProductClick,
  onStoreClick,
  cartCount = 0,
  onCartClick,
}: NavbarProps) {
  const router = useRouter();
  const [localUser, setLocalUser] = useState<any>(null);
  const [localUserRole, setLocalUserRole] = useState<string>('customer');
  const [localUserProfile, setLocalUserProfile] = useState<any>({ isPaid: false });

  const user = externalUser !== undefined ? externalUser : localUser;
  const userRole = externalUserRole !== undefined ? externalUserRole : localUserRole;
  const userProfile = externalUserProfile !== undefined ? externalUserProfile : localUserProfile;
  const { language, setLanguage, t } = useI18n();
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  const fetchLocation = async () => {
    if (!navigator.geolocation) {
      if (onLocationChange) onLocationChange('Geolocation not supported');
      return;
    }

    setIsFetchingLocation(true);
    if (onLocationChange) onLocationChange('Locating...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const coords = { lat: latitude, lng: longitude };

        try {
          const label = await reverseGeocodeToDisplay(
            latitude,
            longitude,
            process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          );
          if (onLocationChange) onLocationChange(label, coords);
        } catch {
          const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          if (onLocationChange) onLocationChange(label, coords);
        } finally {
          setIsFetchingLocation(false);
        }
      },
      (error) => {
        if (onLocationChange) onLocationChange('Location access denied');
        setIsFetchingLocation(false);
      }
    );
  };

  useEffect(() => {
    if (isDashboard) return;
    const shouldAutoLocate =
      locationQuery === 'Pune, Maharashtra' ||
      locationQuery === 'Address not found' ||
      locationQuery === 'Error fetching address';

    if (shouldAutoLocate) {
      void fetchLocation();
    }
  }, [locationQuery, isDashboard]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setLocalUser(firebaseUser);
        const profileData = await getUserProfile(firebaseUser.uid);
        if (profileData) {
          setLocalUserRole(profileData.role);
          setLocalUserProfile({ isPaid: profileData.isPaid || false });
        }
      } else {
        setLocalUser(null);
        setLocalUserRole('customer');
        setLocalUserProfile({ isPaid: false });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      // Close search results if clicking outside both search bars
      const inDesktop = desktopSearchRef.current?.contains(event.target as Node);
      const inMobile = mobileSearchRef.current?.contains(event.target as Node);
      if (!inDesktop && !inMobile) {
        setShowResults(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false);
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const searchResults = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (query.length < 2) return { products: [], stores: [] };

    const products = allProducts
      .filter(p =>
        p.name.toLowerCase().includes(query) ||
        (p.fullName && p.fullName.toLowerCase().includes(query)) ||
        p.category.toLowerCase().includes(query) ||
        p.store.toLowerCase().includes(query)
      )
      .slice(0, 5);

    const stores = allStores
      .filter(s => {
        const searchable = [
          s.name || '',
          s.shopName || '',
          s.ownerName || '',
          s.address || '',
          ...(Array.isArray(s.stock) ? s.stock : [])
        ].join(' ').toLowerCase();
        return searchable.includes(query);
      })
      .slice(0, 3);

    return { products, stores };
  }, [productSearch, allProducts, allStores]);

  const hasResults = searchResults.products.length > 0 || searchResults.stores.length > 0;
  const shouldShowDropdown = showResults && productSearch.trim().length >= 2 && hasResults;

  const handleResultClick = (action: () => void) => {
    if (setProductSearch) setProductSearch('');
    setShowResults(false);
    action();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (onNavigate) {
        onNavigate('home');
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navigate = (view: View) => {
    if (onNavigate) {
      onNavigate(view);
    } else {
      router.push('/');
    }
  };

  const navItems = [
    { id: 'home', label: t('home') },
    { id: 'market', label: t('market') },
    { id: 'hub', label: t('hub') },
    { id: 'map', label: t('stores') }
  ];
  const canAccessDashboard = (userRole === 'retailer' || userRole === 'manufacturer') && userProfile.isPaid && !isDashboard;
  const isAdmin = userRole === 'admin';

  const SearchDropdown = () => (
    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-ambient border border-surface-container z-[100] overflow-hidden max-h-[70vh] overflow-y-auto">
      {searchResults.products.length > 0 && (
        <div>
          <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Products</span>
          </div>
          {searchResults.products.map(p => (
            <button
              key={p.id}
              onMouseDown={() => handleResultClick(() => onProductClick?.(p.id))}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-surface-container-low border border-surface-container">
                <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-on-surface truncate">{p.name}</p>
                <p className="text-[10px] text-on-surface-variant capitalize">{p.category} · ₹{p.price}</p>
              </div>
              <ICONS.ChevronRight className="w-3.5 h-3.5 text-outline shrink-0" />
            </button>
          ))}
          <button
            onMouseDown={() => { setShowResults(false); navigate('market'); }}
            className="w-full text-left px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/5 border-t border-surface-container flex items-center justify-between"
          >
            <span>See all products in Market</span>
            <ICONS.ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {searchResults.stores.length > 0 && (
        <div className={searchResults.products.length > 0 ? 'border-t border-surface-container' : ''}>
          <div className="px-4 pt-3 pb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Stores</span>
          </div>
          {searchResults.stores.map(s => (
            <button
              key={s.id}
              onMouseDown={() => handleResultClick(() => onStoreClick?.(s.id))}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 shrink-0 flex items-center justify-center">
                <ICONS.Market className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-on-surface truncate">{s.name || s.shopName || s.ownerName}</p>
                <p className="text-[10px] text-on-surface-variant">{s.distance} · {(s.status || 'Active').split('•')[0].trim()}</p>
              </div>
              <ICONS.ChevronRight className="w-3.5 h-3.5 text-outline shrink-0" />
            </button>
          ))}
          <button
            onMouseDown={() => { setShowResults(false); navigate('map'); }}
            className="w-full text-left px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/5 border-t border-surface-container flex items-center justify-between"
          >
            <span>See all stores on Map</span>
            <ICONS.ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <header className="sticky top-0 z-[60] bg-white/80 backdrop-blur-md border-b border-surface-container shadow-sm px-4 md:px-6 py-2 transition-colors">
      <div className="flex justify-between items-center gap-4">
        <div
          className="flex items-center gap-2 tracking-tight cursor-pointer hover:scale-[1.02] transition-transform shrink-0 group"
          onClick={() => navigate('home')}
        >
          <img 
            src="/images/krishidukan icon.webp" 
            alt="KrishiDukan Logo" 
            className="w-8 h-8 md:w-10 md:h-10 object-contain"
          />
          <span className="font-black text-xl md:text-2xl text-primary group-hover:text-primary/90 transition-colors">
            Krishi<span className="text-secondary">Dukan</span>
          </span>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              data-tour-nav={item.id}
              onClick={() => navigate(item.id as View)}
              className={`text-xs font-semibold transition-colors hover:text-primary whitespace-nowrap ${
                currentView === item.id ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              {item.label}
              {currentView === item.id && (
                <motion.div layoutId="activeTab" className="h-0.5 bg-primary mt-0.5 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Desktop Product Search Bar */}
          {!isDashboard && setProductSearch && (
            <div 
              ref={desktopSearchRef} 
              data-tour="search"
              className="hidden md:block relative flex-1 max-w-sm"
            >
              <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden shadow-sm group focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                <ICONS.Search className="w-4 h-4 text-outline group-focus-within:text-primary transition-colors shrink-0 ml-3" />
                <input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  onFocus={() => setShowResults(true)}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-xs text-on-surface px-2 py-2 placeholder-on-surface-variant font-medium"
                />
                {productSearch ? (
                  <button
                    onMouseDown={() => { setProductSearch(''); setShowResults(false); }}
                    className="mr-2 text-outline hover:text-on-surface transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                ) : (
                  <HelperIcon
                    size="xs"
                    variant="ghost"
                    side="bottom"
                    textKey="searchBar"
                    ariaLabel="Search help"
                    className="mr-2"
                  />
                )}
              </div>
              {shouldShowDropdown && <SearchDropdown />}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Cart icon (placeholder) */}
          <button
            onClick={() => {
              if (onCartClick) onCartClick();
              else navigate('cart');
            }}
            className="relative p-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant transition-colors text-on-surface"
            aria-label="Cart"
            title="Cart"
          >
            <ICONS.Cart className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 bg-secondary text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
              {Math.min(99, cartCount)}
            </span>
          </button>

          {/* Current Location Display */}
          <div
            data-tour="location"
            onClick={fetchLocation}
            className={`hidden md:flex items-center bg-surface-container-low border border-outline-variant rounded-2xl shadow-sm px-2 py-1.5 gap-1.5 cursor-pointer hover:bg-surface-container transition-colors group ${isFetchingLocation ? 'opacity-70' : ''}`}
            title="Click to refresh location"
          >
            <ICONS.Location className={`w-3.5 h-3.5 text-primary shrink-0 ${isFetchingLocation ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
            <span className="text-xs text-on-surface font-semibold truncate max-w-[120px] md:max-w-[220px]" title={locationQuery}>
              {locationQuery}
            </span>
            <HelperIcon
              size="xs"
              variant="ghost"
              side="bottom"
              textKey="location"
              ariaLabel="Location help"
            />
          </div>

          <button
            className={`p-1.5 hover:bg-surface-container rounded-full transition-colors text-primary md:hidden ${isFetchingLocation ? 'animate-pulse' : ''}`}
            onClick={fetchLocation}
            title="Detect current location"
          >
            <ICONS.Location className="w-5 h-5" />
          </button>

          <div className="relative" ref={accountMenuRef}>
            <button
              className="inline-flex items-center gap-1.5 bg-surface-container-high text-on-surface text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-surface-container-highest transition-all"
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
            >
              {t('account')}
              <ICONS.ChevronRight className="w-3.5 h-3.5 rotate-90" />
            </button>

            <div className={`absolute right-0 top-full mt-2 z-50 w-52 bg-white border border-surface-container rounded-2xl shadow-ambient p-2 ${isAccountMenuOpen ? 'block' : 'hidden'}`}>
              <div className="px-2 py-1.5 border-b border-surface-container mb-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t('language')}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className="mt-1 w-full bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1.5 text-xs font-semibold text-on-surface focus:ring-0"
                  aria-label="Select language"
                >
                  <option value="en">English</option>
                  <option value="mr">मराठी</option>
                  <option value="hi">हिंदी</option>
                </select>
              </div>

              {user ? (
                <>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        router.push('/admin');
                      }}
                      className="w-full text-left px-2.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      Admin Panel
                    </button>
                  )}
                  {canAccessDashboard && (
                    <button
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        router.push('/dashboard');
                      }}
                      className="w-full text-left px-2.5 py-2 text-xs font-bold text-on-surface hover:bg-surface-container-low rounded-lg transition-colors"
                    >
                      {t('dashboard')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      navigate('profile');
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs font-bold text-on-surface hover:bg-surface-container-low rounded-lg transition-colors"
                  >
                    {t('profile')}
                  </button>
                  <button
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  >
                    {t('logout')}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    navigate('login');
                  }}
                  className="w-full text-left px-2.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
                >
                  {t('login')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isDashboard && setProductSearch && (
        <div 
          ref={mobileSearchRef} 
          data-tour="search-mobile"
          className="md:hidden mt-2 relative"
        >
          <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden shadow-sm group focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <ICONS.Search className="w-4 h-4 text-outline group-focus-within:text-primary transition-colors shrink-0 ml-3" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              onFocus={() => setShowResults(true)}
              className="w-full bg-transparent border-none focus:ring-0 text-xs text-on-surface px-2 py-2.5 placeholder-on-surface-variant font-medium"
            />
            {productSearch ? (
              <button
                onMouseDown={() => { setProductSearch(''); setShowResults(false); }}
                className="mr-2 text-outline hover:text-on-surface transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            ) : (
              <HelperIcon
                size="xs"
                variant="ghost"
                side="bottom"
                textKey="searchBar"
                ariaLabel="Search help"
                className="mr-2"
              />
            )}
          </div>
          {shouldShowDropdown && <SearchDropdown />}
        </div>
      )}
    </header>
  );
}
