import React, { useState, useEffect } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export interface TourStep {
  id: string;
  target: string; // CSS selector or data-tour-id
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface AppTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export const AppTour: React.FC<AppTourProps> = ({ steps, isOpen, onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen || steps.length === 0) return;

    const updateHighlight = () => {
      const step = steps[currentStep];
      if (!step) return;

      // Try to find element by data-tour-id first, then by selector
      let targetElement = document.querySelector(`[data-tour-id="${step.target}"]`);
      if (!targetElement) {
        targetElement = document.querySelector(step.target);
      }

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        setHighlightRect(rect);
      } else {
        // If target not found, use center of screen
        setHighlightRect(null);
      }
    };

    updateHighlight();

    // Update on resize/scroll
    window.addEventListener('resize', updateHighlight);
    window.addEventListener('scroll', updateHighlight);

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(updateHighlight, 100);

    return () => {
      window.removeEventListener('resize', updateHighlight);
      window.removeEventListener('scroll', updateHighlight);
      clearTimeout(timeout);
    };
  }, [currentStep, steps, isOpen]);

  if (!isOpen || steps.length === 0) return null;

  const currentTourStep = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Calculate tooltip position based on highlight and preferred position
  const getTooltipStyle = (): React.CSSProperties => {
    const padding = 24;
    const tooltipWidth = 360;
    const tooltipHeight = 240; // Approximate

    // Default center position
    let top = window.innerHeight / 2 - tooltipHeight / 2;
    let left = window.innerWidth / 2 - tooltipWidth / 2;

    if (highlightRect && currentTourStep.position !== 'center') {
      switch (currentTourStep.position) {
        case 'bottom':
          top = highlightRect.bottom + padding;
          left = highlightRect.left + (highlightRect.width / 2) - (tooltipWidth / 2);
          break;
        case 'top':
          top = highlightRect.top - tooltipHeight - padding;
          left = highlightRect.left + (highlightRect.width / 2) - (tooltipWidth / 2);
          break;
        case 'right':
          top = highlightRect.top + (highlightRect.height / 2) - (tooltipHeight / 2);
          left = highlightRect.right + padding;
          break;
        case 'left':
          top = highlightRect.top + (highlightRect.height / 2) - (tooltipHeight / 2);
          left = highlightRect.left - tooltipWidth - padding;
          break;
      }
    }

    // Keep tooltip within viewport
    const margin = 16;
    if (left < margin) left = margin;
    if (left + tooltipWidth > window.innerWidth - margin) {
      left = window.innerWidth - tooltipWidth - margin;
    }
    if (top < margin) top = margin;
    if (top + tooltipHeight > window.innerHeight - margin) {
      top = window.innerHeight - tooltipHeight - margin;
    }

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      zIndex: 10002
    };
  };

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 10000, isolation: 'isolate' }}
    >
      {/* Clickable overlay for advancing */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={handleNext}
        style={{ zIndex: 10001 }}
      >
        {/* Dark overlay with SVG mask for spotlight effect */}
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          <defs>
            <mask id="tour-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {highlightRect && (
                <rect
                  x={highlightRect.left - 8}
                  y={highlightRect.top - 8}
                  width={highlightRect.width + 16}
                  height={highlightRect.height + 16}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.75)"
            mask="url(#tour-spotlight-mask)"
          />
        </svg>

        {/* Highlight border with pulse animation */}
        {highlightRect && (
          <div
            className="absolute border-4 border-blue-500 rounded-xl pointer-events-none"
            style={{
              top: `${highlightRect.top - 8}px`,
              left: `${highlightRect.left - 8}px`,
              width: `${highlightRect.width + 16}px`,
              height: `${highlightRect.height + 16}px`,
              boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 30px rgba(59, 130, 246, 0.4)',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}
          />
        )}
      </div>

      {/* Tooltip - Clickable area to prevent event bubbling */}
      <div
        className="bg-white border-4 border-black shadow-pixel p-6 animate-fade-in"
        style={{ ...getTooltipStyle(), pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onSkip}
          className="absolute top-3 right-3 p-1 hover:bg-gray-200 rounded transition-colors"
          aria-label="Skip tour"
        >
          <X size={20} />
        </button>

        {/* Progress indicator */}
        <div className="flex gap-1.5 mb-5">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? 'bg-black'
                  : index < currentStep
                  ? 'bg-gray-500'
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="mb-6">
          <h3 className="font-pixel text-2xl mb-3 pr-8">{currentTourStep.title}</h3>
          <p className="font-mono text-sm text-gray-700 leading-relaxed">
            {currentTourStep.description}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t-2 border-gray-200 pt-4">
          <div className="font-mono text-xs text-gray-500">
            Step {currentStep + 1} of {steps.length}
          </div>

          <div className="flex gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrevious}
                className="px-4 py-2 font-mono text-xs border-2 border-black bg-white hover:bg-gray-100 transition-all"
              >
                {t('tour', 'back') || 'BACK'}
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-5 py-2 font-mono text-xs font-bold border-2 border-black bg-black text-white hover:bg-gray-800 transition-all flex items-center gap-2"
            >
              {isLastStep ? (t('tour', 'finish') || 'FINISH') : (t('tour', 'next') || 'NEXT')}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>

        {/* Tap anywhere hint */}
        <div className="text-center mt-3 font-mono text-xs text-gray-400 italic">
          {t('tour', 'tap_anywhere') || 'Tap anywhere to continue'}
        </div>
      </div>
    </div>
  );
};
