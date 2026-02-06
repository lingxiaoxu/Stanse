import React, { useState } from 'react';
import { X, MapPin, AlertTriangle, Newspaper, ChevronLeft, ChevronRight } from 'lucide-react';
import { GlobeMarker } from '../../services/globeService';
import { useLanguage } from '../../contexts/LanguageContext';

interface MarkerDetailModalProps {
  marker: GlobeMarker;
  onClose: () => void;
  onNavigate?: (feedIndex: number, newsId: string) => void;
}

export const MarkerDetailModal: React.FC<MarkerDetailModalProps> = ({
  marker,
  onClose,
  onNavigate
}) => {
  const { t } = useLanguage();

  // 获取要显示的标记列表（聚合或单个）
  const markersToShow = marker.clusteredMarkers || [marker];
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentMarker = markersToShow[currentIndex];
  const hasMultiple = markersToShow.length > 1;

  const getMarkerIcon = (m: GlobeMarker) => {
    switch (m.type) {
      case 'NEWS':
      case 'BREAKING':
        return <Newspaper size={16} />;
      case 'CONFLICT':
        return <AlertTriangle size={16} />;
      default:
        return <MapPin size={16} />;
    }
  };

  const getMarkerColor = (m: GlobeMarker) => {
    switch (m.type) {
      case 'BREAKING':
      case 'CONFLICT':
        return 'border-red-500 bg-red-50';
      case 'NEWS':
        return 'border-blue-500 bg-blue-50';
      case 'USER_BIRTH':
      case 'USER_CURRENT':
        return 'border-green-500 bg-green-50';
      case 'SEARCH_RESULT':
        return 'border-orange-500 bg-orange-50';
      default:
        return 'border-gray-500 bg-gray-50';
    }
  };

  const getMarkerTypeLabel = (m: GlobeMarker) => {
    switch (m.type) {
      case 'NEWS':
        return t('sense', 'marker_news');
      case 'BREAKING':
        return t('sense', 'marker_breaking');
      case 'CONFLICT':
        return t('sense', 'marker_conflict');
      case 'USER_BIRTH':
        return t('sense', 'marker_birth');
      case 'USER_CURRENT':
        return t('sense', 'marker_current');
      case 'SEARCH_RESULT':
        return t('sense', 'marker_search');
      default:
        return String(m.type).replace('_', ' ');
    }
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : markersToShow.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < markersToShow.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className={`relative bg-white border-4 ${getMarkerColor(currentMarker)} shadow-pixel max-w-md w-full animate-fade-in`}>
        {/* Header */}
        <div className="bg-black text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {getMarkerIcon(currentMarker)}
            <span className="font-pixel text-sm uppercase">{getMarkerTypeLabel(currentMarker)}</span>
            {hasMultiple && (
              <span className="font-mono text-[10px] opacity-70">
                ({currentIndex + 1}/{markersToShow.length})
              </span>
            )}
          </div>
          <button onClick={onClose} className="hover:opacity-70">
            <X size={18} />
          </button>
        </div>

        {/* Navigation arrows for multiple markers */}
        {hasMultiple && (
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none z-10">
            <button
              onClick={goToPrev}
              className="pointer-events-auto w-8 h-8 bg-black/80 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goToNext}
              className="pointer-events-auto w-8 h-8 bg-black/80 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <div className="font-pixel text-xl mb-2">{currentMarker.title}</div>
            <p className="font-mono text-xs text-gray-600">{currentMarker.summary}</p>
          </div>

          {currentMarker.metadata?.country && (
            <div className="border-t-2 border-black/10 pt-4">
              <div className="font-mono text-[10px] uppercase text-gray-500 mb-1">
                {t('sense', 'marker_location')}
              </div>
              <div className="font-mono text-xs">
                {[currentMarker.metadata.city, currentMarker.metadata.state, currentMarker.metadata.country]
                  .filter(Boolean)
                  .join(', ')}
              </div>
              <div className="font-mono text-[10px] text-gray-400 mt-1">
                {currentMarker.coordinates.latitude.toFixed(4)}°, {currentMarker.coordinates.longitude.toFixed(4)}°
              </div>
            </div>
          )}

          {currentMarker.severity && (
            <div className="border-t-2 border-black/10 pt-4">
              <div className="font-mono text-[10px] uppercase text-gray-500 mb-1">
                {t('sense', 'marker_severity')}
              </div>
              <div className={`inline-block px-3 py-1 font-mono text-xs font-bold border-2 ${
                currentMarker.severity === 'CRITICAL' ? 'border-red-600 bg-red-100 text-red-700' :
                currentMarker.severity === 'HIGH' ? 'border-orange-600 bg-orange-100 text-orange-700' :
                'border-yellow-600 bg-yellow-100 text-yellow-700'
              }`}>
                {currentMarker.severity}
              </div>
            </div>
          )}
        </div>

        {/* Dots indicator for multiple markers */}
        {hasMultiple && (
          <div className="flex justify-center gap-1.5 pb-2">
            {markersToShow.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-black' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        {currentMarker.feedIndex !== undefined && currentMarker.navigationTarget && onNavigate && (
          <div className="border-t-2 border-black p-4">
            <button
              onClick={() => {
                onNavigate(currentMarker.feedIndex!, currentMarker.navigationTarget!);
                onClose();
              }}
              className="w-full py-3 bg-black text-white font-mono text-xs uppercase hover:bg-gray-800 transition-colors"
            >
              {t('sense', 'marker_view_article')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
