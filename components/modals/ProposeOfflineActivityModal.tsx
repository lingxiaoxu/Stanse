import React, { useState } from 'react';
import { X, MapPin, Calendar, Users } from 'lucide-react';
import { Campaign } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface ProposeOfflineActivityModalProps {
  campaign: Campaign;
  onClose: () => void;
  onSubmit: (proposalData: {
    date: string;
    city: string;
    state: string;
    country: string;
    address?: string;
    expectedAttendees?: number;
    description: string;
  }) => Promise<void>;
}

export const ProposeOfflineActivityModal: React.FC<ProposeOfflineActivityModalProps> = ({
  campaign,
  onClose,
  onSubmit
}) => {
  const { t } = useLanguage();
  const [date, setDate] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('USA');
  const [address, setAddress] = useState('');
  const [expectedAttendees, setExpectedAttendees] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    // Validation
    if (!date || !city || !state || !country || !description) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await onSubmit({
        date,
        city,
        state,
        country,
        address: address || undefined,
        expectedAttendees: expectedAttendees ? parseInt(expectedAttendees) : undefined,
        description
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit proposal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-4 border-black p-4 flex justify-between items-start">
          <div className="flex-1">
            <h2 className="font-pixel text-2xl">Propose Offline Activity</h2>
            <div className="font-mono text-xs text-gray-600 mt-1">
              For: {campaign.title}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 transition-colors border-2 border-black"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 border-2 border-black p-4">
            <p className="font-mono text-xs leading-relaxed">
              Propose an offline activity for this campaign. Your proposal will be reviewed and may be approved for display to other participants.
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="flex items-center gap-2 font-mono text-xs font-bold uppercase mb-2">
              <Calendar size={14} />
              Event Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border-2 border-black p-2 font-mono text-sm"
              required
            />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 font-mono text-xs font-bold uppercase mb-2">
                <MapPin size={14} />
                City *
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="San Francisco"
                className="w-full border-2 border-black p-2 font-mono text-sm"
                required
              />
            </div>
            <div>
              <label className="font-mono text-xs font-bold uppercase mb-2 block">
                State/Province *
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="CA"
                className="w-full border-2 border-black p-2 font-mono text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono text-xs font-bold uppercase mb-2 block">
                Country *
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="USA"
                className="w-full border-2 border-black p-2 font-mono text-sm"
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-2 font-mono text-xs font-bold uppercase mb-2">
                <Users size={14} />
                Expected Attendees
              </label>
              <input
                type="number"
                value={expectedAttendees}
                onChange={(e) => setExpectedAttendees(e.target.value)}
                placeholder="50"
                className="w-full border-2 border-black p-2 font-mono text-sm"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="font-mono text-xs font-bold uppercase mb-2 block">
              Venue Address (Optional)
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main Street"
              className="w-full border-2 border-black p-2 font-mono text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label className="font-mono text-xs font-bold uppercase mb-2 block">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the planned activity, goals, and any additional details..."
              className="w-full border-2 border-black p-2 font-mono text-sm h-32 resize-none"
              required
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-500 p-3">
              <p className="font-mono text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t-4 border-black p-4">
          <div className="flex gap-4">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 border-2 border-black bg-white hover:bg-gray-100 transition-colors py-3 font-mono text-sm font-bold uppercase disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 border-2 border-black bg-black text-white hover:bg-gray-800 transition-colors py-3 font-mono text-sm font-bold uppercase disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Proposal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
