import React, { useState, useEffect } from 'react';
import { CreditCard, Tag, AlertCircle } from 'lucide-react';
import { PixelButton } from './PixelButton';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  validateCardNumber,
  detectCardType,
  validateExpiry
} from '../../services/subscriptionService';

interface PaymentFormProps {
  onSubmit: (
    paymentInfo?: {
      cardholderName: string;
      cardNumber: string;
      cardType: 'Visa' | 'Mastercard' | 'Amex';
      expiry: string;
      cvv: string;
      billingZip: string;
    },
    promoCode?: string,
    savePayment?: boolean
  ) => Promise<void>;
  isLoading?: boolean;
  disablePromoCode?: boolean; // Disable promo code for already subscribed users
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  onSubmit,
  isLoading = false,
  disablePromoCode = false
}) => {
  const { t } = useLanguage();

  // Payment fields
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [savePayment, setSavePayment] = useState(false);

  // Promo code field
  const [promoCode, setPromoCode] = useState('');

  // Validation states
  const [cardNumberError, setCardNumberError] = useState('');
  const [expiryError, setExpiryError] = useState('');
  const [cvvError, setCvvError] = useState('');
  const [cardType, setCardType] = useState<'Visa' | 'Mastercard' | 'Amex' | null>(null);

  // Detect card type and validate card number on change
  useEffect(() => {
    if (cardNumber.length > 0) {
      const type = detectCardType(cardNumber);
      setCardType(type);

      // Only validate if user has entered enough digits
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length >= 13) {
        if (!validateCardNumber(cardNumber)) {
          setCardNumberError(t('menu', 'invalid_card'));
        } else {
          setCardNumberError('');
        }
      } else {
        setCardNumberError('');
      }
    } else {
      setCardType(null);
      setCardNumberError('');
    }
  }, [cardNumber, t]);

  // Validate expiry on change
  useEffect(() => {
    if (expiry.length === 5) {
      if (!validateExpiry(expiry)) {
        setExpiryError(t('menu', 'invalid_expiry'));
      } else {
        setExpiryError('');
      }
    } else {
      setExpiryError('');
    }
  }, [expiry, t]);

  // Validate CVV on change
  useEffect(() => {
    if (cvv.length > 0) {
      const expectedLength = cardType === 'Amex' ? 4 : 3;
      if (cvv.length !== expectedLength) {
        setCvvError(`${t('menu', 'cvv_must_be')} ${expectedLength} ${t('menu', 'cvv_digits')}`);
      } else {
        setCvvError('');
      }
    } else {
      setCvvError('');
    }
  }, [cvv, cardType, t]);

  // Format card number with spaces
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    let formatted = value;

    // Format based on card type
    if (cardType === 'Amex') {
      // Amex: 4-6-5
      if (value.length > 4) {
        formatted = value.slice(0, 4) + ' ' + value.slice(4, 10) + (value.length > 10 ? ' ' + value.slice(10, 15) : '');
      }
    } else {
      // Visa/MC: 4-4-4-4
      formatted = value.match(/.{1,4}/g)?.join(' ') || value;
    }

    setCardNumber(formatted.slice(0, 19)); // Max length
  };

  // Format expiry as MM/YY
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 2) {
      setExpiry(value);
    } else {
      setExpiry(value.slice(0, 2) + '/' + value.slice(2, 4));
    }
  };

  // Handle CVV input
  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    const maxLength = cardType === 'Amex' ? 4 : 3;
    setCvv(value.slice(0, maxLength));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if using promo code
    const usingPromoCode = promoCode.trim().length > 0;

    // Validation
    if (!usingPromoCode) {
      // If not using promo code, validate all card fields
      if (!cardholderName.trim()) {
        alert(t('menu', 'alert_enter_name'));
        return;
      }
      if (!cardNumber || cardNumberError) {
        alert(t('menu', 'alert_valid_card'));
        return;
      }
      if (!expiry || expiryError) {
        alert(t('menu', 'alert_valid_expiry'));
        return;
      }
      if (!cvv || cvvError) {
        alert(t('menu', 'alert_valid_cvv'));
        return;
      }
      if (!billingZip.trim()) {
        alert(t('menu', 'alert_billing_zip'));
        return;
      }
      if (!cardType) {
        alert(t('menu', 'alert_unsupported_card'));
        return;
      }
    }

    // Prepare payment info (only if not using promo code)
    const paymentInfo = !usingPromoCode && cardType ? {
      cardholderName: cardholderName.trim(),
      cardNumber: cardNumber.replace(/\s/g, ''),
      cardType,
      expiry,
      cvv,
      billingZip: billingZip.trim()
    } : undefined;

    // Call onSubmit
    await onSubmit(
      paymentInfo,
      usingPromoCode ? promoCode.trim().toUpperCase() : undefined,
      savePayment
    );
  };

  const hasPromoCode = promoCode.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Promotion Code Section */}
      <div className={`border-2 border-black p-3 ${disablePromoCode ? 'bg-gray-200 opacity-60' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Tag size={16} className={disablePromoCode ? 'text-gray-400' : ''} />
          <label className="font-mono text-xs font-bold uppercase">
            {t('menu', 'promo_code')} {disablePromoCode && t('menu', 'promo_only_new')}
          </label>
        </div>
        <input
          type="text"
          value={promoCode}
          onChange={(e) => !disablePromoCode && setPromoCode(e.target.value.toUpperCase())}
          placeholder={disablePromoCode ? t('menu', 'promo_not_available') : t('menu', 'promo_enter_code')}
          className={`w-full border-2 p-2 font-mono uppercase ${
            disablePromoCode
              ? 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'border-black bg-white'
          }`}
          maxLength={20}
          disabled={isLoading || disablePromoCode}
        />
        <p className="font-mono text-xs text-gray-500 mt-1">
          {disablePromoCode
            ? t('menu', 'promo_can_only_first')
            : hasPromoCode
            ? t('menu', 'promo_using_optional')
            : t('menu', 'promo_leave_blank')}
        </p>
      </div>

      {/* Card Information Section */}
      <div className={`space-y-4 ${hasPromoCode ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard size={16} />
          <h3 className="font-mono text-xs font-bold uppercase">
            {hasPromoCode ? t('menu', 'card_info_optional') : t('menu', 'card_info')}
          </h3>
        </div>

        {/* Cardholder Name */}
        <div className="space-y-2">
          <label className="font-mono text-xs font-bold block uppercase">{t('menu', 'card_name')}</label>
          <input
            type="text"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            placeholder="JOHN DOE"
            className="w-full border-2 border-black p-3 font-mono bg-white uppercase"
            disabled={isLoading || hasPromoCode}
          />
        </div>

        {/* Card Number */}
        <div className="space-y-2">
          <label className="font-mono text-xs font-bold block uppercase">{t('menu', 'card_number')}</label>
          <div className="relative">
            <input
              type="text"
              value={cardNumber}
              onChange={handleCardNumberChange}
              placeholder="4242 4242 4242 4242"
              className={`w-full border-2 p-3 font-mono bg-white ${
                cardNumberError ? 'border-alert-red' : 'border-black'
              }`}
              disabled={isLoading || hasPromoCode}
            />
            {cardType && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold bg-yellow-100 px-2 py-1 border border-yellow-600">
                {cardType}
              </span>
            )}
          </div>
          {cardNumberError && (
            <div className="flex items-center gap-1 text-alert-red font-mono text-xs">
              <AlertCircle size={12} />
              {cardNumberError}
            </div>
          )}
        </div>

        {/* Expiry and CVV */}
        <div className="grid grid-cols-2 gap-4">
          {/* Expiry Date */}
          <div className="space-y-2">
            <label className="font-mono text-xs font-bold block uppercase">{t('menu', 'card_expiry')}</label>
            <input
              type="text"
              value={expiry}
              onChange={handleExpiryChange}
              placeholder="12/25"
              className={`w-full border-2 p-3 font-mono bg-white ${
                expiryError ? 'border-alert-red' : 'border-black'
              }`}
              disabled={isLoading || hasPromoCode}
            />
            {expiryError && (
              <div className="flex items-center gap-1 text-alert-red font-mono text-xs">
                <AlertCircle size={12} />
                {expiryError}
              </div>
            )}
          </div>

          {/* CVV */}
          <div className="space-y-2">
            <label className="font-mono text-xs font-bold block uppercase">
              {t('menu', 'card_cvv')} {cardType === 'Amex' && t('menu', 'amex_4_digits')}
            </label>
            <input
              type="text"
              value={cvv}
              onChange={handleCvvChange}
              placeholder={cardType === 'Amex' ? '1234' : '123'}
              className={`w-full border-2 p-3 font-mono bg-white ${
                cvvError ? 'border-alert-red' : 'border-black'
              }`}
              disabled={isLoading || hasPromoCode}
            />
            {cvvError && (
              <div className="flex items-center gap-1 text-alert-red font-mono text-xs">
                <AlertCircle size={12} />
                {cvvError}
              </div>
            )}
          </div>
        </div>

        {/* Billing ZIP */}
        <div className="space-y-2">
          <label className="font-mono text-xs font-bold block uppercase">{t('menu', 'billing_zip')}</label>
          <input
            type="text"
            value={billingZip}
            onChange={(e) => setBillingZip(e.target.value)}
            placeholder="12345"
            className="w-full border-2 border-black p-3 font-mono bg-white"
            disabled={isLoading || hasPromoCode}
            maxLength={10}
          />
        </div>

        {/* Save Payment Method */}
        {!hasPromoCode && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="savePayment"
              checked={savePayment}
              onChange={(e) => setSavePayment(e.target.checked)}
              className="w-4 h-4 border-2 border-black"
              disabled={isLoading}
            />
            <label htmlFor="savePayment" className="font-mono text-xs">
              {t('menu', 'save_payment')}
            </label>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <PixelButton
        type="submit"
        variant="primary"
        isLoading={isLoading}
        className="w-full py-4 text-lg uppercase"
      >
        {hasPromoCode ? t('menu', 'activate_promo') : t('menu', 'confirm_charge')}
      </PixelButton>

      {/* Security Notice */}
      <p className="font-mono text-xs text-gray-500 text-center">
        {t('menu', 'payment_secure')}
      </p>
    </form>
  );
};
