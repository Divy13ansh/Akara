import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ConceptNode } from '../services/constellationData';
import { X } from 'lucide-react';

interface ConceptDetailsModalProps {
  concept: ConceptNode | null;
  isOpen: boolean;
  onClose: () => void;
  onMasterConcept: (conceptId: string) => void;
  isProcessing?: boolean;
  onLearn?: (concept: ConceptNode) => void;
  onExplain?: (concept: ConceptNode) => void;
  onPractice?: (concept: ConceptNode) => void;
}

export function ConceptDetailsModal({
  concept,
  isOpen,
  onClose,
  onMasterConcept,
  isProcessing = false,
  onLearn,
  onExplain,
  onPractice,
}: ConceptDetailsModalProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // If there is no concept or the concept is locked, do not render any popup
  if (!concept || concept.status === 'locked') return null;

  const isGreenNode = concept.status === 'mastered';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-stone-900/30 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          {/* Single Popup Container */}
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`relative z-10 w-full max-w-sm sm:max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.14)] ${
              isGreenNode
                ? 'border-2 border-emerald-500 shadow-[0_16px_40px_rgba(16,185,129,0.2)]'
                : 'border border-stone-200/90 shadow-xl'
            } font-sans select-none`}
          >
            {/* Close Button without a circle */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-700 transition-colors p-1 cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* 1. Topic / Concept Name at TOP */}
            <h3 className="text-lg sm:text-xl font-bold text-[#1a1a1a] tracking-tight leading-snug mb-3 pr-7">
              {concept.name}
            </h3>

            {/* 2. Concept Overview */}
            <div className="mb-6 space-y-1.5">
              <h4 className="text-xs sm:text-sm font-bold text-stone-700">
                Concept Overview
              </h4>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">
                {concept.short_description}
              </p>
            </div>

            {/* 3. Action Buttons: [ Learn ] [ Explain ] [ Practice ] */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* [ Learn ] */}
              <button
                type="button"
                id="modal-action-learn"
                onClick={() => {
                  if (onLearn) onLearn(concept);
                  else onClose();
                }}
                className="flex items-center justify-center py-2.5 sm:py-3 px-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all border border-stone-300 text-stone-800 bg-white hover:bg-stone-50 active:scale-[0.98] cursor-pointer"
              >
                <span>Learn</span>
              </button>

              {/* [ Explain ] */}
              <button
                type="button"
                id="modal-action-explain"
                onClick={() => {
                  if (onExplain) onExplain(concept);
                  else onClose();
                }}
                className="flex items-center justify-center py-2.5 sm:py-3 px-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all border border-stone-300 text-stone-800 bg-white hover:bg-stone-50 active:scale-[0.98] cursor-pointer"
              >
                <span>Explain</span>
              </button>

              {/* [ Practice ] */}
              <button
                type="button"
                id="modal-action-practice"
                onClick={() => {
                  if (onPractice) onPractice(concept);
                  else onClose();
                }}
                className="flex items-center justify-center py-2.5 sm:py-3 px-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all border border-stone-300 text-stone-800 bg-white hover:bg-stone-50 active:scale-[0.98] cursor-pointer"
              >
                <span>Practice</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
