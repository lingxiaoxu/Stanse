import React, { useState, useEffect } from 'react';
import { X, Target, Calendar, MapPin, Scale, Gavel, Phone, Users, CheckCircle, XCircle } from 'lucide-react';
import { Campaign } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getProposalsForCampaign,
  approveProposal,
  rejectProposal,
  OfflineActivityProposal
} from '../../services/offlineActivityProposalService';

interface CampaignDetailModalProps {
  campaign: Campaign;
  onClose: () => void;
  onAmplify?: () => void;
  onProposeActivity?: () => void;
}

export const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({
  campaign,
  onClose,
  onAmplify,
  onProposeActivity
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [proposals, setProposals] = useState<OfflineActivityProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [processingProposal, setProcessingProposal] = useState<string | null>(null);

  // Check if user is admin (for now, just a simple check - you can enhance this)
  const isAdmin = user?.email?.includes('admin') || false;

  // Fetch proposals for this campaign
  useEffect(() => {
    const fetchProposals = async () => {
      setLoadingProposals(true);
      try {
        const campaignProposals = await getProposalsForCampaign(campaign.baseId);
        setProposals(campaignProposals);
      } catch (error) {
        console.error('[Campaign Detail] Error fetching proposals:', error);
      } finally {
        setLoadingProposals(false);
      }
    };

    if (campaign.baseId) {
      fetchProposals();
    }
  }, [campaign.baseId]);

  // Handle approve proposal
  const handleApproveProposal = async (proposalId: string) => {
    if (!user?.uid) return;

    setProcessingProposal(proposalId);
    try {
      await approveProposal(proposalId, user.uid);
      // Refresh proposals
      const updatedProposals = await getProposalsForCampaign(campaign.baseId);
      setProposals(updatedProposals);
    } catch (error) {
      console.error('[Campaign Detail] Error approving proposal:', error);
      alert('Failed to approve proposal');
    } finally {
      setProcessingProposal(null);
    }
  };

  // Handle reject proposal
  const handleRejectProposal = async (proposalId: string) => {
    if (!user?.uid) return;

    setProcessingProposal(proposalId);
    try {
      await rejectProposal(proposalId, user.uid);
      // Refresh proposals
      const updatedProposals = await getProposalsForCampaign(campaign.baseId);
      setProposals(updatedProposals);
    } catch (error) {
      console.error('[Campaign Detail] Error rejecting proposal:', error);
      alert('Failed to reject proposal');
    } finally {
      setProcessingProposal(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-4 border-black p-4 flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 text-xs font-mono font-bold ${
                campaign.type === 'BOYCOTT' ? 'bg-black text-white' : 'bg-white text-black border-2 border-black'
              }`}>
                {campaign.type}
              </span>
              <span className="px-2 py-1 text-xs font-mono font-bold bg-gray-200 text-black">
                {campaign.targetType}
              </span>
            </div>
            <h2 className="font-pixel text-2xl">{campaign.title}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm font-mono text-gray-600">
              <Target size={14} />
              <span>{campaign.target}</span>
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
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Description
            </h3>
            <p className="font-mono text-sm leading-relaxed">{campaign.description}</p>
          </div>

          {/* Progress */}
          <div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Progress
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-mono font-bold">
                <span>{campaign.participants.toLocaleString()} Participants</span>
                <span>Goal: {campaign.goal.toLocaleString()}</span>
              </div>
              <div className="w-full h-6 border-2 border-black p-1 bg-white">
                <div
                  className="h-full bg-black pattern-diagonal-lines"
                  style={{ width: `${Math.min((campaign.participants / campaign.goal) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* For Sector Campaigns: Show Companies */}
          {campaign.targetType === 'SECTOR' && campaign.companiesInSector && campaign.companiesInSector.length > 0 && (
            <div>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Companies in {campaign.target} Sector ({campaign.companiesInSector.length})
              </h3>
              <div className="border-2 border-black p-4 bg-gray-50 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {campaign.companiesInSector.map((company, index) => (
                    <div key={index} className="font-mono text-xs">
                      • {company}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Metadata Section */}
          {campaign.metadata && (
            <>
              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar size={14} />
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
                      Start Date
                    </h3>
                  </div>
                  <p className="font-mono text-sm">{formatDate(campaign.metadata.startDate)}</p>
                </div>
                {campaign.metadata.endDate && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={14} />
                      <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
                        End Date
                      </h3>
                    </div>
                    <p className="font-mono text-sm">{formatDate(campaign.metadata.endDate)}</p>
                  </div>
                )}
              </div>

              {/* Financial Impact */}
              <div>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Financial Impact
                </h3>
                <div className="grid grid-cols-2 gap-4 border-2 border-black p-4 bg-gray-50">
                  <div>
                    <div className="font-mono text-xs text-gray-500">Total Boycott</div>
                    <div className="font-pixel text-xl">{formatCurrency(campaign.metadata.totalBoycottAmount)}</div>
                  </div>
                  <div>
                    <div className="font-mono text-xs text-gray-500">Total Buycott</div>
                    <div className="font-pixel text-xl">{formatCurrency(campaign.metadata.totalBuycottAmount)}</div>
                  </div>
                </div>
              </div>

              {/* Goals */}
              {campaign.metadata.goals && campaign.metadata.goals.length > 0 && (
                <div>
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Campaign Goals
                  </h3>
                  <ul className="space-y-2">
                    {campaign.metadata.goals.map((goal, index) => (
                      <li key={index} className="font-mono text-sm flex items-start gap-2">
                        <span className="text-black font-bold">•</span>
                        <span>{goal}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Political Statement */}
              {campaign.metadata.politicalStatement && (
                <div>
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Political Statement
                  </h3>
                  <div className="border-2 border-black p-4 bg-yellow-50">
                    <p className="font-mono text-sm leading-relaxed italic">
                      {campaign.metadata.politicalStatement}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Offline Activity Section */}
          {campaign.offlineActivity?.hasProposal && (
            <div className="border-4 border-black p-4 bg-blue-50">
              <h3 className="font-pixel text-xl mb-4">Offline Activity</h3>

              {/* Legal Compliance */}
              {campaign.offlineActivity.isLegallyCompliant !== undefined && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Scale size={14} />
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider">
                      Legal Compliance
                    </h4>
                  </div>
                  <span className={`px-2 py-1 text-xs font-mono font-bold ${
                    campaign.offlineActivity.isLegallyCompliant
                      ? 'bg-green-500 text-white'
                      : 'bg-red-500 text-white'
                  }`}>
                    {campaign.offlineActivity.isLegallyCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
                  </span>
                </div>
              )}

              {/* Events */}
              {campaign.offlineActivity.events && campaign.offlineActivity.events.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={14} />
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider">
                      Events ({campaign.offlineActivity.events.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {campaign.offlineActivity.events.map((event) => (
                      <div key={event.id} className="border-2 border-black p-3 bg-white">
                        <div className="font-mono text-sm font-bold">{formatDate(event.date)}</div>
                        <div className="font-mono text-xs text-gray-600">
                          {event.city}, {event.state}, {event.country}
                        </div>
                        {event.attendees && (
                          <div className="font-mono text-xs text-gray-600 flex items-center gap-1 mt-1">
                            <Users size={12} />
                            {event.attendees} attendees
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Legal Counsel */}
              {campaign.offlineActivity.legalCounsel && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gavel size={14} />
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider">
                      Legal Counsel
                    </h4>
                  </div>
                  <div className="border-2 border-black p-3 bg-white font-mono text-xs space-y-1">
                    <div className="font-bold">{campaign.offlineActivity.legalCounsel.name}</div>
                    <div>{campaign.offlineActivity.legalCounsel.firm}</div>
                    <div className="text-gray-600">
                      {campaign.offlineActivity.legalCounsel.city}, {campaign.offlineActivity.legalCounsel.state}, {campaign.offlineActivity.legalCounsel.country}
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone size={12} />
                      {campaign.offlineActivity.legalCounsel.phone}
                    </div>
                  </div>
                </div>
              )}

              {/* Police Info */}
              {campaign.offlineActivity.policeInfo && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Phone size={14} />
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider">
                      Police Department
                    </h4>
                  </div>
                  <div className="border-2 border-black p-3 bg-white font-mono text-xs space-y-1">
                    <div className="font-bold">{campaign.offlineActivity.policeInfo.department}</div>
                    <div>{campaign.offlineActivity.policeInfo.address}</div>
                    <div className="text-gray-600">
                      {campaign.offlineActivity.policeInfo.city}, {campaign.offlineActivity.policeInfo.state}, {campaign.offlineActivity.policeInfo.country}
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone size={12} />
                      {campaign.offlineActivity.policeInfo.phone}
                    </div>
                    {campaign.offlineActivity.policeInfo.emergencyContact && (
                      <div className="text-red-600 font-bold">
                        Emergency: {campaign.offlineActivity.policeInfo.emergencyContact}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending Proposals Section (for admins) */}
          {isAdmin && proposals.length > 0 && (
            <div className="border-4 border-purple-600 p-4 bg-purple-50 mt-6">
              <h3 className="font-pixel text-xl mb-4 text-purple-600">
                Pending Proposals ({proposals.filter(p => p.status === 'pending').length})
              </h3>
              <div className="space-y-3">
                {proposals
                  .filter(p => p.status === 'pending')
                  .map((proposal) => (
                    <div key={proposal.id} className="border-2 border-purple-600 p-3 bg-white">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-mono text-xs font-bold">
                          {formatDate(proposal.proposedEvent.date)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => proposal.id && handleApproveProposal(proposal.id)}
                            disabled={processingProposal === proposal.id}
                            className="p-1 border-2 border-green-600 bg-green-50 hover:bg-green-100 disabled:opacity-50"
                            title="Approve"
                          >
                            <CheckCircle size={16} className="text-green-600" />
                          </button>
                          <button
                            onClick={() => proposal.id && handleRejectProposal(proposal.id)}
                            disabled={processingProposal === proposal.id}
                            className="p-1 border-2 border-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                            title="Reject"
                          >
                            <XCircle size={16} className="text-red-600" />
                          </button>
                        </div>
                      </div>
                      <div className="font-mono text-xs text-gray-600 mb-2">
                        <MapPin size={12} className="inline mr-1" />
                        {proposal.proposedEvent.city}, {proposal.proposedEvent.state}, {proposal.proposedEvent.country}
                      </div>
                      {proposal.proposedEvent.expectedAttendees && (
                        <div className="font-mono text-xs text-gray-600 mb-2">
                          <Users size={12} className="inline mr-1" />
                          Expected: {proposal.proposedEvent.expectedAttendees} attendees
                        </div>
                      )}
                      <div className="font-mono text-xs bg-gray-50 p-2 border border-gray-300">
                        {proposal.description}
                      </div>
                      <div className="font-mono text-[10px] text-gray-500 mt-2">
                        Submitted: {formatDate(proposal.createdAt)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Loading Proposals */}
          {loadingProposals && (
            <div className="text-center py-4 font-mono text-xs text-gray-500">
              Loading proposals...
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t-4 border-black p-4 space-y-2">
          {/* Propose Offline Activity Button */}
          {onProposeActivity && (
            <button
              onClick={() => {
                onProposeActivity();
                onClose();
              }}
              className="w-full border-2 border-blue-600 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors py-2 font-mono text-xs font-bold uppercase"
            >
              📍 Propose Offline Activity
            </button>
          )}

          {/* Main Actions */}
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 border-2 border-black bg-white hover:bg-gray-100 transition-colors py-3 font-mono text-sm font-bold uppercase"
            >
              Close
            </button>
            {onAmplify && (
              <button
                onClick={() => {
                  onAmplify();
                  onClose();
                }}
                className="flex-1 border-2 border-black bg-black text-white hover:bg-gray-800 transition-colors py-3 font-mono text-sm font-bold uppercase"
              >
                Amplify Impact
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
