import { MarketplaceProduct } from "../../types/product";
import { ICONS } from '../constants';
import { motion } from 'framer-motion';

export default function AboutView() {
  const stats = [
    { value: '500+', label: 'Local Stores' },
    { value: '10K+', label: 'Farmers Served' },
    { value: '25+', label: 'Districts Covered' },
    { value: '98%', label: 'Satisfaction Rate' }
  ];

  const values = [
    {
      icon: ICONS.Trust,
      title: 'Local Trust',
      desc: 'We partner exclusively with verified, government-registered agricultural stores in your area. Every seller is vetted to ensure quality and authenticity.'
    },
    {
      icon: ICONS.Efficiency,
      title: 'Digital Efficiency',
      desc: 'From browsing to checkout to delivery tracking — every step is designed for the farmer on the go. Fast, frictionless, and built for low-bandwidth environments.'
    },
    {
      icon: ICONS.Sprout,
      title: 'Farmer First',
      desc: 'Krishidukan was built by farmers, for farmers. Our pricing is transparent, our information is honest, and our support is in your local language.'
    },
    {
      icon: ICONS.Science,
      title: 'Quality Assured',
      desc: 'Every product listed on Krishidukan passes our quality checks. We work with certified suppliers and display lab-verified composition data on every listing.'
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
            <span className="text-primary-container text-xs font-black uppercase tracking-widest mb-4 block">Our Story</span>
            <h1 className="text-white text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6 max-w-2xl">
              Bridging Farmers<br />with Modern Agri Retail
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-xl leading-relaxed">
              Krishidukan was born from a simple idea — every farmer deserves transparent access to quality agricultural supplies at fair prices, right in their local area.
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
            <span className="text-primary text-xs font-black uppercase tracking-widest mb-3 block">Our Mission</span>
            <h2 className="text-4xl font-bold text-on-surface mb-6 leading-tight">
              Empowering Every Farmer with the Right Tools
            </h2>
            <p className="text-on-surface-variant text-lg leading-relaxed mb-6">
              India&apos;s agricultural sector employs over 600 million people, yet access to quality inputs and reliable information remains unequal. Krishidukan changes that by creating a unified digital marketplace for local agri retailers and the farmers they serve.
            </p>
            <p className="text-on-surface-variant text-lg leading-relaxed">
              We&apos;re not just a shopping app. We&apos;re an agricultural intelligence platform — helping farmers discover the right products, understand their composition, and buy from stores they can trust, all within their community.
            </p>
          </div>
          <div className="rounded-3xl overflow-hidden shadow-ambient border border-surface-container h-80 md:h-auto">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcJewaf8J1gWZEdY6ipzy3p0M5aZoePmxCri9BSh7nbzy4FW-i7Azi-fBl6G0vr9TDZY9Q0XxD_GHq2_mJECmXU0oGsqJSZEnh1-5IRtoFi-mxGzKT9SHQH5HJW6wrhRD4Z98Wjo19TKEXGiIpyPXcFVZVvSuhCD9bXXV1kQRL_o0HNQ6-7KIySLLVdAddKSxPd14-jD0W8uG58KaJpjHYahRINJqJMRzG_CvOOiM2CGpIBu5yKjDn4P8gspnpRXThlkMm_JgsHX0L"
              alt="Farmer in field"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-surface-container-low border-y border-surface-container py-16">
        <div className="px-4 md:px-10 max-w-7xl mx-auto w-full">
          <div className="text-center mb-12">
            <span className="text-primary text-xs font-black uppercase tracking-widest mb-3 block">What We Stand For</span>
            <h2 className="text-4xl font-bold text-on-surface">Our Core Values</h2>
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
              <span className="text-primary-container text-xs font-black uppercase tracking-widest mb-3 block">Get in Touch</span>
              <h2 className="text-4xl font-bold text-white mb-6 leading-tight">We&apos;d Love to Hear from You</h2>
              <p className="text-white/80 text-lg leading-relaxed mb-8">
                Whether you&apos;re a farmer, a store owner looking to list your shop, or just curious about what we do — reach out to us.
              </p>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <ICONS.Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-white/60 mb-0.5">Phone</div>
                    <div className="font-bold">+91 98765 43210</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <ICONS.Chat className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-white/60 mb-0.5">Email</div>
                    <div className="font-bold">support@krishidukan.in</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <ICONS.Location className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-white/60 mb-0.5">Office</div>
                    <div className="font-bold">Baner Road, Pune, Maharashtra — 411045</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-2xl">
              <h3 className="text-xl font-bold text-on-surface mb-6">Send us a Message</h3>
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="Your name"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <textarea
                  placeholder="Your message..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
                <button className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                  <ICONS.ArrowRight className="w-4 h-4" /> Send Message
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
