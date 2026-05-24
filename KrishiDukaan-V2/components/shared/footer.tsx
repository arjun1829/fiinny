"use client";

import { ICONS } from '../../app/constants';
import { useI18n } from '../../app/i18n/I18nContext';

type FooterProps = {
  onNavigate?: (view: 'home' | 'market' | 'hub' | 'map' | 'about') => void;
  onCategoryClick?: (categoryId: string) => void;
};

export default function Footer({ onNavigate, onCategoryClick }: FooterProps) {
  const { t } = useI18n();
  const shopLinks = [
    { label: t('catPesticides'), cat: 'pesticides' },
    { label: t('catFertilizers'), cat: 'fertilizers' },
    { label: t('catBioStimulants'), cat: 'fertilizers' },
    { label: t('footerSprayersTools'), cat: 'tools' },
    { label: t('catSeeds'), cat: 'seeds' },
    { label: t('footerViewAllProducts'), cat: 'all' },
  ];
  const companyLinks: { label: string; view: 'home' | 'market' | 'hub' | 'map' | 'about' }[] = [
    { label: t('footerAbout'), view: 'about' },
    { label: t('footerStores'), view: 'map' },
    { label: t('footerCropHubs'), view: 'hub' },
    { label: t('footerBecomeRetailer'), view: 'hub' },
    { label: t('footerContact'), view: 'about' },
    { label: t('footerFAQs'), view: 'about' },
  ];
  return (
    <footer className="bg-surface-container-low border-t border-surface-container mt-16">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-10 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4 group cursor-pointer" onClick={() => onNavigate?.('home')}>
              <img 
                src="/images/krishidukan icon.webp" 
                alt="Logo" 
                className="w-10 h-10 object-contain"
              />
              <h3 className="text-2xl font-black text-primary tracking-tight">
                Krishi<span className="text-secondary">Dukan</span>
              </h3>
            </div>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-4">
              {t('footerTagline')}
            </p>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <ICONS.Trust className="w-4 h-4 text-primary" />
              <span className="font-semibold">{t('footerGenuine')}</span>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-sm font-black text-on-surface uppercase tracking-wider mb-4">
              {t('footerShop')}
            </h4>
            <ul className="space-y-2 text-sm">
              {shopLinks.map((c) => (
                <li key={c.label}>
                  <button
                    onClick={() => onCategoryClick?.(c.cat)}
                    className="text-on-surface-variant hover:text-primary transition-colors font-medium"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Useful links */}
          <div>
            <h4 className="text-sm font-black text-on-surface uppercase tracking-wider mb-4">
              {t('footerCompany')}
            </h4>
            <ul className="space-y-2 text-sm">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <button
                    onClick={() => onNavigate?.(l.view)}
                    className="text-on-surface-variant hover:text-primary transition-colors font-medium"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact + app */}
          <div>
            <h4 className="text-sm font-black text-on-surface uppercase tracking-wider mb-4">
              {t('footerGetInTouch')}
            </h4>
            <div className="space-y-2 text-sm text-on-surface-variant">
              <p className="font-semibold text-on-surface">Karan Arjun Krushi Seva Kendra</p>
              <p>Chatrapati Shivaji Nagar, 132 KV</p>
              <p>Karjat, Ahilyanagar — 414402</p>
              <a href="tel:9307199040" className="block font-bold text-primary hover:underline">
                +91 93071 99040
              </a>
            </div>
            <div className="mt-5">
              <p className="text-[11px] font-black uppercase tracking-wider text-outline mb-2">
                {t('footerMobileApp')}
              </p>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold bg-on-surface text-white px-2.5 py-1.5 rounded-lg opacity-70">
                  {t('footerAndroidSoon')}
                </span>
                <span className="text-[10px] font-bold bg-on-surface text-white px-2.5 py-1.5 rounded-lg opacity-70">
                  {t('footerIosSoon')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-surface-container flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-outline">
          <p>© {new Date().getFullYear()} KrishiDukan. {t('footerRights')}</p>
          <div className="flex gap-4">
            <button className="hover:text-on-surface transition-colors font-semibold">{t('footerPrivacy')}</button>
            <button className="hover:text-on-surface transition-colors font-semibold">{t('footerTerms')}</button>
            <button className="hover:text-on-surface transition-colors font-semibold">{t('footerCookies')}</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
