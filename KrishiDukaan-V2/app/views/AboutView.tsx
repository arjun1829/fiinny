import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ICONS } from '../constants';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n/I18nContext';
import { fetchAboutContent, sendSupportMessage } from '../firebase';
import type { AboutPageContent } from '../firebase';
import { AboutPartnersSection, AboutPresenceSection } from '../components/AboutNetworkSections';
import { PLAY_STORE_URL, APP_STORE_URL, androidLive, iosLive } from '../lib/store-links';
import { COMPANY } from '../lib/legal-constants';
import { LogIn, HeadphonesIcon } from 'lucide-react';

interface Props {
  user?: any | null;
  userName?: string;
  userEmail?: string;
  onNavigate?: (view: string) => void;
}

export default function AboutView({ user, userName, userEmail, onNavigate }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Admin > About page (siteContent/about). Optional enhancement: both
  // blocks stay hidden until it loads, and if it fails the page is unchanged.
  const [content, setContent] = useState<AboutPageContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAboutContent()
      .then(c => { if (!cancelled) setContent(c); })
      .catch(err => console.warn('Failed to load About page content:', err));
    return () => { cancelled = true; };
  }, []);

  // Pre-fill name from profile when user loads
  useEffect(() => {
    if (userName) setName(userName);
  }, [userName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !message.trim()) {
      setStatus('error');
      setErrorMessage('Please fill in all fields.');
      return;
    }
    setStatus('sending');
    setErrorMessage('');
    try {
      await sendSupportMessage(user.uid, user.uid, 'user', message, {
        userName: name.trim(),
        userEmail: userEmail || undefined,
      });
      setStatus('success');
      setMessage('');
    } catch (error) {
      console.error('[about] sendSupportMessage error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong.');
    }
  };

  const stats = [
    { value: '2,800+', label: t('aboutStatUsers') },
    { value: '275+', label: t('aboutStatRetailers') },
    { value: '35+', label: t('aboutStatManufacturers') },
    { value: '145+', label: t('aboutStatProducts') }
  ];

  const values = [
    {
      icon: ICONS.Trust,
      title: t('aboutValueLocalTrustTitle'),
      desc: t('aboutValueLocalTrustDesc')
    },
    {
      icon: ICONS.Efficiency,
      title: t('aboutValueDigitalEfficiencyTitle'),
      desc: t('aboutValueDigitalEfficiencyDesc')
    },
    {
      icon: ICONS.Sprout,
      title: t('aboutValueFarmerFirstTitle'),
      desc: t('aboutValueFarmerFirstDesc')
    },
    {
      icon: ICONS.Science,
      title: t('aboutValueQualityAssuredTitle'),
      desc: t('aboutValueQualityAssuredDesc')
    }
  ];

  return (
    <div className="flex flex-col gap-0">
      {/* Hero */}
      <section className="relative bg-primary overflow-hidden min-h-[360px] flex items-center">
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcJewaf8J1gWZEdY6ipzy3p0M5aZoePmxCri9BSh7nbzy4FW-i7Azi-fBl6G0vr9TDZY9Q0XxD_GHq2_mJECmXU0oGsqJSZEnh1-5IRtoFi-mxGzKT9SHQH5HJW6wrhRD4Z98Wjo19TKEXGiIpyPXcFVZVvSuhCD9bXXV1kQRL_o0HNQ6-7KIySLLVdAddKSxPd14-jD0W8uG58KaJpjHYahRINJqJMRzG_CvOOiM2CGpIBu5yKjDn4P8gspnpRXThlkMm_JgsHX0L"
            className="w-full h-full object-cover"
            alt=""
          />
        </div>
        <div className="relative z-10 px-4 md:px-10 max-w-7xl mx-auto w-full py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className="text-primary-container text-xs font-black uppercase tracking-widest mb-4 block">{t('aboutStoryLabel')}</span>
            <h1 className="text-white text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6 max-w-2xl">
              {t('aboutHeroTitleLine1')}<br />{t('aboutHeroTitleLine2')}
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-xl leading-relaxed">
              {t('aboutHeroSubtitle')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-surface-container">
        <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-extrabold text-primary mb-1">{stat.value}</div>
                <div className="text-on-surface-variant font-semibold text-sm uppercase tracking-widest">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {content?.partnersEnabled && content.partners.length > 0 && (
        <AboutPartnersSection
          label={t('aboutPartnersLabel')}
          title={content.partnersTitle || t('aboutPartnersTitle')}
          subtitle={content.partnersSubtitle}
          partners={content.partners}
          centerLogoUrl={content.centerLogoUrl}
        />
      )}

      {/* Mission */}
      <section className="px-4 md:px-10 max-w-7xl mx-auto w-full py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-primary text-xs font-black uppercase tracking-widest mb-3 block">{t('aboutMissionLabel')}</span>
            <h2 className="text-4xl font-bold text-on-surface mb-6 leading-tight">
              {t('aboutMissionTitle')}
            </h2>
            <p className="text-on-surface-variant text-lg leading-relaxed mb-6">
              {t('aboutMissionParagraph1')}
            </p>
            <p className="text-on-surface-variant text-lg leading-relaxed">
              {t('aboutMissionParagraph2')}
            </p>
          </div>
          <div className="rounded-3xl overflow-hidden shadow-ambient border border-surface-container h-80 md:h-auto">
            <img
              loading="lazy"
              decoding="async"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcJewaf8J1gWZEdY6ipzy3p0M5aZoePmxCri9BSh7nbzy4FW-i7Azi-fBl6G0vr9TDZY9Q0XxD_GHq2_mJECmXU0oGsqJSZEnh1-5IRtoFi-mxGzKT9SHQH5HJW6wrhRD4Z98Wjo19TKEXGiIpyPXcFVZVvSuhCD9bXXV1kQRL_o0HNQ6-7KIySLLVdAddKSxPd14-jD0W8uG58KaJpjHYahRINJqJMRzG_CvOOiM2CGpIBu5yKjDn4P8gspnpRXThlkMm_JgsHX0L"
              alt={t('aboutMissionImageAlt')}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {content?.presenceEnabled && (
        <AboutPresenceSection
          label={t('aboutPresenceLabel')}
          title={content.presenceTitle || t('aboutPresenceTitle')}
          subtitle={content.presenceSubtitle}
          mapLabel={t('aboutPresenceImageAlt')}
        />
      )}

      {/* Values */}
      <section className="bg-surface-container-low border-y border-surface-container py-16">
        <div className="px-4 md:px-10 max-w-7xl mx-auto w-full">
          <div className="text-center mb-12">
            <span className="text-primary text-xs font-black uppercase tracking-widest mb-3 block">{t('aboutValuesLabel')}</span>
            <h2 className="text-4xl font-bold text-on-surface">{t('aboutValuesTitle')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {values.map((val, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-3xl p-8 shadow-sm border border-surface-container flex gap-6"
              >
                <div className="bg-primary-container text-white p-4 rounded-2xl shadow-sm h-fit shrink-0">
                  <val.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-on-surface mb-3">{val.title}</h3>
                  <p className="text-on-surface-variant leading-relaxed">{val.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Get the app */}
      <section id="app" className="bg-white py-16 border-b border-surface-container">
        <div className="px-4 md:px-10 max-w-7xl mx-auto w-full">
          <div className="rounded-3xl bg-surface-container-low border border-surface-container p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 md:gap-12">
            <img
              src="/images/krishidukan icon.webp"
              alt="KrishiDukan app icon"
              className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border border-surface-container object-contain bg-white shadow-sm shrink-0"
            />
            <div className="text-center md:text-left flex-1">
              <span className="text-primary text-xs font-black uppercase tracking-widest mb-3 block">
                {t('aboutAppLabel')}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-3 leading-tight">
                {t('aboutAppTitle')}
              </h2>
              <p className="text-on-surface-variant text-base leading-relaxed mb-6 max-w-xl">
                {t('aboutAppSubtitle')}
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                {androidLive ? (
                  <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Get KrishiDukan on Google Play">
                    <img src="/images/google-play-badge.png" alt="Get it on Google Play" className="h-14 w-auto" />
                  </a>
                ) : null}
                {iosLive ? (
                  <a href={APP_STORE_URL!} target="_blank" rel="noopener noreferrer" aria-label="Download KrishiDukan on the App Store">
                    <img src="/images/app-store-badge.svg" alt="Download on the App Store" className="h-12 w-auto" />
                  </a>
                ) : (
                  <div className="flex items-center gap-2 h-12 px-4 rounded-xl bg-on-surface/10 text-on-surface-variant text-sm font-bold cursor-not-allowed select-none" title="Coming soon to the App Store">
                    {t('footerIosSoon')}
                  </div>
                )}
              </div>
              <Link href="/app" className="mt-4 inline-block text-sm font-bold text-primary hover:underline">
                {t('footerViewAppPage')} →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-primary py-16">
        <div className="px-4 md:px-10 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-primary-container text-xs font-black uppercase tracking-widest mb-3 block">{t('aboutContactLabel')}</span>
              <h2 className="text-4xl font-bold text-white mb-6 leading-tight">{t('aboutContactTitle')}</h2>
              <p className="text-white/80 text-lg leading-relaxed mb-8">
                {t('aboutContactSubtitle')}
              </p>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <ICONS.Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-white/60 mb-0.5">{t('aboutContactPhoneLabel')}</div>
                    <a href="tel:+918658032751" className="font-bold hover:underline">
                      +91 86580 32751
                    </a>
                    <a
                      href="tel:+918658032751"
                      className="mt-1 inline-flex text-xs font-black uppercase tracking-widest text-white/80 hover:text-white"
                    >
                      {t('aboutContactCallLabel')}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <ICONS.Chat className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-white/60 mb-0.5">{t('aboutContactEmailLabel')}</div>
                    <div className="flex flex-col gap-0.5">
                      <a href="mailto:arjun.tanpure@fiinny.com" className="font-bold hover:underline">
                        Founder: arjun.tanpure@fiinny.com
                      </a>
                      <a href={`mailto:${COMPANY.supportEmail}`} className="font-bold hover:underline">
                        Support: {COMPANY.supportEmail}
                      </a>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <ICONS.Location className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-white/60 mb-0.5">{t('aboutContactOfficeLabel')}</div>
                    <div className="font-bold">{t('aboutContactOfficeValue')}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Message form — auth-gated */}
            <div className="bg-white rounded-3xl p-8 shadow-2xl">
              <h3 className="text-xl font-bold text-on-surface mb-2">{t('aboutContactFormTitle')}</h3>

              {!user ? (
                /* Unauthenticated state */
                <div className="flex flex-col items-center gap-5 py-6 text-center">
                  <div className="rounded-full bg-primary/5 p-4">
                    <HeadphonesIcon className="h-8 w-8 text-primary/60" />
                  </div>
                  <div>
                    <p className="font-semibold text-on-surface mb-1">Log in to contact support</p>
                    <p className="text-sm text-on-surface-variant">
                      Please sign in to send a message. Your conversation will be saved so you can follow up anytime.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('login')}
                    className="flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    <LogIn className="w-4 h-4" /> Log in to continue
                  </button>
                </div>
              ) : status === 'success' ? (
                /* Success state */
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <div className="rounded-full bg-emerald-50 p-4">
                    <ICONS.Trust className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-700 mb-1">Message sent successfully!</p>
                    <p className="text-sm text-on-surface-variant">
                      You can continue the conversation from your Profile → Support Inbox.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setStatus('idle');
                        setMessage('');
                      }}
                      className="text-sm font-semibold text-on-surface-variant border border-outline-variant px-4 py-2 rounded-xl hover:bg-surface-container transition-colors"
                    >
                      Send another
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('support')}
                      className="text-sm font-bold text-white bg-primary px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                    >
                      <HeadphonesIcon className="w-3.5 h-3.5" /> Open Support Inbox
                    </button>
                  </div>
                </div>
              ) : (
                /* Authenticated form */
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Your name</label>
                    <input
                      type="text"
                      required
                      disabled={status === 'sending'}
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Message</label>
                    <textarea
                      required
                      disabled={status === 'sending'}
                      placeholder={t('aboutContactMessagePlaceholder')}
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
                    />
                  </div>

                  {status === 'error' && (
                    <div className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                      {errorMessage || t('aboutContactError')}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <ICONS.ArrowRight className="w-4 h-4" />
                    {status === 'sending' ? t('aboutContactSending') : t('aboutContactSendLabel')}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
