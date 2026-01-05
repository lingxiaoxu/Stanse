import React, { useState, useEffect } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export interface TourStep {
  id: string;
  target: string; // CSS selector or data-tour-id
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  requiredTab?: string; // ViewState to switch to (e.g., 'FEED', 'STANCE')
}

interface AppTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onSwitchTab?: (tab: string) => void;
}

export const AppTour: React.FC<AppTourProps> = ({ steps, isOpen, onComplete, onSkip, onSwitchTab }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen || steps.length === 0) return;

    const step = steps[currentStep];
    if (!step) return;

    // Clear highlight immediately when step changes (prevents ghost highlight)
    setHighlightRect(null);

    // Switch tab if required
    if (step.requiredTab && onSwitchTab) {
      onSwitchTab(step.requiredTab);
    }

    const updateHighlight = () => {
      // Try to find element by data-tour-id first, then by selector
      let targetElement = document.querySelector(`[data-tour-id="${step.target}"]`);
      if (!targetElement) {
        targetElement = document.querySelector(step.target);
      }

      console.log(`[Tour] Step ${currentStep}: target="${step.target}", element found:`, !!targetElement);

      if (targetElement) {
        // Scroll element into view smoothly
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });

        // Wait for scroll animation, then update rect
        setTimeout(() => {
          const rect = targetElement!.getBoundingClientRect();
          console.log(`[Tour] Setting highlightRect:`, rect);
          setHighlightRect(rect);
        }, 400); // 400ms for smooth scroll to complete
      } else {
        // If target not found, use center of screen (no highlight)
        console.warn(`[Tour] Target not found: ${step.target}`);
        setHighlightRect(null);
      }
    };

    // Delay to allow tab switch to complete
    const initialDelay = step.requiredTab ? 600 : 200;
    const timeout = setTimeout(updateHighlight, initialDelay);

    // Update on resize/scroll
    window.addEventListener('resize', updateHighlight);
    window.addEventListener('scroll', updateHighlight);

    return () => {
      window.removeEventListener('resize', updateHighlight);
      window.removeEventListener('scroll', updateHighlight);
      clearTimeout(timeout);
    };
  }, [currentStep, steps, isOpen, onSwitchTab]);

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
    const padding = 32; // Increased padding to avoid overlap
    const tooltipWidth = 360;
    const tooltipHeight = 220; // Reduced from 260 (more compact design)

    // Default center position
    let top = window.innerHeight / 2 - tooltipHeight / 2;
    let left = window.innerWidth / 2 - tooltipWidth / 2;

    if (highlightRect && currentTourStep.position !== 'center') {
      switch (currentTourStep.position) {
        case 'bottom':
          // Position below the element, ensuring no overlap
          top = Math.max(highlightRect.bottom + padding, 20);
          left = highlightRect.left + (highlightRect.width / 2) - (tooltipWidth / 2);
          break;
        case 'top':
          // Check if element is in bottom navigation (bottom 20% of screen)
          const isBottomNav = highlightRect.bottom > window.innerHeight * 0.8;
          // Check if element is in upper half (might need tooltip below instead)
          const isUpperHalf = highlightRect.top < window.innerHeight * 0.4;

          if (isBottomNav) {
            // For bottom nav, position tooltip much higher to avoid overlap
            top = Math.min(
              window.innerHeight * 0.35,  // Position at 35% from top (upper-middle area)
              highlightRect.top - tooltipHeight - 80  // Or 80px above if space allows
            );
            left = highlightRect.left + (highlightRect.width / 2) - (tooltipWidth / 2);
          } else if (isUpperHalf) {
            // For elements in upper half, try to position tooltip BELOW to avoid covering
            const spaceBelow = window.innerHeight - highlightRect.bottom;
            const spaceAbove = highlightRect.top;

            if (spaceBelow > tooltipHeight + padding + 100) {
              // Enough space below - position tooltip below the element
              top = highlightRect.bottom + padding;
              left = highlightRect.left + (highlightRect.width / 2) - (tooltipWidth / 2);
            } else if (spaceAbove > tooltipHeight + padding) {
              // Not enough below, but space above - position above
              top = highlightRect.top - tooltipHeight - padding;
              left = highlightRect.left + (highlightRect.width / 2) - (tooltipWidth / 2);
            } else {
              // Not enough space either way - position to the side
              top = Math.max(highlightRect.top, 20);
              left = highlightRect.right + padding;
            }
          } else {
            // Regular positioning for middle elements
            top = Math.max(highlightRect.top - tooltipHeight - padding, 20);
            left = highlightRect.left + (highlightRect.width / 2) - (tooltipWidth / 2);

            // If not enough space on top, position to the side instead
            if (top < 20) {
              top = highlightRect.top;
              left = highlightRect.right + padding;
            }
          }
          break;
        case 'right':
          top = Math.max(highlightRect.top + (highlightRect.height / 2) - (tooltipHeight / 2), 20);
          left = highlightRect.right + padding;
          break;
        case 'left':
          top = Math.max(highlightRect.top + (highlightRect.height / 2) - (tooltipHeight / 2), 20);
          left = highlightRect.left - tooltipWidth - padding;
          break;
      }
    }

    // Keep tooltip within viewport with margins
    const margin = 20;
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
        {/* Dark overlay - full screen for center positions, with cutout for others */}
        {currentTourStep.position === 'center' ? (
          // Full dark overlay for center messages (no cutout)
          <div
            className="absolute inset-0 bg-black/75"
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          // Dark overlay with SVG mask for spotlight effect
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
        )}

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
        className="bg-white border-4 border-black shadow-pixel p-5 pt-7 animate-fade-in relative"
        style={{ ...getTooltipStyle(), pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button - positioned above progress bar */}
        <button
          onClick={onSkip}
          className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded transition-colors z-10"
          aria-label="Skip tour"
        >
          <X size={18} />
        </button>

        {/* Progress indicator */}
        <div className="flex gap-1.5 mb-4 pr-8">
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
        <div className="mb-4">
          <h3 className="font-pixel text-xl mb-2 pr-8 leading-tight">{currentTourStep.title}</h3>
          <p className="font-mono text-xs text-gray-700 leading-snug">
            {currentTourStep.description}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t-2 border-gray-200 pt-3">
          <div className="font-mono text-xs text-gray-500">
            Step {currentStep + 1} of {steps.length}
          </div>

          <div className="flex gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrevious}
                className="px-3 py-1.5 font-mono text-xs border-2 border-black bg-white hover:bg-gray-100 transition-all"
              >
                {t('tour', 'back') || 'BACK'}
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-1.5 font-mono text-xs font-bold border-2 border-black bg-black text-white hover:bg-gray-800 transition-all flex items-center gap-1"
            >
              {isLastStep ? (t('tour', 'finish') || 'FINISH') : (t('tour', 'next') || 'NEXT')}
              {!isLastStep && <ChevronRight size={14} />}
            </button>
          </div>
        </div>

        {/* Tap anywhere hint */}
        <div className="text-center mt-1.5 font-mono text-[10px] text-gray-400 italic">
          {t('tour', 'tap_anywhere') || 'Tap anywhere to continue'}
        </div>
      </div>
    </div>
  );
};
