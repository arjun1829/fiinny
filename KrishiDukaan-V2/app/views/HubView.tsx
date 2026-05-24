'use client';

import { useState, useEffect, useMemo } from 'react';
import { ICONS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchHubs, Hub } from '../firebase';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { useI18n } from '../i18n/I18nContext';
import { generateHubPDF } from '../utils/pdf-generator';
import { INITIAL_HUBS } from '../initialHubs';

interface HubViewProps {
  searchQuery?: string;
  initialHubId?: string | null;
  onSearchProduct?: (query: string) => void;
  onCategoryClick?: (category: string) => void;
}

export default function HubView({ 
  searchQuery = '', 
  initialHubId = null,
  onSearchProduct,
  onCategoryClick
}: HubViewProps) {
  const { t: _t } = useI18n();
  const t = (key: string, params?: Record<string, string | number>) => _t(key as any, params); // new hub keys not yet in i18n type
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHubs = async () => {
      try {
        const fetchedHubs = await fetchHubs();
        let finalHubs = [];
        if (fetchedHubs && fetchedHubs.length > 0) {
          finalHubs = fetchedHubs;
        } else {
          finalHubs = INITIAL_HUBS;
        }
        setHubs(finalHubs);

        if (initialHubId) {
          const found = finalHubs.find(h => h.id === initialHubId);
          if (found) {
            setSelectedHub(found);
          } else {
            setSelectedHub(finalHubs[0]);
          }
        } else if (finalHubs.length > 0) {
          setSelectedHub(finalHubs[0]);
        }
      } catch (err) {
        console.warn('Could not load hubs from Firestore, using fallback:', err);
        setHubs(INITIAL_HUBS);
        setSelectedHub(INITIAL_HUBS[0]);
      } finally {
        setLoading(false);
      }
    };

    loadHubs();
  }, [initialHubId]);


  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredHubs = useMemo(() => {
    if (!normalizedQuery) return hubs;

    return hubs.filter((hub) => {
      const searchable = [
        hub.name,
        hub.tagline,
        ...hub.seeds.map((seed) => seed.name),
        ...hub.nutrition.map((item) => item.name),
        hub.advisory.title
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [hubs, normalizedQuery]);

  useEffect(() => {
    if (!filteredHubs.length) {
      setSelectedHub(null);
      return;
    }

    if (!selectedHub || !filteredHubs.some((hub) => hub.id === selectedHub.id)) {
      setSelectedHub(filteredHubs[0]);
    }
  }, [filteredHubs, selectedHub]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!selectedHub) {
    return (
      <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-10">
        <div className="rounded-3xl border border-dashed border-surface-container bg-surface-container-low p-10 text-center">
          <h2 className="text-xl font-bold text-on-surface mb-2">{t('noHubResults')}</h2>
          <p className="text-on-surface-variant">{t('noHubResultsHint')}</p>
        </div>
      </div>
    );
  }

  const getIcon = (iconName: string) => {
    return ICONS[iconName as keyof typeof ICONS] || ICONS.Sprout;
  };

  return (
    <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8 flex flex-col gap-12">
      
      {/* Hub Selector */}
      <div className="flex items-center gap-3 sticky top-[72px] z-30 py-4 bg-surface/80 backdrop-blur-md -mx-4 px-4 md:-mx-10 md:px-10 border-b border-surface-container" data-tour="hub-tabs">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1 hide-scrollbar scroll-smooth whitespace-nowrap">
        {filteredHubs.map((hub) => (
          <button
            key={hub.id}
            onClick={() => setSelectedHub(hub)}
            className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
              selectedHub.id === hub.id 
                ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' 
                : 'bg-white text-on-surface border-surface-container hover:border-primary/50'
            }`}
          >
            {hub.name}
          </button>
        ))}
        </div>
        <div className="shrink-0">
          <HelperIcon
            size="sm"
            side="left"
            textKey="hubTabs"
            ariaLabel="Hub tabs help"
          />
        </div>
      </div>

      {/* Hero */}
      <section className="relative rounded-[40px] overflow-hidden shadow-ambient h-[300px] md:h-[450px] flex flex-col justify-end p-8 md:p-12 bg-surface-container-highest group">
        <div className="absolute inset-0">
          <img 
            src={selectedHub.heroImage} 
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
            alt={`${selectedHub.name} plantation and farming`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90" />
        </div>
        <div className="relative z-10">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 mb-4"
          >
            <span className="bg-primary text-white text-[10px] font-black uppercase px-4 py-1.5 rounded-full inline-block shadow-lg border border-white/20">{t('featuredCrop')}</span>
            <HelperIcon
              size="xs"
              variant="onDark"
              side="right"
              textKey="hubFeatured"
              ariaLabel="Featured crop help"
            />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tight leading-tight"
          >
            {selectedHub.name} <span className="text-primary-container">{t('hubSuffix')}</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-surface-container-low mt-4 max-w-2xl text-base md:text-xl font-medium leading-relaxed"
          >
            {selectedHub.tagline}
          </motion.p>
        </div>
      </section>

      {/* Crop Profile & Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: t('idealClimate'), value: selectedHub.idealClimate || 'Tropical', icon: ICONS.Efficiency, color: 'text-orange-500 bg-orange-50' },
          { label: t('soilType'), value: selectedHub.soilType || 'Loamy', icon: ICONS.Sprout, color: 'text-brown-500 bg-amber-50' },
          { label: t('waterNeeds'), value: selectedHub.waterNeeds || 'Moderate', icon: ICONS.Water, color: 'text-blue-500 bg-blue-50' },
          { label: t('bestSeason'), value: selectedHub.bestSeason || 'Spring', icon: ICONS.Home, color: 'text-green-500 bg-green-50' }
        ].map((stat, i) => (
          <HelperTooltip key={i} side="bottom" textKey="hubCropProfile">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-6 rounded-[32px] border border-surface-container shadow-sm flex flex-col items-center text-center group hover:border-primary transition-all cursor-default"
            >
              <div className={`w-12 h-12 rounded-2xl ${stat.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">{stat.label}</span>
              <span className="text-sm font-bold text-on-surface line-clamp-1">{stat.value}</span>
            </motion.div>
          </HelperTooltip>
        ))}
      </section>

      {/* Growth Journey Diagram */}
      {selectedHub.growthStages && selectedHub.growthStages.length > 0 && (
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <div>
                <h2 className="text-3xl font-black text-on-surface tracking-tight">{t('growthJourney')}</h2>
                <p className="text-on-surface-variant text-sm font-bold uppercase tracking-widest mt-1">{t('fromSeedToHarvest')}</p>
              </div>
              <HelperIcon
                size="sm"
                variant="ghost"
                side="right"
                textKey="hubGrowthJourney"
                ariaLabel="Growth journey help"
              />
            </div>
            <div className="hidden md:flex items-center gap-2 bg-secondary/10 text-secondary px-4 py-2 rounded-2xl border border-secondary/20">
              <ICONS.Sprout className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">{t('completeCycle')}</span>
            </div>
          </div>

          <div className="relative pt-10 pb-6 px-4 md:px-0">
            {/* Horizontal Line (Desktop) */}
            <div className="hidden md:block absolute top-[52px] left-0 right-0 h-1 bg-surface-container rounded-full" />
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 relative z-10">
              {selectedHub.growthStages.map((stage, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex flex-col items-center md:items-start text-center md:text-left group"
                >
                  <div className="relative mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-black text-xs shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform relative z-10 border-4 border-white">
                      {i + 1}
                    </div>
                    {/* Vertical connector for mobile */}
                    {i < selectedHub.growthStages!.length - 1 && (
                      <div className="md:hidden absolute top-10 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-surface-container" />
                    )}
                  </div>
                  
                  <HelperTooltip side="top" textKey="hubGrowthStage">
                    <div className="bg-white p-5 rounded-3xl border border-surface-container shadow-sm group-hover:shadow-ambient transition-shadow w-full flex-grow cursor-help">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-on-surface text-base">{stage.phase}</h3>
                        <span className="text-[10px] font-black text-secondary bg-secondary/5 px-2 py-0.5 rounded-full">{stage.duration}</span>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed mb-4">{stage.description}</p>

                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-primary">{t('recommendedProducts')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {stage.products.map((p, pi) => (
                            <span 
                              key={pi} 
                              onClick={(e) => { e.stopPropagation(); onSearchProduct?.(p); }}
                              className="text-[10px] bg-surface-container px-2 py-1 rounded-lg font-bold text-on-surface cursor-pointer hover:bg-primary hover:text-white transition-colors"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </HelperTooltip>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Grid: Seeds, Nutrition, Irrigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Seeds */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-surface-container flex flex-col hover:shadow-ambient transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-on-surface tracking-tight">{t('premiumSeeds')}</h2>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="hubSeeds"
                ariaLabel="Premium seeds help"
              />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
              <ICONS.Sprout className="text-secondary w-7 h-7" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 flex-grow">
            {selectedHub.seeds.map((seed, i) => (
              <div 
                key={i} 
                className="flex flex-col group cursor-pointer"
                onClick={() => onSearchProduct?.(seed.name)}
              >
                <div className="aspect-square rounded-2xl bg-surface-container overflow-hidden mb-3">
                  <img src={seed.img} alt={seed.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                </div>
                <span className="font-bold text-on-surface text-sm line-clamp-1 group-hover:text-primary transition-colors">{seed.name}</span>
                <span className="text-secondary font-black text-xs mt-1">₹{seed.price}/{t('perUnit')}</span>
              </div>
            ))}
          </div>
          <button 
            onClick={() => onCategoryClick?.('seeds')}
            className="mt-8 py-4 border-2 border-surface-container hover:border-primary text-on-surface font-bold rounded-2xl transition-all uppercase text-xs tracking-widest"
          >
            {t('viewAllSeeds')}
          </button>
        </div>

        {/* Nutrition */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-surface-container flex flex-col hover:shadow-ambient transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-on-surface tracking-tight">{t('targetedNutrition')}</h2>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="hubNutrition"
                ariaLabel="Nutrition help"
              />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
              <ICONS.Science className="text-secondary w-7 h-7" />
            </div>
          </div>
          <div className="flex flex-col gap-3 flex-grow">
            {selectedHub.nutrition.map((item, i) => {
              const IconComp = getIcon(item.icon);
              return (
                <div 
                  key={i} 
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-surface-container transition-colors cursor-pointer group border border-transparent hover:border-surface-container-highest"
                  onClick={() => onSearchProduct?.(item.name)}
                >
                  <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-surface-container flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all">
                    <IconComp className="w-6 h-6" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <h3 className="font-bold text-on-surface text-sm uppercase tracking-tight line-clamp-1">{item.name}</h3>
                    <p className="text-[10px] text-on-surface-variant font-bold opacity-70 line-clamp-1">{item.desc}</p>
                  </div>
                  <ICONS.ChevronRight className="w-4 h-4 text-outline" />
                </div>
              );
            })}
          </div>
          <button 
            onClick={() => onCategoryClick?.('fertilizers')}
            className="mt-8 py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary-container transition-all uppercase text-xs tracking-widest"
          >
            {t('exploreFertilizers')}
          </button>
        </div>

        {/* Irrigation */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-surface-container flex flex-col hover:shadow-ambient transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-on-surface tracking-tight">{t('irrigationTools')}</h2>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="hubIrrigation"
                ariaLabel="Irrigation help"
              />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
              <ICONS.Water className="text-secondary w-7 h-7" />
            </div>
          </div>
          <div className="rounded-2xl bg-surface-container-high h-40 overflow-hidden mb-6 relative group">
            <img src={selectedHub.irrigation.image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Irrigation" />
            <div className="absolute inset-0 bg-primary/20 mix-blend-overlay" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <span className="text-white text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/30">{t('systemSetup')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-4 flex-grow">
            {selectedHub.irrigation.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center border-b border-surface-container pb-3">
                <span className="text-sm font-bold text-on-surface-variant">{item.name}</span>
                <span className="text-sm font-black text-secondary">{item.price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Common Mistakes Section */}
      {selectedHub.commonMistakes && selectedHub.commonMistakes.length > 0 && (
        <section className="bg-on-surface rounded-[40px] p-8 md:p-12 text-white relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
          <div className="absolute -left-20 -top-20 w-80 h-80 bg-secondary/10 rounded-full blur-[100px]" />
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 mb-6">
                <div className="inline-flex items-center gap-2 bg-red-500/20 text-red-300 px-4 py-2 rounded-2xl border border-red-500/30">
                  <ICONS.X className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-widest">{t('proTipAvoid')}</span>
                </div>
                <HelperIcon
                  size="xs"
                  variant="onDark"
                  side="right"
                  textKey="hubMistakes"
                  ariaLabel="Mistakes to avoid help"
                />
              </div>
              <h2 className="text-4xl font-black mb-4 tracking-tight">{t('mistakesToAvoid')}</h2>
              <p className="text-surface-container-low/70 leading-relaxed mb-8">
                {t('agronomyMistakesIntro').replace('{crop}', selectedHub.name.toLowerCase())}
              </p>
              
              <div className="space-y-4">
                {selectedHub.commonMistakes.map((mistake, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
                  >
                    <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                      <ICONS.X className="w-3 h-3" />
                    </div>
                    <p className="text-sm font-medium text-surface-container-low">{mistake}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-3xl overflow-hidden shadow-2xl rotate-3 scale-95 md:scale-100">
                <img 
                  src={selectedHub.heroImage} 
                  alt="Mistakes to avoid" 
                  className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-on-surface to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white text-on-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl">
                      <ICONS.Check className="w-8 h-8" />
                    </div>
                    <p className="font-black text-xl">{t('growLikeAPro')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Advisory */}
      <section className="bg-primary/5 border border-primary/20 rounded-[40px] p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row gap-10 items-center">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center shadow-lg relative z-10 flex-shrink-0 border border-surface-container">
          <ICONS.Check className="w-12 h-12 text-primary" />
        </div>
        <div className="relative z-10 flex-grow">
          <div className="flex items-center gap-2 mb-3">
            <HelperTooltip side="bottom" textKey="hubAdvisory">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full cursor-help">{t('agronomyAlert')}</span>
            </HelperTooltip>
            <div className="w-2 h-2 rounded-full bg-harvest animate-pulse" />
          </div>
          <h2 className="text-3xl font-black text-on-surface mb-3 tracking-tight">{selectedHub.advisory.title}</h2>
          <p className="text-on-surface-variant max-w-3xl leading-relaxed text-base">
            {selectedHub.advisory.description}
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            <HelperTooltip side="top" textKey="hubConsult">
              <button className="flex items-center gap-3 bg-primary text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-primary/30 hover:bg-primary-container hover:scale-105 transition-all uppercase text-xs tracking-widest">
                <ICONS.Chat className="w-4 h-4" /> {t('consultSpecialist')}
              </button>
            </HelperTooltip>
            <HelperTooltip side="top" textKey="hubDownloadGuide">
              <button
                onClick={() => selectedHub && generateHubPDF(selectedHub)}
                className="flex items-center gap-3 bg-white text-on-surface font-black px-8 py-4 rounded-2xl border border-surface-container hover:bg-surface-container transition-all uppercase text-xs tracking-widest"
              >
                {t('downloadGuide')}
              </button>
            </HelperTooltip>
          </div>
        </div>
      </section>

      {/* Expert Wisdom / FAQ */}
      <section className="bg-white rounded-[40px] border border-surface-container p-8 md:p-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2">
            <h2 className="text-3xl font-black text-on-surface tracking-tight mb-2">{t('farmersWisdom')}</h2>
            <HelperIcon
              size="sm"
              variant="ghost"
              side="right"
              textKey="hubFaq"
              ariaLabel="Farmer's wisdom help"
            />
          </div>
          <p className="text-on-surface-variant text-sm font-bold uppercase tracking-widest">{t('essentialKnowledge').replace('{crop}', selectedHub.name)}</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { q: t('faqPlantingTime').replace('{crop}', selectedHub.name), a: t('faqPlantingTimeAns').replace('{crop}', selectedHub.name).replace('{season}', selectedHub.bestSeason?.toLowerCase() || 'early spring') },
            { q: t('faqWateringFreq').replace('{crop}', selectedHub.name), a: t('faqWateringFreqAns').replace('{crop}', selectedHub.name).replace('{needs}', selectedHub.waterNeeds?.toLowerCase() || 'moderate') },
            { q: t('faqSoilPh').replace('{crop}', selectedHub.name), a: t('faqSoilPhAns').replace('{crop}', selectedHub.name).replace('{type}', selectedHub.soilType?.toLowerCase() || 'well-drained') },
            { q: t('faqGreenhouse').replace('{crop}', selectedHub.name), a: t('faqGreenhouseAns').replace('{crop}', selectedHub.name) }
          ].map((faq, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-6 rounded-3xl bg-surface-container-low border border-surface-container hover:border-primary/30 transition-all cursor-default group"
            >
              <h3 className="font-black text-on-surface mb-3 flex items-start gap-3">
                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs">Q</span>
                {faq.q}
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed pl-9 group-hover:text-on-surface transition-colors">
                {faq.a}
              </p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
