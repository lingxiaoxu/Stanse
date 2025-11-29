import React, { useState } from 'react';
import { X, ShieldCheck, Zap, Loader } from 'lucide-react';
import { Campaign } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface LogActionModalProps {
  campaign: Campaign;
  onClose: () => void;
  onSubmit: (actionType: 'BOYCOTT' | 'BUYCOTT', amount: number) => Promise<void>;
}

type SubmissionStage = 'input' | 'generating' | 'broadcasting' | 'success' | 'error';

export const LogActionModal: React.FC<LogActionModalProps> = ({
  campaign,
  onClose,
  onSubmit
}) => {
  const { t } = useLanguage();
  const [actionType, setActionType] = useState<'BOYCOTT' | 'BUYCOTT'>(campaign.type as 'BOYCOTT' | 'BUYCOTT');
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState<SubmissionStage>('input');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    try {
      // Stage 1: Generate ZK Proof
      setStage('generating');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate ZK proof generation

      // Stage 2: Broadcast to network
      setStage('broadcasting');
      await onSubmit(actionType, Math.round(parseFloat(amount) * 100)); // Convert to cents

      // Stage 3: Success
      setStage('success');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      setStage('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit action');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black max-w-md w-full relative shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-gray-100 transition-colors"
          disabled={stage === 'generating' || stage === 'broadcasting'}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="p-6 border-b-2 border-black bg-gray-50">
          <h2 className="font-pixel text-2xl pr-8">LOG ACTION</h2>
          <p className="font-mono text-xs text-gray-500 mt-2 uppercase">
            {campaign.title}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {stage === 'input' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Privacy Notice */}
              <div className="bg-yellow-50 border-2 border-yellow-300 p-3">
                <p className="font-mono text-xs leading-relaxed text-yellow-900">
                  This data is used locally to estimate your impact and generate a zero-knowledge proof. Your identity and action details remain private.
                </p>
              </div>

              {/* Action Type Selection */}
              <div className="space-y-3">
                <label className="font-mono text-xs font-bold uppercase tracking-wider block">
                  Action Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setActionType('BOYCOTT')}
                    className={`
                      p-4 border-2 border-black flex flex-col items-center gap-2 transition-all
                      ${actionType === 'BOYCOTT'
                        ? 'bg-black text-white'
                        : 'bg-white text-black hover:bg-gray-50'
                      }
                    `}
                  >
                    <ShieldCheck size={24} />
                    <span className="font-mono text-xs font-bold">BOYCOTT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType('BUYCOTT')}
                    className={`
                      p-4 border-2 border-black flex flex-col items-center gap-2 transition-all
                      ${actionType === 'BUYCOTT'
                        ? 'bg-black text-white'
                        : 'bg-white text-black hover:bg-gray-50'
                      }
                    `}
                  >
                    <Zap size={24} />
                    <span className="font-mono text-xs font-bold">BUYCOTT</span>
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <label className="font-mono text-xs font-bold uppercase tracking-wider block">
                  Estimated Value (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-pixel text-2xl">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-12 pr-4 py-3 border-2 border-black font-pixel text-2xl focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <p className="font-mono text-[10px] text-gray-500">
                  Approximate value diverted from {actionType === 'BOYCOTT' ? 'boycotted' : 'supported'} entity
                </p>
              </div>

              {errorMessage && (
                <div className="bg-red-50 border-2 border-red-300 p-3">
                  <p className="font-mono text-xs text-red-900">{errorMessage}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-4 bg-black text-white border-2 border-black hover:bg-gray-900 transition-colors font-mono text-sm font-bold uppercase tracking-wider"
              >
                SUBMIT ACTION
              </button>
            </form>
          )}

          {stage === 'generating' && (
            <div className="py-12 text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <Loader size={48} className="animate-spin text-black" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-pixel text-xl">Generating Proof</h3>
                <p className="font-mono text-xs text-gray-600 max-w-xs mx-auto">
                  Your identity and action details are being anonymized using zero-knowledge cryptography...
                </p>
              </div>
            </div>
          )}

          {stage === 'broadcasting' && (
            <div className="py-12 text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-black rounded-full flex items-center justify-center">
                    <div className="w-3 h-3 bg-black rounded-full animate-ping"></div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-pixel text-xl">Broadcasting</h3>
                <p className="font-mono text-xs text-gray-600 max-w-xs mx-auto">
                  Waiting for network consensus from allied nodes...
                </p>
              </div>
            </div>
          )}

          {stage === 'success' && (
            <div className="py-12 text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-500 border-4 border-black rounded-full flex items-center justify-center">
                  <ShieldCheck size={32} className="text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-pixel text-xl text-green-600">Impact Verified!</h3>
                <p className="font-mono text-xs text-gray-600">
                  Your contribution has been added to the collective ledger.
                </p>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="py-12 text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-500 border-4 border-black rounded-full flex items-center justify-center">
                  <X size={32} className="text-white" />
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-pixel text-xl text-red-600">Submission Failed</h3>
                <p className="font-mono text-xs text-gray-600 max-w-xs mx-auto">
                  {errorMessage}
                </p>
                <button
                  onClick={() => {
                    setStage('input');
                    setErrorMessage('');
                  }}
                  className="px-6 py-2 bg-black text-white border-2 border-black hover:bg-gray-900 transition-colors font-mono text-xs font-bold uppercase"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
