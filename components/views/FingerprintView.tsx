
import React, { useEffect, useState, useRef } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { PoliticalCoordinates } from '../../types';
import { PixelCard } from '../ui/PixelCard';
import { calculatePersona } from '../../services/geminiService';
import { useLanguage } from '../../contexts/LanguageContext';

interface FingerprintViewProps {
  coords: PoliticalCoordinates;
}

export const FingerprintView: React.FC<FingerprintViewProps> = ({ coords }) => {
  const [persona, setPersona] = useState<string>(coords.label);
  const [displayCoords, setDisplayCoords] = useState({
    economic: 0,
    social: 0,
    diplomatic: 0
  });
  // Ghost coords for the "echo" effect during calibration
  const [ghostCoords, setGhostCoords] = useState({
    economic: 0,
    social: 0,
    diplomatic: 0
  });
  
  const { t } = useLanguage();
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const isCalibrating = persona === "Loading..." || persona === "CALIBRATING...";

  // Mock loading sequence & Persona calculation
  useEffect(() => {
    if (coords.label === "Loading...") {
      // Ensure animation runs for at least a few seconds for effect
      const minTime = new Promise(resolve => setTimeout(resolve, 3500));
      const fetchPersona = calculatePersona(coords);

      Promise.all([minTime, fetchPersona]).then(([_, result]) => {
        setPersona(result);
      });
    } else {
      setPersona(coords.label);
    }
  }, [coords]);

  // Animation Loop
  const animate = () => {
    if (isCalibrating) {
      const time = (Date.now() - startTimeRef.current) / 1000;
      
      // Artistic Math: 
      // Main layer: Organic breathing
      // Ghost layer: Rapid jitter / Inverted phase
      
      setDisplayCoords({
        economic: Math.sin(time * 2.5) * 70 + Math.cos(time * 1.2) * 20, 
        social: Math.cos(time * 2) * 60 + Math.sin(time * 3) * 30,
        diplomatic: Math.sin(time * 3.5) * 50 + Math.cos(time * 5) * 10,
      });

      setGhostCoords({
        economic: Math.sin(time * 4 + 1) * 80, 
        social: Math.cos(time * 3 + 2) * 70,
        diplomatic: Math.sin(time * 5 + 0.5) * 60,
      });
      
      requestRef.current = requestAnimationFrame(animate);
    } else {
      // Snap to real values
      setDisplayCoords({
        economic: coords.economic,
        social: coords.social,
        diplomatic: coords.diplomatic
      });
      // Reset ghost to match main so it disappears (or overlaps perfectly)
      setGhostCoords({
        economic: coords.economic,
        social: coords.social,
        diplomatic: coords.diplomatic
      });
      cancelAnimationFrame(requestRef.current);
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isCalibrating, coords]);

  // Transform data for Recharts
  const data = [
    { 
        subject: t('fingerprint', 'econ'), 
        A: displayCoords.economic + 100, 
        B: isCalibrating ? ghostCoords.economic + 100 : 0, // Ghost data
        fullMark: 200 
    },
    { 
        subject: t('fingerprint', 'soc'), 
        A: displayCoords.social + 100, 
        B: isCalibrating ? ghostCoords.social + 100 : 0,
        fullMark: 200 
    },
    { 
        subject: t('fingerprint', 'diplo'), 
        A: displayCoords.diplomatic + 100, 
        B: isCalibrating ? ghostCoords.diplomatic + 100 : 0,
        fullMark: 200 
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-md mx-auto pb-20">
      <div className="text-center mb-10">
        <h2 className="font-pixel text-5xl">{t('fingerprint', 'title')}</h2>
        <p className="font-mono text-xs text-gray-400 uppercase">
            {isCalibrating ? t('fingerprint', 'loading') : t('fingerprint', 'subtitle')}
        </p>
      </div>

      <PixelCard className="flex flex-col items-center p-4 bg-white relative overflow-hidden">
        {/* Background Grid Effect for "Tech" feel */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" 
             style={{backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '10px 10px'}}>
        </div>

        <div className="w-full h-[320px] font-mono text-xs relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            {/* Reduced outerRadius to 60% to prevent label clipping */}
            <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
              <PolarGrid stroke="#e5e5e5" strokeDasharray="4 4" />
              <PolarAngleAxis dataKey="subject" tick={{fill: '#111', fontSize: 11, fontFamily: '"Space Mono", "DotGothic16", monospace', fontWeight: 'bold'}} />
              <PolarRadiusAxis angle={30} domain={[0, 200]} tick={false} axisLine={false} />
              
              {/* Ghost Radar - The "Glitch" / Scan effect */}
              {isCalibrating && (
                <Radar
                    name="Ghost"
                    dataKey="B"
                    stroke="#888"
                    strokeWidth={1}
                    fill="transparent"
                    strokeDasharray="4 4"
                    isAnimationActive={false}
                />
              )}

              {/* Main Radar */}
              <Radar
                name="User"
                dataKey="A"
                stroke={isCalibrating ? "#111" : "#000"}
                strokeWidth={isCalibrating ? 2 : 3}
                fill={isCalibrating ? "#111" : "#000"}
                fillOpacity={isCalibrating ? 0.1 : 0.25}
                isAnimationActive={false} 
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="w-full text-center border-t-2 border-black pt-6 mt-2 relative">
          <span className="block text-[10px] font-mono tracking-widest text-gray-400 mb-2 uppercase">
            {isCalibrating ? t('fingerprint', 'analyzing') : t('fingerprint', 'identified')}
          </span>
          
          {/* Typography unified: Clean, professional, no extra symbols */}
          <h3 className={`font-pixel text-3xl promax:text-4xl uppercase tracking-wide leading-none transition-all duration-500 ${isCalibrating ? 'opacity-50 animate-pulse' : 'opacity-100'}`}>
            {isCalibrating ? (
                t('fingerprint', 'computing')
            ) : persona}
          </h3>
        </div>
      </PixelCard>

      <div className="grid grid-cols-3 gap-3 text-center font-mono text-xs">
        <div className="border-2 border-black p-3 bg-white shadow-pixel hover:-translate-y-1 transition-transform">
          <div className="font-bold mb-1 text-gray-400">{t('fingerprint', 'econ')}</div>
          <div className="text-base font-bold uppercase">
             {isCalibrating ? <span className="animate-pulse">--</span> : (coords.economic > 0 ? t('fingerprint', 'right') : t('fingerprint', 'left'))}
          </div>
        </div>
        <div className="border-2 border-black p-3 bg-white shadow-pixel hover:-translate-y-1 transition-transform">
          <div className="font-bold mb-1 text-gray-400">{t('fingerprint', 'soc')}</div>
          <div className="text-base font-bold uppercase">
            {isCalibrating ? <span className="animate-pulse">--</span> : (coords.social > 0 ? t('fingerprint', 'lib') : t('fingerprint', 'auth'))}
          </div>
        </div>
        <div className="border-2 border-black p-3 bg-white shadow-pixel hover:-translate-y-1 transition-transform">
          <div className="font-bold mb-1 text-gray-400">{t('fingerprint', 'diplo')}</div>
          <div className="text-base font-bold uppercase">
            {isCalibrating ? <span className="animate-pulse">--</span> : (coords.diplomatic > 0 ? t('fingerprint', 'global') : t('fingerprint', 'nat'))}
          </div>
        </div>
      </div>

      <div className="text-center py-6 opacity-60">
        <p className="font-pixel text-xl">"{t('slogan')}"</p>
      </div>
    </div>
  );
};
