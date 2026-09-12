/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Logo } from '../components/Logo';
import { Link } from 'react-router-dom';
import { Home as HomeIcon, Library, TrendingUp, User } from 'lucide-react';
import { authService } from '../services/api';
import { handleImageFallback } from '../components/CardThemeUtils';

export default function Home() {
  const currentUser = authService.getCurrentUser();
  const isAuthenticated = !!(currentUser && currentUser.onboarding_completed);
  const userInitial = (currentUser?.name?.trim() ? currentUser.name.trim()[0] : 'A').toUpperCase();

  return (
    <div className="min-h-screen bg-[#F6F4F0] flex flex-col font-sans overflow-x-hidden">
      {/* Navigation Bar */}
      <nav className="hidden md:grid w-full px-8 md:px-12 py-4 md:py-6 grid-cols-3 items-center z-10 relative">
        {/* Left: Small Logo */}
        <div className="justify-self-start flex items-center">
          <Logo size="small" />
        </div>

        {/* Center: Navigation Links */}
        <div className="justify-self-center hidden md:flex items-center gap-10 lg:gap-14">
          <Link to={isAuthenticated ? "/home" : "/"} className="text-sm lg:text-base font-medium tracking-[0.15em] text-[#1a1a1a] hover:underline underline-offset-8 decoration-2 transition-all uppercase">
            Home
          </Link>
          <Link to="/home" className="text-sm lg:text-base font-medium tracking-[0.15em] text-[#1a1a1a] hover:underline underline-offset-8 decoration-2 transition-all uppercase">
            Library
          </Link>
          <Link to="/progress" className="text-sm lg:text-base font-medium tracking-[0.15em] text-[#1a1a1a] hover:underline underline-offset-8 decoration-2 transition-all uppercase">
            Progress
          </Link>
        </div>

        {/* Right: User Initial Circle (when logged in) or Sign In (when guest) */}
        <div className="justify-self-end flex items-center gap-4">
          {isAuthenticated ? (
            <Link 
              to="/profile"
              id="nav-profile-circle-home"
              className="w-10 h-10 rounded-full bg-[#6b1302] text-white flex items-center justify-center font-bold text-base shadow-sm hover:ring-2 hover:ring-[#6b1302]/30 hover:scale-105 active:scale-95 transition-all cursor-pointer select-none"
              aria-label="User Profile"
              title={currentUser?.name || 'My Profile'}
            >
              {userInitial}
            </Link>
          ) : (
            <Link 
              to="/login" 
              className="text-sm lg:text-base font-medium tracking-[0.15em] text-[#1a1a1a] hover:underline underline-offset-8 decoration-2 transition-all uppercase"
            >
              Sign In
            </Link>
          )}
        </div>
      </nav>

      {/* Main Hero Content */}
      <main className="w-full h-[100dvh] min-h-[100dvh] max-h-[100dvh] md:h-auto md:min-h-0 md:max-h-none flex flex-col items-center justify-between md:justify-start relative z-0 pt-6 sm:pt-8 md:pt-0 md:-mt-6 lg:-mt-10 overflow-hidden md:overflow-visible">
        
        {/* Top Header Group: Logo, Tagline, Call To Action */}
        <div className="w-full flex flex-col items-center z-10 shrink-0">
          {/* Large Centered Logo */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="w-full max-w-5xl px-6 flex justify-center z-10"
          >
            <Logo size="large" />
          </motion.div>

          {/* Tagline */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            className="mt-6 sm:mt-7 md:mt-0 text-[#8c2a1c] text-lg sm:text-xl md:text-xl lg:text-2xl text-center px-4 z-10 relative mb-5 sm:mb-6 md:mb-10 lg:mb-12"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Where Learning actually happens
          </motion.p>

          {/* Call to Action - Button label strictly remains "Get Started" */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.4 }}
            className="w-full flex justify-center relative z-20 mt-3 sm:mt-4 md:mt-0 md:h-0"
          >
            <div className="relative md:absolute md:-top-5">
              <Link 
                to={isAuthenticated ? "/home" : "/signup"} 
                className="bg-[#6B1302] text-white px-7 py-2.5 sm:py-3 rounded-full font-bold text-sm md:text-base tracking-widest uppercase hover:bg-[#5a1002] transition-colors shadow-lg shadow-[#6B1302]/20 hover:shadow-xl hover:shadow-[#6B1302]/30 inline-block hover:-translate-y-0.5 duration-200"
              >
                Get Started
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Hero Illustration */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.6 }}
          className="w-full flex-1 h-full min-h-0 md:h-auto md:flex-none flex justify-center items-end relative z-0 pb-[72px] sm:pb-[80px] md:pb-0 md:-mt-16 lg:-mt-24 mt-2 sm:mt-3 md:mt-0 overflow-hidden"
        >
          <img 
            src="/main_section_img.png" 
            alt="Students learning together" 
            className="w-full h-[340px] sm:h-[440px] md:h-[520px] lg:h-[620px] object-cover object-top select-none drop-shadow-sm"
            onError={(e) => handleImageFallback(e, '/home_original.png')}
          />
        </motion.div>

      </main>
      
      {/* Feature Sections */}
      <div className="w-full bg-[#F6F4F0] flex flex-col z-10 relative pt-8 md:pt-12 pb-24">
        
        {/* Section 1: Learn it. Watch it. Understand it. */}
        <div className="max-w-[1600px] mx-auto w-full px-8 md:px-12 lg:px-24 py-8 md:py-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-24 items-center overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-2 lg:order-1 max-w-2xl justify-self-start lg:ml-8"
          >
            <h2 className="text-4xl md:text-5xl lg:text-[4rem] font-bold text-[#1a1a1a] leading-[1.1] mb-6 tracking-tight">
              Learn it. Watch it. Understand it.
            </h2>
            <p className="text-[#4a4a4a] text-lg lg:text-xl leading-relaxed">
              Turn dense NCERT concepts into short, animated, multilingual explainers grounded directly in the textbook. Every video breaks a difficult topic into simple visual explanations, with citations so students know exactly where the information comes from.
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            className="order-1 lg:order-2 flex justify-end w-full"
          >
            <img 
              src="/section2_img1.png" 
              alt="Feature illustration 1" 
              className="w-full max-w-xl lg:max-w-[750px] object-contain"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
        </div>

        {/* Section 2: Explain it. Don't just memorize it. */}
        <div className="max-w-[1600px] mx-auto w-full px-8 md:px-12 lg:px-24 py-8 md:py-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-24 items-center overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-1 flex justify-start w-full"
          >
            <img 
              src="/section2_img2.png" 
              alt="Feature illustration 2" 
              className="w-full max-w-xl lg:max-w-[750px] object-contain"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            className="order-2 max-w-2xl justify-self-end lg:mr-8"
          >
            <h2 className="text-4xl md:text-5xl lg:text-[4rem] font-bold text-[#1a1a1a] leading-[1.1] mb-6 tracking-tight">
              Explain it. Don't just memorize it.
            </h2>
            <p className="text-[#4a4a4a] text-lg lg:text-xl leading-relaxed">
              Akara goes beyond watching. Students explain the concept back using their voice or text, using the Feynman technique. The system checks their explanation against known misconceptions for that specific concept, helping identify what they actually understand — and what they don't.
            </p>
          </motion.div>
        </div>

        {/* Section 3: Track it. Master it. Your way. */}
        <div className="max-w-[1600px] mx-auto w-full px-8 md:px-12 lg:px-24 py-8 md:py-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-24 items-center overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-2 lg:order-1 max-w-2xl justify-self-start lg:ml-8"
          >
            <h2 className="text-4xl md:text-5xl lg:text-[4rem] font-bold text-[#1a1a1a] leading-[1.1] mb-6 tracking-tight">
              Track it. Master it. Your way.
            </h2>
            <p className="text-[#4a4a4a] text-lg lg:text-xl leading-relaxed">
              Every explanation feeds into a personal mastery profile, turning learning activity into meaningful progress. Students can revisit weak concepts, practice in different formats, and build understanding across Classes 6–12 STEM subjects — all in one responsive learning space.
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            className="order-1 lg:order-2 flex justify-end w-full"
          >
            <img 
              src="/section2_img3.png" 
              alt="Feature illustration 3" 
              className="w-full max-w-xl lg:max-w-[750px] object-contain"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
        </div>

      </div>

      {/* Footer Container - matches body background to create floating effect */}
      <div className="w-full bg-[#F6F4F0] px-4 pb-4 md:px-8 md:pb-8 lg:px-12 lg:pb-12">
        <footer className="bg-[#6B1302] text-white w-full rounded-2xl md:rounded-3xl py-16 px-8 md:px-16 lg:px-24 relative overflow-hidden">
          <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-12">
            
            {/* Brand Column */}
            <div className="flex flex-col items-start gap-4 lg:col-span-2 lg:pr-12">
              <div className="mb-2">
                <Logo size="small" inverted />
              </div>
              <p className="text-white/90 text-base md:text-lg leading-relaxed max-w-sm font-medium">
                A collaborative learning platform designed to make learning interactive, engaging, and meaningful.
              </p>
            </div>

            {/* Quick Links Column */}
            <div className="flex flex-col items-start gap-4">
              <h4 className="text-xl font-semibold mb-2">Quick Links</h4>
              <div className="flex flex-col gap-3">
                <Link to={isAuthenticated ? "/home" : "/"} className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Home</Link>
                <Link to="/home" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Library</Link>
                <Link to="/progress" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Progress</Link>
                <a href="#about" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">About Us</a>
              </div>
            </div>

            {/* Learning Column */}
            <div className="flex flex-col items-start gap-4">
              <h4 className="text-xl font-semibold mb-2">Learning</h4>
              <div className="flex flex-col gap-3">
                <Link to="/home" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Explore Library</Link>
                <Link to="/progress" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Track Progress</Link>
                <a href="#" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Create &amp; Collaborate</a>
                <a href="#" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Learning Resources</a>
              </div>
            </div>

            {/* Connect With Us Column */}
            <div className="flex flex-col items-start gap-4">
              <h4 className="text-xl font-semibold mb-2">Connect</h4>
              <div className="flex flex-col gap-3">
                <a href="#" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">GitHub</a>
                <a href="#" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Contact Us</a>
                <a href="#" className="text-white/70 hover:text-white transition-colors text-base md:text-lg">Feedback</a>
              </div>
            </div>
          </div>

          {/* Bottom Copyright */}
          <div className="max-w-[1600px] mx-auto mt-20 pt-8 border-t border-white/20">
            <p className="text-white/60 text-sm text-center md:text-left">
              &copy; 2026 Aqsara. All rights reserved.
            </p>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation - Floating Pill */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] bg-[#F6F4EE] rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border-[2.5px] border-[#6B1302] z-50 px-7 py-2 sm:py-2.5 flex justify-between items-center">
        <Link to="/" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5">
          <HomeIcon size={22} strokeWidth={2.2} />
          <div className="w-1 h-1 bg-[#1a1a1a] rounded-full"></div>
        </Link>
        <Link to="/library" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5">
          <Library size={22} strokeWidth={2.2} />
          <div className="w-1 h-1 rounded-full opacity-0"></div>
        </Link>
        <Link to="/progress" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5">
          <TrendingUp size={22} strokeWidth={2.2} />
          <div className="w-1 h-1 rounded-full opacity-0"></div>
        </Link>
        <Link to="/profile" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5">
          <User size={22} strokeWidth={2.2} />
          <div className="w-1 h-1 rounded-full opacity-0"></div>
        </Link>
      </div>
    </div>
  );
}
