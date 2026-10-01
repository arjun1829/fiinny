import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import HomeHero from '../components/landing/home/HomeHero';
import HomeBusinessTypes from '../components/landing/home/HomeBusinessTypes';
import HomeProblems from '../components/landing/home/HomeProblems';
import HomeHowItWorks from '../components/landing/home/HomeHowItWorks';
import HomeSolutions from '../components/landing/home/HomeSolutions';
import HomeShowcase from '../components/landing/home/HomeShowcase';
import HomePricingPreview from '../components/landing/home/HomePricingPreview';
import HomeFAQ from '../components/landing/home/HomeFAQ';
import HomeFinalCTA from '../components/landing/home/HomeFinalCTA';
import { home } from '../components/landing/home/tokens';

export default function LandingPage() {
    return (
        <div style={{
            background: home.color.cream,
            color: home.color.ink,
            fontFamily: home.font.body,
            minHeight: '100vh',
            overflowX: 'hidden',
        }}>
            <Navbar />
            <main>
                <HomeHero />
                <HomeBusinessTypes />
                <HomeProblems />
                <HomeHowItWorks />
                <HomeSolutions />
                <HomeShowcase />
                <HomePricingPreview />
                <HomeFAQ />
                <HomeFinalCTA />
            </main>
            <Footer />
        </div>
    );
}
