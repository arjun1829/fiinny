import { useState } from 'react';
import { ICONS } from '../constants';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n/I18nContext';
import { saveContactMessage } from '../firebase';

export default function AboutView() {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus('error');
      setErrorMessage('Please fill in all fields.');
      return;
    }
    setStatus('sending');
    setErrorMessage('');
    try {
      await saveContactMessage(name, email, message);
      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong.');
    }
  };
  const stats = [
    { value: '500+', label: t('aboutStatLocalStores') },
    { value: '10K+', label: t('aboutStatFarmersServed') },
    { value: '25+', label: t('aboutStatDistrictsCovered') },
    { value: '98%', label: t('aboutStatSatisfactionRate') }
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
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcJewaf8J1gWZEdY6ipzy3p0M5aZoePmxCri9BSh7nbzy4FW-i7Azi-fBl6G0vr9TDZY9Q0XxD_GHq2_mJECmXU0oGsqJSZEnh1-5IRtoFi-mxGzKT9SHQH5HJW6wrhRD4Z98Wjo19TKEXGiIpyPXcFVZVvSuhCD9bXXV1kQRL_o0HNQ6-7KIySLLVdAddKSxPd14-jD0W8uG58KaJpjHYahRINJqJMRzG_CvOOiM2CGpIBu5yKjDn4P8gspnpRXThlkMm_JgsHX0L"
              alt={t('aboutMissionImageAlt')}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

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
                    <div className="font-bold">arjun.tanpure@fiinny.com</div>
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

            <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-8 shadow-2xl">
              <h3 className="text-xl font-bold text-on-surface mb-6">{t('aboutContactFormTitle')}</h3>
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  required
                  disabled={status === 'sending'}
                  placeholder={t('aboutContactNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                <input
                  type="email"
                  required
                  disabled={status === 'sending'}
                  placeholder={t('aboutContactEmailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                <textarea
                  required
                  disabled={status === 'sending'}
                  placeholder={t('aboutContactMessagePlaceholder')}
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
                />

                {status === 'success' && (
                  <div className="text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    {t('aboutContactSuccess')}
                  </div>
                )}

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
                  <ICONS.ArrowRight className="w-4 h-4" /> {status === 'sending' ? t('aboutContactSending') : t('aboutContactSendLabel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
