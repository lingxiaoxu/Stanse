import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { NewsItem } from '../types';

interface CompanyRanking {
  company: string;
  score: number;
  alignment: string;
}

interface AppState {
  // Feed View State
  feedNews: NewsItem[];
  feedLoading: boolean;
  feedProgress: number;
  feedError: string | null;

  // Company Ranking State
  companyRankings: CompanyRanking[];
  rankingLoading: boolean;
  rankingProgress: number;
  rankingError: string | null;

  // Fingerprint/Persona State
  personaLoading: boolean;
  personaProgress: number;
  personaError: string | null;
}

interface AppStateContextType extends AppState {
  // Feed methods
  setFeedNews: (news: NewsItem[]) => void;
  setFeedLoading: (loading: boolean) => void;
  setFeedProgress: (progress: number) => void;
  setFeedError: (error: string | null) => void;

  // Company Ranking methods
  setCompanyRankings: (rankings: CompanyRanking[]) => void;
  setRankingLoading: (loading: boolean) => void;
  setRankingProgress: (progress: number) => void;
  setRankingError: (error: string | null) => void;

  // Persona methods
  setPersonaLoading: (loading: boolean) => void;
  setPersonaProgress: (progress: number) => void;
  setPersonaError: (error: string | null) => void;

  // Background loading control
  feedLoadingAbortController: React.MutableRefObject<AbortController | null>;
  rankingLoadingAbortController: React.MutableRefObject<AbortController | null>;
  personaLoadingAbortController: React.MutableRefObject<AbortController | null>;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};

interface AppStateProviderProps {
  children: ReactNode;
}

export const AppStateProvider: React.FC<AppStateProviderProps> = ({ children }) => {
  // Feed View State
  const [feedNews, setFeedNews] = useState<NewsItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedProgress, setFeedProgress] = useState(0);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Company Ranking State
  const [companyRankings, setCompanyRankings] = useState<CompanyRanking[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingProgress, setRankingProgress] = useState(0);
  const [rankingError, setRankingError] = useState<string | null>(null);

  // Persona State
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaProgress, setPersonaProgress] = useState(0);
  const [personaError, setPersonaError] = useState<string | null>(null);

  // AbortControllers for background loading
  const feedLoadingAbortController = useRef<AbortController | null>(null);
  const rankingLoadingAbortController = useRef<AbortController | null>(null);
  const personaLoadingAbortController = useRef<AbortController | null>(null);

  const value: AppStateContextType = {
    // Feed State
    feedNews,
    feedLoading,
    feedProgress,
    feedError,
    setFeedNews,
    setFeedLoading,
    setFeedProgress,
    setFeedError,

    // Company Ranking State
    companyRankings,
    rankingLoading,
    rankingProgress,
    rankingError,
    setCompanyRankings,
    setRankingLoading,
    setRankingProgress,
    setRankingError,

    // Persona State
    personaLoading,
    personaProgress,
    personaError,
    setPersonaLoading,
    setPersonaProgress,
    setPersonaError,

    // AbortControllers
    feedLoadingAbortController,
    rankingLoadingAbortController,
    personaLoadingAbortController,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};