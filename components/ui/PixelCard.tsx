import React from 'react';

interface PixelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  title?: string;
  variant?: 'default' | 'dark' | 'outline';
  actionElement?: React.ReactNode;
}

export const PixelCard: React.FC<PixelCardProps> = ({
  children,
  className = '',
  title,
  variant = 'default',
  actionElement,
  ...rest
}) => {
  const isDark = variant === 'dark';
  const isOutline = variant === 'outline';
  
  let bgClass = 'bg-white text-pixel-black';
  let borderClass = 'border-pixel-black';
  
  if (isDark) {
    bgClass = 'bg-pixel-black text-pixel-white';
    borderClass = 'border-pixel-black';
  } else if (isOutline) {
    bgClass = 'bg-transparent text-pixel-black';
    borderClass = 'border-pixel-black dashed';
  }

  return (
    <div
      {...rest}
      className={`
        relative group border-2 ${borderClass}
        ${bgClass}
        shadow-pixel hover:shadow-pixel-lg transition-all duration-300
        mb-6 p-5 promax:p-6
        ${className}
      `}
    >
      {/* Decorative Corner Bits (The Masterpiece Detail) */}
      {!isOutline && (
        <>
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-black z-20" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-black z-20" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-black z-20" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black z-20" />
        </>
      )}

      {title && (
        <div className="flex justify-between items-center mb-4 border-b-2 border-current pb-2">
          <div className="font-pixel text-xl promax:text-2xl uppercase tracking-widest">
            {title}
          </div>
          {actionElement && <div>{actionElement}</div>}
        </div>
      )}
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};