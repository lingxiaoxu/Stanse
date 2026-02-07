// Portfolio Chart i18n translations
// Supports: EN, ZH, JA, FR, ES

export type Language = 'EN' | 'ZH' | 'JA' | 'FR' | 'ES';

export const LANGUAGE_OPTIONS: { code: Language; label: string; flag: string }[] = [
  { code: 'EN', label: 'English', flag: '🇺🇸' },
  { code: 'ZH', label: '中文', flag: '🇨🇳' },
  { code: 'JA', label: '日本語', flag: '🇯🇵' },
  { code: 'FR', label: 'Français', flag: '🇫🇷' },
  { code: 'ES', label: 'Español', flag: '🇪🇸' },
];

// Political value name translations (formerly "persona")
export const PERSONA_NAMES: Record<Language, Record<string, string>> = {
  EN: {
    'progressive-globalist': 'Progressive Globalist',
    'progressive-nationalist': 'Progressive Nationalist',
    'socialist-libertarian': 'Socialist Libertarian',
    'socialist-nationalist': 'Socialist Nationalist',
    'capitalist-globalist': 'Capitalist Globalist',
    'capitalist-nationalist': 'Capitalist Nationalist',
    'conservative-globalist': 'Conservative Globalist',
    'conservative-nationalist': 'Conservative Nationalist',
  },
  ZH: {
    'progressive-globalist': '进步全球主义',
    'progressive-nationalist': '进步民族主义',
    'socialist-libertarian': '社会主义自由派',
    'socialist-nationalist': '社会主义民族派',
    'capitalist-globalist': '资本主义全球派',
    'capitalist-nationalist': '资本主义民族派',
    'conservative-globalist': '保守全球主义',
    'conservative-nationalist': '保守民族主义',
  },
  JA: {
    'progressive-globalist': '進歩的グローバリスト',
    'progressive-nationalist': '進歩的ナショナリスト',
    'socialist-libertarian': '社会主義リバタリアン',
    'socialist-nationalist': '社会主義ナショナリスト',
    'capitalist-globalist': '資本主義グローバリスト',
    'capitalist-nationalist': '資本主義ナショナリスト',
    'conservative-globalist': '保守グローバリスト',
    'conservative-nationalist': '保守ナショナリスト',
  },
  FR: {
    'progressive-globalist': 'Progressiste Mondialiste',
    'progressive-nationalist': 'Progressiste Nationaliste',
    'socialist-libertarian': 'Socialiste Libertarien',
    'socialist-nationalist': 'Socialiste Nationaliste',
    'capitalist-globalist': 'Capitaliste Mondialiste',
    'capitalist-nationalist': 'Capitaliste Nationaliste',
    'conservative-globalist': 'Conservateur Mondialiste',
    'conservative-nationalist': 'Conservateur Nationaliste',
  },
  ES: {
    'progressive-globalist': 'Progresista Globalista',
    'progressive-nationalist': 'Progresista Nacionalista',
    'socialist-libertarian': 'Socialista Libertario',
    'socialist-nationalist': 'Socialista Nacionalista',
    'capitalist-globalist': 'Capitalista Globalista',
    'capitalist-nationalist': 'Capitalista Nacionalista',
    'conservative-globalist': 'Conservador Globalista',
    'conservative-nationalist': 'Conservador Nacionalista',
  },
};

// UI text translations
export const UI_TEXT: Record<Language, Record<string, string>> = {
  EN: {
    // Page title
    pageTitle: 'Portfolio Return Chart - 8 Political Values',

    // Chart 1: Period Returns
    periodReturnsTitle: 'Period Returns - 8 Political Values',
    periodReturnsSubtitle: 'Hourly portfolio returns (only time points where all 8 political values have non-zero data)',
    qualifiedDataPoints: 'qualified data points',

    // Chart 2: Accumulated Returns
    accumulatedReturnsTitle: 'Accumulated Returns - 8 Political Values + S&P 500',
    accumulatedReturnsSubtitle: 'Cumulative returns: (1+r₁) × (1+r₂) × ... - 1 | Black line = SPY (S&P 500 benchmark)',
    finalAccumulatedReturns: 'Final Accumulated Returns',
    vsSpy: 'vs SPY',

    // Loading/Error states
    loading: 'Loading...',
    fetchingPersonaData: 'Fetching data from Firebase...',
    fetchingSpyData: 'Fetching SPY data for {count} time points...',
    buildingCharts: 'Building charts...',
    errorLoadingData: 'Error loading data',
    noCommonDataPoints: 'No common data points found across all 8 political values',

    // Performance Insights
    performanceInsights: 'Performance Insights',
    benchmark: 'Benchmark',
    marketIndices: 'Market Indices',
    marketDrivers: 'Top Moving Stocks This Period',
    crudeOilIndex: 'Crude Oil',
    goldIndex: 'Gold',
    nasdaqIndex: 'Nasdaq 100',
    aiIndex: 'AI Index',
    topPerformers: 'Top Performers',
    bottomPerformers: 'Bottom Performers',
    win: 'win',
    whyWon: 'Why {name} Won',
    whyLost: 'Why {name} Lost',
    completeRanking: 'Complete Performance Ranking',
    rank: 'Rank',
    persona: 'Political Value',
    return: 'Return',
    winRate: 'Win Rate',
    avgDaily: 'Avg Daily',

    // Sector names
    crudeOil: 'Crude Oil',
    gold: 'Gold',
    technology: 'Technology',

    // Sector descriptions
    oilDescription: 'WTI Crude Oil Futures rallied on supply concerns',
    goldDescription: 'Gold Futures rose as safe haven demand increased',
    techDescription: 'Nasdaq 100 ETF underperformed broader market',

    // Insights text
    topPerformerReason: 'Long positions in energy stocks during oil price rally. Conservative investment philosophy favored traditional energy sector.',
    bottomPerformerReason: 'Short positions in energy stocks while going long on underperforming tech. Progressive philosophy led to wrong-way bets.',

    // Tooltip
    time: 'Time',
  },
  ZH: {
    pageTitle: '投资组合收益图表 - 8种政治价值观',

    periodReturnsTitle: '单期收益 - 8种政治价值观',
    periodReturnsSubtitle: '每小时组合收益率（仅显示所有8种政治价值观都有非零数据的时间点）',
    qualifiedDataPoints: '个合格数据点',

    accumulatedReturnsTitle: '累计收益 - 8种政治价值观 + 标普500',
    accumulatedReturnsSubtitle: '累计收益: (1+r₁) × (1+r₂) × ... - 1 | 黑线 = SPY（标普500基准）',
    finalAccumulatedReturns: '最终累计收益',
    vsSpy: '对比标普',

    loading: '加载中...',
    fetchingPersonaData: '正在从Firebase获取数据...',
    fetchingSpyData: '正在获取{count}个时间点的SPY数据...',
    buildingCharts: '正在构建图表...',
    errorLoadingData: '数据加载错误',
    noCommonDataPoints: '未找到所有8种政治价值观共同的数据点',

    performanceInsights: '表现分析',
    benchmark: '基准',
    marketIndices: '市场指数',
    marketDrivers: '本期涨跌最大的股票',
    crudeOilIndex: '原油',
    goldIndex: '黄金',
    nasdaqIndex: '纳斯达克100',
    aiIndex: 'AI指数',
    topPerformers: '表现最佳',
    bottomPerformers: '表现最差',
    win: '胜率',
    whyWon: '为什么 {name} 表现最好',
    whyLost: '为什么 {name} 表现最差',
    completeRanking: '完整表现排名',
    rank: '排名',
    persona: '政治价值观',
    return: '收益率',
    winRate: '胜率',
    avgDaily: '日均收益',

    crudeOil: '原油',
    gold: '黄金',
    technology: '科技',

    oilDescription: 'WTI原油期货因供应担忧上涨',
    goldDescription: '黄金期货因避险需求上升而上涨',
    techDescription: '纳斯达克100 ETF表现落后大盘',

    topPerformerReason: '在油价上涨期间持有能源股多头。保守投资理念青睐传统能源板块。',
    bottomPerformerReason: '做空能源股同时做多表现不佳的科技股。进步主义投资理念导致方向判断错误。',

    time: '时间',
  },
  JA: {
    pageTitle: 'ポートフォリオリターンチャート - 8つの政治的価値観',

    periodReturnsTitle: '期間リターン - 8つの政治的価値観',
    periodReturnsSubtitle: '時間別ポートフォリオリターン（全8つの政治的価値観にゼロ以外のデータがある時点のみ）',
    qualifiedDataPoints: '件の有効データポイント',

    accumulatedReturnsTitle: '累積リターン - 8つの政治的価値観 + S&P 500',
    accumulatedReturnsSubtitle: '累積リターン: (1+r₁) × (1+r₂) × ... - 1 | 黒線 = SPY（S&P 500ベンチマーク）',
    finalAccumulatedReturns: '最終累積リターン',
    vsSpy: 'vs SPY',

    loading: '読み込み中...',
    fetchingPersonaData: 'Firebaseからデータを取得中...',
    fetchingSpyData: '{count}時点のSPYデータを取得中...',
    buildingCharts: 'チャートを構築中...',
    errorLoadingData: 'データ読み込みエラー',
    noCommonDataPoints: '全8つの政治的価値観に共通するデータポイントが見つかりません',

    performanceInsights: 'パフォーマンス分析',
    benchmark: 'ベンチマーク',
    marketIndices: '市場指数',
    marketDrivers: '今期の値動きトップ銘柄',
    crudeOilIndex: '原油',
    goldIndex: '金',
    nasdaqIndex: 'ナスダック100',
    aiIndex: 'AI指数',
    topPerformers: 'トップパフォーマー',
    bottomPerformers: 'ボトムパフォーマー',
    win: '勝率',
    whyWon: 'なぜ {name} が勝ったか',
    whyLost: 'なぜ {name} が負けたか',
    completeRanking: '完全パフォーマンスランキング',
    rank: '順位',
    persona: '政治的価値観',
    return: 'リターン',
    winRate: '勝率',
    avgDaily: '日次平均',

    crudeOil: '原油',
    gold: '金',
    technology: 'テクノロジー',

    oilDescription: 'WTI原油先物が供給懸念で上昇',
    goldDescription: '金先物が安全資産需要で上昇',
    techDescription: 'ナスダック100 ETFが市場全体を下回る',

    topPerformerReason: '原油価格上昇時にエネルギー株をロング。保守的な投資哲学が従来のエネルギーセクターを選好。',
    bottomPerformerReason: 'エネルギー株をショートしながら低迷するテック株をロング。進歩的な哲学が逆方向の賭けにつながった。',

    time: '時間',
  },
  FR: {
    pageTitle: 'Graphique des Rendements du Portefeuille - 8 Valeurs Politiques',

    periodReturnsTitle: 'Rendements Périodiques - 8 Valeurs Politiques',
    periodReturnsSubtitle: 'Rendements horaires du portefeuille (uniquement les points où les 8 valeurs politiques ont des données non nulles)',
    qualifiedDataPoints: 'points de données qualifiés',

    accumulatedReturnsTitle: 'Rendements Cumulés - 8 Valeurs Politiques + S&P 500',
    accumulatedReturnsSubtitle: 'Rendements cumulés: (1+r₁) × (1+r₂) × ... - 1 | Ligne noire = SPY (référence S&P 500)',
    finalAccumulatedReturns: 'Rendements Cumulés Finaux',
    vsSpy: 'vs SPY',

    loading: 'Chargement...',
    fetchingPersonaData: 'Récupération des données depuis Firebase...',
    fetchingSpyData: 'Récupération des données SPY pour {count} points temporels...',
    buildingCharts: 'Construction des graphiques...',
    errorLoadingData: 'Erreur de chargement des données',
    noCommonDataPoints: 'Aucun point de données commun trouvé pour les 8 valeurs politiques',

    performanceInsights: 'Analyse de Performance',
    benchmark: 'Référence',
    marketIndices: 'Indices de Marché',
    marketDrivers: 'Actions les Plus Volatiles Cette Période',
    crudeOilIndex: 'Pétrole Brut',
    goldIndex: 'Or',
    nasdaqIndex: 'Nasdaq 100',
    aiIndex: 'Indice IA',
    topPerformers: 'Meilleures Performances',
    bottomPerformers: 'Pires Performances',
    win: 'victoires',
    whyWon: 'Pourquoi {name} a Gagné',
    whyLost: 'Pourquoi {name} a Perdu',
    completeRanking: 'Classement Complet des Performances',
    rank: 'Rang',
    persona: 'Valeur Politique',
    return: 'Rendement',
    winRate: 'Taux de Victoire',
    avgDaily: 'Moy. Quotidienne',

    crudeOil: 'Pétrole Brut',
    gold: 'Or',
    technology: 'Technologie',

    oilDescription: 'Les contrats à terme sur le pétrole WTI ont augmenté sur les craintes d\'approvisionnement',
    goldDescription: 'Les contrats à terme sur l\'or ont augmenté avec la demande de valeur refuge',
    techDescription: 'L\'ETF Nasdaq 100 a sous-performé le marché',

    topPerformerReason: 'Positions longues sur les actions énergétiques pendant la hausse du pétrole. La philosophie d\'investissement conservatrice a favorisé le secteur énergétique traditionnel.',
    bottomPerformerReason: 'Positions courtes sur l\'énergie tout en étant long sur la tech sous-performante. La philosophie progressiste a mené à des paris contraires.',

    time: 'Heure',
  },
  ES: {
    pageTitle: 'Gráfico de Rendimiento del Portafolio - 8 Valores Políticos',

    periodReturnsTitle: 'Rendimientos del Período - 8 Valores Políticos',
    periodReturnsSubtitle: 'Rendimientos por hora del portafolio (solo puntos donde los 8 valores políticos tienen datos no nulos)',
    qualifiedDataPoints: 'puntos de datos calificados',

    accumulatedReturnsTitle: 'Rendimientos Acumulados - 8 Valores Políticos + S&P 500',
    accumulatedReturnsSubtitle: 'Rendimientos acumulados: (1+r₁) × (1+r₂) × ... - 1 | Línea negra = SPY (referencia S&P 500)',
    finalAccumulatedReturns: 'Rendimientos Acumulados Finales',
    vsSpy: 'vs SPY',

    loading: 'Cargando...',
    fetchingPersonaData: 'Obteniendo datos desde Firebase...',
    fetchingSpyData: 'Obteniendo datos SPY para {count} puntos temporales...',
    buildingCharts: 'Construyendo gráficos...',
    errorLoadingData: 'Error al cargar datos',
    noCommonDataPoints: 'No se encontraron puntos de datos comunes para los 8 valores políticos',

    performanceInsights: 'Análisis de Rendimiento',
    benchmark: 'Referencia',
    marketIndices: 'Índices de Mercado',
    marketDrivers: 'Acciones con Mayor Movimiento Este Período',
    crudeOilIndex: 'Petróleo Crudo',
    goldIndex: 'Oro',
    nasdaqIndex: 'Nasdaq 100',
    aiIndex: 'Índice IA',
    topPerformers: 'Mejores Rendimientos',
    bottomPerformers: 'Peores Rendimientos',
    win: 'victorias',
    whyWon: 'Por qué {name} Ganó',
    whyLost: 'Por qué {name} Perdió',
    completeRanking: 'Clasificación Completa de Rendimiento',
    rank: 'Rango',
    persona: 'Valor Político',
    return: 'Rendimiento',
    winRate: 'Tasa de Victoria',
    avgDaily: 'Prom. Diario',

    crudeOil: 'Petróleo Crudo',
    gold: 'Oro',
    technology: 'Tecnología',

    oilDescription: 'Los futuros de petróleo WTI subieron por preocupaciones de suministro',
    goldDescription: 'Los futuros de oro subieron por demanda de refugio seguro',
    techDescription: 'El ETF Nasdaq 100 tuvo un rendimiento inferior al mercado',

    topPerformerReason: 'Posiciones largas en acciones de energía durante el rally del petróleo. La filosofía de inversión conservadora favoreció el sector energético tradicional.',
    bottomPerformerReason: 'Posiciones cortas en energía mientras estaba largo en tecnología con bajo rendimiento. La filosofía progresista llevó a apuestas en la dirección equivocada.',

    time: 'Hora',
  },
};

// Helper function to get translated text with variable substitution
export function t(lang: Language, key: string, vars?: Record<string, string | number>): string {
  let text = UI_TEXT[lang][key] || UI_TEXT['EN'][key] || key;

  if (vars) {
    Object.entries(vars).forEach(([varKey, value]) => {
      text = text.replace(`{${varKey}}`, String(value));
    });
  }

  return text;
}

// Get political value name in specified language
export function getPersonaName(lang: Language, key: string): string {
  return PERSONA_NAMES[lang][key] || PERSONA_NAMES['EN'][key] || key;
}
