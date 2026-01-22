import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X } from 'lucide-react';

interface Props {
  onClick: () => void;
  onHide: () => void; // Called when user clicks X to hide button
}

export const AIChatFloatingButton: React.FC<Props> = ({ onClick, onHide }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Desktop: Show X after 2 seconds of hovering
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isHovered && !isTouching) {
      timeoutId = setTimeout(() => {
        setShowClose(true);
      }, 2000);
    } else if (!isTouching) {
      setShowClose(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isHovered, isTouching]);

  // Mobile: Show X after 2 seconds of touch hold
  const handleTouchStart = () => {
    setIsTouching(true);
    touchTimerRef.current = setTimeout(() => {
      setShowClose(true);
    }, 2000);
  };

  const handleTouchEnd = () => {
    setIsTouching(false);
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    // Keep showClose state until user leaves
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showClose) {
      // Click X → Hide button
      onHide();
    } else {
      // Click chat icon → Open chat
      onClick();
    }
  };

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowClose(false); // Reset when mouse leaves
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
      className="fixed right-6 bottom-[100px] z-40 bg-black text-white border-4 border-white shadow-pixel hover:scale-110 transition-transform duration-200 flex items-center justify-center"
      style={{
        width: '64px',
        height: '64px'
      }}
      aria-label={showClose ? "Hide AI Assistant" : "Open AI Chat Assistant"}
    >
      {showClose ? (
        <X size={32} className="animate-fade-in" />
      ) : (
        <MessageSquare size={32} />
      )}
    </button>
  );
};
