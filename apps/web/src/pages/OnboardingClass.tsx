import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Logo } from '../components/Logo';
import { authService } from '../services/api';
import { handleImageFallback } from '../components/CardThemeUtils';

const ROW1_CLASSES = [6, 7, 8];
const ROW2_CLASSES = [9, 10, 11];
const ROW3_CLASSES = [12];

export default function OnboardingClass() {
  const [selectedClass, setSelectedClass] = useState<number | null>(() => authService.getDraftClass());
  const navigate = useNavigate();

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return;
    authService.setDraftClass(selectedClass);
    navigate('/onboarding/language');
  };

  const renderClassCircle = (cls: number) => {
    const isSelected = selectedClass === cls;
    return (
      <button
        key={cls}
        type="button"
        onClick={() => setSelectedClass(cls)}
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center font-bold text-sm sm:text-base transition-all duration-200 cursor-pointer ${
          isSelected
            ? 'bg-[#6b1302] text-white border-2 border-[#6b1302] shadow-md shadow-[#6b1302]/30 ring-2 ring-[#6b1302]/25 scale-105'
            : 'bg-[#F9F8F6] border border-gray-200 text-gray-800 hover:bg-[#6b1302] hover:text-white hover:border-[#6b1302] hover:scale-105 shadow-sm'
        }`}
      >
        {cls}
      </button>
    );
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
        className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col md:flex-row w-full max-w-[940px] overflow-hidden"
      >
        {/* Left Side: Class Selection Illustration ONLY */}
        <div className="w-full md:w-1/2 bg-[#F3F6F8] p-4 sm:p-6 md:p-7 flex items-center justify-center overflow-hidden">
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
              src="/class_selection.png" 
              alt="Class selection illustration" 
              className="w-full max-w-[460px] sm:max-w-[500px] md:max-w-[540px] max-h-[420px] md:max-h-[440px] object-contain drop-shadow-sm"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
        </div>

        {/* Right Side: Class Selection Form */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-10 flex flex-col justify-center items-center">
          <div className="w-full max-w-[390px] flex flex-col">
            <div className="mb-4 flex justify-center w-full">
              <Logo size="small" />
            </div>

            <div className="text-center mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-[#1a1a1a] tracking-tight">
                Select your Grade to Continue
              </h1>
            </div>

            <form onSubmit={handleContinue} className="flex flex-col">
              {/* 7 Circular Buttons: 3 in row 1, 3 in row 2, 1 centered in row 3 */}
              <div className="flex flex-col items-center gap-3.5 sm:gap-4 my-3">
                {/* Row 1: 6, 7, 8 */}
                <div className="flex items-center justify-center gap-3.5 sm:gap-5">
                  {ROW1_CLASSES.map((cls) => renderClassCircle(cls))}
                </div>

                {/* Row 2: 9, 10, 11 */}
                <div className="flex items-center justify-center gap-3.5 sm:gap-5">
                  {ROW2_CLASSES.map((cls) => renderClassCircle(cls))}
                </div>

                {/* Row 3: 12th Centered */}
                <div className="flex items-center justify-center">
                  {ROW3_CLASSES.map((cls) => renderClassCircle(cls))}
                </div>
              </div>

              {/* Continue Button (No downward arrow) */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={!selectedClass}
                className="w-full bg-[#6b1302] text-white font-medium py-3 rounded-xl hover:bg-[#580f01] transition-all shadow-md shadow-[#6b1302]/20 text-sm flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed mt-6"
              >
                Continue
              </motion.button>
            </form>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
