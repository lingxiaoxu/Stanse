import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, CheckCircle, Loader } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onDeposit: (amount: number) => Promise<{ success: boolean; newBalance?: number; error?: string }>;
  onWithdraw: (amount: number) => Promise<{ success: boolean; newBalance?: number; error?: string }>;
  initialTab?: 'DEPOSIT' | 'WITHDRAW';
}

type ProcessingState = 'idle' | 'processing' | 'success' | 'error';

const ModalHeader: React.FC<{ onClose: () => void; title: string }> = ({ onClose, title }) => (
  <div className="flex items-center justify-between p-6 border-b-2 border-black bg-white">
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 border-2 border-black bg-white flex items-center justify-center">
        <div className="w-3 h-2 border border-black"></div>
      </div>
      <h2 className="text-3xl font-pixel uppercase tracking-wide">{title}</h2>
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
  onWithdraw,
  initialTab = 'DEPOSIT'
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW'>(initialTab);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [oldBalance, setOldBalance] = useState<number>(currentBalance);
  const [newBalance, setNewBalance] = useState<number>(currentBalance);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setProcessingState('idle');
      setSelectedAmount(null);
      setOldBalance(currentBalance);
      setNewBalance(currentBalance);
      setErrorMessage('');
    }
  }, [isOpen, currentBalance]);

  const handleConfirm = async () => {
    if (selectedAmount === null) return;

    // Check balance for withdrawals
    if (activeTab === 'WITHDRAW' && selectedAmount > currentBalance) {
      setErrorMessage(t('duel', 'insufficient_balance'));
      setProcessingState('error');
      setTimeout(() => {
        setProcessingState('idle');
        setErrorMessage('');
      }, 2000);
      return;
    }

    // Start processing
    setProcessingState('processing');
    setOldBalance(currentBalance);

    try {
      const result = activeTab === 'DEPOSIT'
        ? await onDeposit(selectedAmount)
        : await onWithdraw(selectedAmount);

      if (result.success && result.newBalance !== undefined) {
        // Success!
        setNewBalance(result.newBalance);
        setProcessingState('success');

        // Auto-close after showing success
        setTimeout(() => {
          setSelectedAmount(null);
          onClose();
        }, 2500);
      } else {
        // Error
        setErrorMessage(result.error || 'Transaction failed');
        setProcessingState('error');
        setTimeout(() => {
          setProcessingState('idle');
          setErrorMessage('');
        }, 2000);
      }
    } catch (error) {
      console.error('Transaction error:', error);
      setErrorMessage('Transaction failed');
      setProcessingState('error');
      setTimeout(() => {
        setProcessingState('idle');
        setErrorMessage('');
      }, 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-white border-4 border-black w-full max-w-md shadow-pixel-modal">
        <ModalHeader onClose={onClose} title={t('duel', 'wallet_title')} />

        {/* Current Balance Section */}
        <div className="bg-black text-white py-6">
          <div className="text-center">
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              {t('duel', 'current_balance')}
            </div>

            {/* Balance Display - Changes based on state */}
            {processingState === 'idle' || processingState === 'error' ? (
              <div className="font-pixel text-7xl text-green-500 leading-none">
                ${currentBalance}
              </div>
            ) : processingState === 'processing' ? (
              <div className="flex items-center justify-center gap-4">
                <Loader size={32} className="animate-spin text-yellow-500" />
                <div className="font-pixel text-4xl text-yellow-500">
                  PROCESSING...
                </div>
              </div>
            ) : (
              // Success state - show balance change
              <div className="space-y-2">
                <div className="font-mono text-sm text-gray-400 line-through">
                  ${oldBalance}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <CheckCircle size={32} className="text-green-500" />
                  <div className="font-pixel text-7xl text-green-500 leading-none animate-pulse">
                    ${newBalance}
                  </div>
                </div>
                <div className="font-mono text-xs text-green-500 font-bold">
                  {activeTab === 'DEPOSIT' ? '+' : '-'}${selectedAmount}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {processingState === 'error' && errorMessage && (
          <div className="bg-red-500 text-white py-3 px-4 border-t-2 border-black">
            <div className="font-mono text-xs font-bold text-center uppercase">
              ⚠ {errorMessage}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-t-2 border-black flex">
          <button
            onClick={() => setActiveTab('DEPOSIT')}
            disabled={processingState === 'processing' || processingState === 'success'}
            className={`flex-1 py-3 font-mono text-sm font-bold uppercase border-r border-black transition-colors ${
              activeTab === 'DEPOSIT'
                ? 'bg-white text-black'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            } ${(processingState === 'processing' || processingState === 'success') ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {t('duel', 'deposit')}
          </button>
          <button
            onClick={() => setActiveTab('WITHDRAW')}
            disabled={processingState === 'processing' || processingState === 'success'}
            className={`flex-1 py-3 font-mono text-sm font-bold uppercase transition-colors ${
              activeTab === 'WITHDRAW'
                ? 'bg-white text-black'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            } ${(processingState === 'processing' || processingState === 'success') ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {t('duel', 'withdraw')}
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 bg-gray-50 space-y-4">
          <div className="font-mono text-xs font-bold uppercase tracking-widest text-gray-500">
            {t('duel', 'select_amount')}
          </div>

          {/* Amount Buttons Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[10, 20, 50, 100].map((amount) => (
              <button
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                disabled={processingState === 'processing' || processingState === 'success'}
                className={`border-2 border-black py-4 font-mono text-xl font-bold uppercase transition-all ${
                  selectedAmount === amount
                    ? 'bg-black text-white shadow-pixel'
                    : 'bg-white text-black hover:bg-gray-100'
                } ${(processingState === 'processing' || processingState === 'success') ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {activeTab === 'DEPOSIT' ? '+' : ''}${amount}
              </button>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="text-center pt-2">
            <p className="font-mono text-[10px] text-gray-500">
              * {t('duel', 'payment_note')}
            </p>
          </div>
        </div>

        {/* Confirm Button - Only if amount selected */}
        {selectedAmount !== null && (
          <div className="border-t-2 border-black">
            <button
              onClick={handleConfirm}
              disabled={processingState === 'processing' || processingState === 'success'}
              className={`w-full bg-black text-white hover:bg-gray-800 transition-colors py-4 font-mono text-lg font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${
                (processingState === 'processing' || processingState === 'success') ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {processingState === 'processing' ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  PROCESSING...
                </>
              ) : processingState === 'success' ? (
                <>
                  <CheckCircle size={20} />
                  SUCCESS!
                </>
              ) : activeTab === 'DEPOSIT' ? (
                <>
                  <ArrowDownLeft size={20} />
                  {t('duel', 'confirm_deposit')} ${selectedAmount}
                </>
              ) : (
                <>
                  <ArrowUpRight size={20} />
                  {t('duel', 'confirm_withdraw')} ${selectedAmount}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
