import React, { useState } from 'react';
import { X, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
}

const ModalHeader: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="flex items-center justify-between p-6 border-b-2 border-black bg-white">
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 border-2 border-black bg-white flex items-center justify-center">
        <div className="w-3 h-2 border border-black"></div>
      </div>
      <h2 className="text-3xl font-pixel uppercase tracking-wide">WALLET</h2>
    </div>
    <button
      onClick={onClose}
      className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors"
    >
      <X size={24} />
    </button>
  </div>
);

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  currentBalance,
  onDeposit,
  onWithdraw
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  const handleConfirm = () => {
    if (selectedAmount === null) return;

    if (activeTab === 'DEPOSIT') {
      onDeposit(selectedAmount);
    } else {
      if (selectedAmount > currentBalance) {
        alert('Insufficient balance');
        return;
      }
      onWithdraw(selectedAmount);
    }

    setSelectedAmount(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-white border-4 border-black w-full max-w-md shadow-pixel-modal">
        <ModalHeader onClose={onClose} />

        {/* Current Balance Section */}
        <div className="bg-black text-white py-6">
          <div className="text-center">
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              CURRENT BALANCE
            </div>
            <div className="font-pixel text-7xl text-green-500 leading-none">
              ${currentBalance}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t-2 border-black flex">
          <button
            onClick={() => setActiveTab('DEPOSIT')}
            className={`flex-1 py-3 font-mono text-sm font-bold uppercase border-r border-black transition-colors ${
              activeTab === 'DEPOSIT'
                ? 'bg-white text-black'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            DEPOSIT
          </button>
          <button
            onClick={() => setActiveTab('WITHDRAW')}
            className={`flex-1 py-3 font-mono text-sm font-bold uppercase transition-colors ${
              activeTab === 'WITHDRAW'
                ? 'bg-white text-black'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            WITHDRAW
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 bg-gray-50 space-y-4">
          <div className="font-mono text-xs font-bold uppercase tracking-widest text-gray-500">
            SELECT AMOUNT
          </div>

          {/* Amount Buttons Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[10, 20, 50, 100].map((amount) => (
              <button
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                className={`border-2 border-black py-4 font-mono text-xl font-bold uppercase transition-all ${
                  selectedAmount === amount
                    ? 'bg-black text-white shadow-pixel'
                    : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                {activeTab === 'DEPOSIT' ? '+' : ''}${amount}
              </button>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="text-center pt-2">
            <p className="font-mono text-[10px] text-gray-500">
              * Simulates external payment gateway
            </p>
          </div>
        </div>

        {/* Confirm Button - Only if amount selected */}
        {selectedAmount !== null && (
          <div className="border-t-2 border-black">
            <button
              onClick={handleConfirm}
              className="w-full bg-black text-white hover:bg-gray-800 transition-colors py-4 font-mono text-lg font-bold uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {activeTab === 'DEPOSIT' ? (
                <>
                  <ArrowDownLeft size={20} />
                  CONFIRM DEPOSIT ${selectedAmount}
                </>
              ) : (
                <>
                  <ArrowUpRight size={20} />
                  CONFIRM WITHDRAW ${selectedAmount}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
