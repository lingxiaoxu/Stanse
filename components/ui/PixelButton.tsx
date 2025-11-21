import React from 'react';

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'alert' | 'success';
  isLoading?: boolean;
}

export const PixelButton: React.FC<PixelButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading,
  className = '',
  ...props 
}) => {
  const baseStyles = "font-mono font-bold border-2 border-pixel-black px-6 py-2 transition-all active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-pixel-black text-white shadow-pixel hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_rgba(0,0,0,1)]",
    secondary: "bg-white text-black shadow-pixel hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_rgba(0,0,0,1)]",
    alert: "bg-alert-red text-white shadow-pixel",
    success: "bg-success-green text-white shadow-pixel"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? 'PROCESSING...' : children}
    </button>
  );
};