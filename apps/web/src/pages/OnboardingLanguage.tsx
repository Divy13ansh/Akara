import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';
import { Logo } from '../components/Logo';
import { authService } from '../services/api';
import { handleImageFallback } from '../components/CardThemeUtils';

const LANGUAGES = [
  { code: 'hi', name: 'हिन्दी', label: 'Hindi' },
  { code: 'en', name: 'English', label: 'English' },
  { code: 'mr', name: 'मराठी', label: 'Marathi' },
  { code: 'bn', name: 'বাংলা', label: 'Bengali' },
  { code: 'te', name: 'తెలుగు', label: 'Telugu' },
  { code: 'ta', name: 'தமிழ்', label: 'Tamil' },
  { code: 'gu', name: 'ગુજરાતી', label: 'Gujarati' },
  { code: 'kn', name: 'ಕನ್ನಡ', label: 'Kannada' },
  { code: 'ml', name: 'മലയാളം', label: 'Malayalam' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', label: 'Punjabi' },
  { code: 'ur', name: 'اردو', label: 'Urdu' },
  { code: 'or', name: 'ଓଡ଼ିଆ', label: 'Odia' },
];

export default function OnboardingLanguage() {
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => authService.getDraftLanguage());
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLang = LANGUAGES.find((l) => l.code === selectedLanguage) || LANGUAGES[0];

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenClass = authService.getDraftClass() || 10;
    if (!selectedLanguage) return;

    setLoading(true);
    try {
      await authService.updateProfile({
        class: chosenClass,
        default_language: selectedLanguage,
      });
      navigate('/home');
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-[#F6F4F0] flex items-center justify-center p-4 sm:p-6 font-sans"
    >
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col md:flex-row w-full max-w-[940px] relative overflow-visible"
      >
        {/* Left Side: Language Selection Illustration ONLY */}
        <div className="w-full md:w-1/2 bg-[#F3F6F8] p-4 sm:p-6 md:p-7 flex items-center justify-center overflow-hidden rounded-t-3xl md:rounded-tr-none md:rounded-l-3xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.65, y: 30 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              y: [-6, 6, -6] 
            }}
            transition={{ 
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { type: "spring", stiffness: 260, damping: 16, mass: 0.7 },
              y: { repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.4 }
            }}
            className="w-full flex justify-center items-center"
          >
            <img 
              src="/language_selection.png" 
              alt="Language selection illustration" 
              className="w-full max-w-[460px] sm:max-w-[500px] md:max-w-[540px] max-h-[420px] md:max-h-[440px] object-contain drop-shadow-sm"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
        </div>

        {/* Right Side: Language Selection Dropdown */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-10 flex flex-col justify-center items-center">
          <div className="w-full max-w-[390px] flex flex-col">
            <div className="mb-4 flex justify-center w-full">
              <Logo size="small" />
            </div>

            <div className="text-center mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-[#1a1a1a] tracking-tight">
                Preferred Language
              </h1>
            </div>

            <form onSubmit={handleComplete} className="flex flex-col gap-5">
              {/* Custom Dropdown with Rounded Corners on both container and selection popup */}
              <div className="relative" ref={dropdownRef}>
                {/* Dropdown Trigger Button with Rounded Corners */}
                <button
                  type="button"
                  onClick={() => setIsOpen((prev) => !prev)}
                  className={`w-full h-12 px-4 rounded-2xl bg-[#F9F8F6] border text-left flex items-center justify-between transition-all cursor-pointer shadow-xs ${
                    isOpen 
                      ? 'border-[#6b1302] ring-2 ring-[#6b1302]/20 bg-white' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-gray-900">{activeLang.name}</span>
                    <span className="text-xs text-gray-500 font-medium">({activeLang.label})</span>
                  </div>
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#6b1302]' : ''}`} 
                  />
                </button>

                {/* Dropdown Popup Menu with Rounded Corners */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 4, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      className="absolute z-50 left-0 right-0 top-full bg-white rounded-2xl border border-gray-100 shadow-[0_12px_36px_rgba(0,0,0,0.12)] p-2 max-h-[260px] overflow-y-auto"
                    >
                      <div className="flex flex-col gap-1">
                        {LANGUAGES.map((lang) => {
                          const isSelected = selectedLanguage === lang.code;
                          return (
                            <button
                              key={lang.code}
                              type="button"
                              onClick={() => {
                                setSelectedLanguage(lang.code);
                                authService.setDraftLanguage(lang.code);
                                setIsOpen(false);
                              }}
                              className={`w-full px-3.5 py-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[#6b1302]/10 text-[#6b1302] font-semibold'
                                  : 'hover:bg-[#F9F8F6] text-gray-700'
                              }`}
                            >
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold">{lang.name}</span>
                                <span className={`text-xs ${isSelected ? 'text-[#6b1302]/80' : 'text-gray-400'}`}>
                                  ({lang.label})
                                </span>
                              </div>
                              {isSelected && (
                                <Check size={16} className="text-[#6b1302]" strokeWidth={2.5} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Get Started Button */}
              <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading || !selectedLanguage}
                className="w-full bg-[#6b1302] text-white font-medium py-3 rounded-xl hover:bg-[#580f01] transition-all shadow-md shadow-[#6b1302]/20 text-sm flex items-center justify-center cursor-pointer disabled:opacity-50 mt-4"
              >
                {loading ? 'Saving preferences...' : 'Get Started'}
              </motion.button>
            </form>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
