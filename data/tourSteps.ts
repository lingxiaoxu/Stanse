import { Language } from '../types';
import { TourStep } from '../components/ui/AppTour';

/**
 * App Tour Steps - Multilingual
 *
 * Each language has 12 steps (dynamically adjusted based on user state):
 * 1. Welcome (center)
 * 2. Feed Tab (bottom)
 * 3. Market Alignment
 * 4. Company Rankings
 * 5. News Feed
 * 6. Sense Tab (bottom)
 * 7. Stance Tab (bottom)
 * 8. Coordinates OR Onboarding (conditional based on hasCompletedOnboarding)
 * 9. Union Tab (bottom)
 * 10. Active Allies
 * 11. Menu (left)
 * 12. Final Welcome (center)
 */

// Base tour steps (without coordinates step)
const BASE_TOUR_STEPS: Record<Language, TourStep[]> = {
  // ==================== ENGLISH ====================
  [Language.EN]: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Welcome to Stanse!',
      description: 'AI-powered political & economic alignment app with blockchain-based impact tracking. Let\'s take a quick tour!',
      position: 'center'
    },
    {
      id: 'feed-tab',
      target: 'feed-tab',
      title: 'Feed Tab',
      description: 'Personalized news curated for your political stance. See what matters to your values.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-signal',
      target: 'market-signal',
      title: 'Market Signal',
      description: 'Discover politically-aligned companies and market insights.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Values-Based Rankings',
      description: 'Top companies ranked by your political values.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'The Feed',
      description: 'Personalized news curated by AI based on your political stance. Stay informed about what matters to you.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Sense Tab',
      description: 'Scan any brand, company, entity or individual to check their alignment with your political values. Make informed decisions.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Stance Tab',
      description: 'Your political fingerprint. View your stances on economic, social, and diplomatic axes, plus your persona.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    // coordinates step will be inserted dynamically by getTourSteps()
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Union Tab',
      description: 'Track collective political impact via blockchain.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: 'Active Allies',
      description: 'Real-time count of users aligning consumption with values.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'duel-arena',
      target: 'duel-arena',
      title: 'DUEL Arena',
      description: 'PvP trivia battles. Win credits!',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'Menu',
      description: 'Access settings, connect social media accounts, view our manifesto, and manage your account.',
      position: 'left'
    },
    {
      id: 'final',
      target: 'body',
      title: 'Welcome to Political Engagement!',
      description: 'Stanse is an AI-Agentic political & economic central app. Leverage blockchain-verified political influence. Maximize your capital\'s political impact without compromising your identity and privacy.',
      position: 'center'
    }
  ],

  // ==================== CHINESE (中文) ====================
  [Language.ZH]: [
    {
      id: 'welcome',
      target: 'body',
      title: '欢迎来到 Stanse！',
      description: 'AI 驱动的政治经济立场应用，基于区块链的影响力追踪。让我们快速浏览一下！',
      position: 'center'
    },
    {
      id: 'feed-tab',
      target: 'feed-tab',
      title: '动态标签',
      description: '根据政治立场推荐新闻。查看对您价值观重要的内容。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-signal',
      target: 'market-signal',
      title: '市场信号',
      description: '发现与您价值观一致的公司。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: '价值观排名',
      description: '基于政治立场的公司排名。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: '新闻动态',
      description: 'AI 策划的个性化新闻。了解对您重要的内容。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: '感知标签',
      description: '扫描品牌、公司、实体或个人检查价值观一致性。做出明智决策。',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: '立场标签',
      description: '您的政治指纹。查看经济、社会、外交立场和政治视角。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    // coordinates step will be inserted dynamically by getTourSteps()
    {
      id: 'union-tab',
      target: 'union-tab',
      title: '联合标签',
      description: '区块链追踪集体政治影响力。',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: '活跃盟友',
      description: '实时用户数和集体行动。',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'duel-arena',
      target: 'duel-arena',
      title: 'DUEL 竞技场',
      description: 'PvP 知识对战，赢取积分！',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: '菜单',
      description: '访问设置、连接社交媒体、查看宣言和管理账户。',
      position: 'left'
    },
    {
      id: 'final',
      target: 'body',
      title: '欢迎来到政治参与的未来！',
      description: 'Stanse 是一个 AI 代理政治经济中心应用。利用区块链验证的政治影响力，在不损害您的身份和隐私的情况下最大化您资金的政治影响力。',
      position: 'center'
    }
  ],

  // ==================== JAPANESE (日本語) ====================
  [Language.JA]: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Stanse へようこそ！',
      description: 'AI 駆動の政治経済アライメントアプリ、ブロックチェーンベースの影響追跡。クイックツアーを始めましょう！',
      position: 'center'
    },
    {
      id: 'feed-tab',
      target: 'feed-tab',
      title: 'フィードタブ',
      description: '政治的立場に合わせたニュース。価値観に重要な内容を見る。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-signal',
      target: 'market-signal',
      title: 'マーケットシグナル',
      description: '価値観に合った企業を発見。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: '価値観ランキング',
      description: '政治的立場に基づく企業ランキング。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'ニュースフィード',
      description: 'AI がキュレーションしたパーソナライズされたニュース。重要な情報を得る。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'センスタブ',
      description: 'ブランド、企業、個人の価値観整合性をスキャン。情報に基づいた決定を。',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'スタンスタブ',
      description: 'あなたの政治的指紋。経済、社会、外交の立場とペルソナを表示。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    // coordinates step will be inserted dynamically by getTourSteps()
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'ユニオンタブ',
      description: 'ブロックチェーンで集団影響追跡。',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: 'アクティブな仲間',
      description: 'リアルタイムユーザー数。',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'duel-arena',
      target: 'duel-arena',
      title: 'DUEL アリーナ',
      description: 'PvPトリビアバトル。賞金を獲得！',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'メニュー',
      description: '設定へアクセス、SNS 接続、マニフェスト閲覧、アカウント管理。',
      position: 'left'
    },
    {
      id: 'final',
      target: 'body',
      title: '政治参加の未来へようこそ！',
      description: 'Stanse は AI エージェント型の政治経済中央アプリです。ブロックチェーン検証済みの政治的影響力を活用。身元とプライバシーを損なうことなく資本の政治的影響を最大化。',
      position: 'center'
    }
  ],

  // ==================== FRENCH (Français) ====================
  [Language.FR]: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Bienvenue sur Stanse !',
      description: 'Application d\'alignement politique et économique alimentée par l\'IA avec suivi d\'impact blockchain. Faisons un rapide tour !',
      position: 'center'
    },
    {
      id: 'feed-tab',
      target: 'feed-tab',
      title: 'Onglet Flux',
      description: 'Actualités personnalisées selon position. Voyez ce qui compte pour vos valeurs.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-signal',
      target: 'market-signal',
      title: 'Signal Marché',
      description: 'Entreprises alignées avec vos valeurs.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Classements Valeurs',
      description: 'Entreprises classées selon position politique.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'Le Flux d\'Actualités',
      description: 'Articles personnalisés par IA selon position. Restez informé sur ce qui compte.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Onglet Sense',
      description: 'Scanner marques, entreprises, entités ou individus pour vérifier alignement. Décisions éclairées.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Onglet Position',
      description: 'Votre empreinte politique. Voyez positions économique, sociale, diplomatique et persona.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    // coordinates step will be inserted dynamically by getTourSteps()
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Onglet Union',
      description: 'Impact collectif via blockchain.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: 'Alliés Actifs',
      description: 'Nombre utilisateurs alignant consommation.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'duel-arena',
      target: 'duel-arena',
      title: 'Arène DUEL',
      description: 'Batailles trivia PvP. Gagnez des crédits!',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'Menu',
      description: 'Accéder paramètres, connecter réseaux sociaux, voir manifeste, gérer compte.',
      position: 'left'
    },
    {
      id: 'final',
      target: 'body',
      title: 'Bienvenue dans l\'Avenir Politique !',
      description: 'Stanse est une application centrale politique et économique pilotée par l\'IA. Tirez parti de l\'influence politique vérifiée par blockchain. Maximisez l\'impact politique de votre capital sans compromettre votre identité et votre vie privée.',
      position: 'center'
    }
  ],

  // ==================== SPANISH (Español) ====================
  [Language.ES]: [
    {
      id: 'welcome',
      target: 'body',
      title: '¡Bienvenido a Stanse!',
      description: 'Aplicación de alineación política y económica impulsada por IA con seguimiento de impacto blockchain. ¡Hagamos un recorrido rápido!',
      position: 'center'
    },
    {
      id: 'feed-tab',
      target: 'feed-tab',
      title: 'Pestaña Feed',
      description: 'Noticias personalizadas según postura. Vea lo que importa a sus valores.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-signal',
      target: 'market-signal',
      title: 'Señal de Mercado',
      description: 'Empresas alineadas con tus valores.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Ranking de Valores',
      description: 'Empresas por posición política.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'El Feed de Noticias',
      description: 'Artículos personalizados por IA según postura. Manténgase informado sobre lo que importa.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Pestaña Sense',
      description: 'Escanear marcas, empresas, entidades o individuos para verificar alineación. Decisiones informadas.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Pestaña Postura',
      description: 'Su huella política. Vea posturas económica, social, diplomática y persona.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    // coordinates step will be inserted dynamically by getTourSteps()
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Pestaña Unión',
      description: 'Impacto colectivo vía blockchain.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: 'Aliados Activos',
      description: 'Recuento usuarios alineando consumo.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'duel-arena',
      target: 'duel-arena',
      title: 'Arena DUEL',
      description: 'Batallas trivia PvP. ¡Gana créditos!',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'Menú',
      description: 'Acceder configuración, conectar redes sociales, ver manifiesto, gestionar cuenta.',
      position: 'left'
    },
    {
      id: 'final',
      target: 'body',
      title: '¡Bienvenido al Futuro Político!',
      description: 'Stanse es una aplicación central política y económica impulsada por IA. Aproveche la influencia política verificada por blockchain. Maximice el impacto político de su capital sin comprometer su identidad y privacidad.',
      position: 'center'
    }
  ]
};

// Coordinates step for users who have completed onboarding
const COORDINATES_STEPS_EXISTING_USER: Record<Language, TourStep> = {
  [Language.EN]: {
    id: 'coordinates',
    target: 'coordinates-chart',
    title: 'Political Coordinates',
    description: 'Your position on Economic, Social, and Diplomatic axes.',
    position: 'top',
    requiredTab: 'FINGERPRINT'
  },
  [Language.ZH]: {
    id: 'coordinates',
    target: 'coordinates-chart',
    title: '政治坐标',
    description: '经济、社会、外交三轴位置。',
    position: 'top',
    requiredTab: 'FINGERPRINT'
  },
  [Language.JA]: {
    id: 'coordinates',
    target: 'coordinates-chart',
    title: '政治的座標',
    description: '経済・社会・外交の3軸。',
    position: 'top',
    requiredTab: 'FINGERPRINT'
  },
  [Language.FR]: {
    id: 'coordinates',
    target: 'coordinates-chart',
    title: 'Coordonnées Politiques',
    description: 'Position axes Économique, Social, Diplomatique.',
    position: 'top',
    requiredTab: 'FINGERPRINT'
  },
  [Language.ES]: {
    id: 'coordinates',
    target: 'coordinates-chart',
    title: 'Coordenadas Políticas',
    description: 'Posición ejes Económico, Social, Diplomático.',
    position: 'top',
    requiredTab: 'FINGERPRINT'
  }
};

// Onboarding step for new users who haven't completed onboarding
const ONBOARDING_STEPS_NEW_USER: Record<Language, TourStep> = {
  [Language.EN]: {
    id: 'onboarding',
    target: 'onboarding-modal',
    title: 'Questionnaire for Calibration',
    description: 'Calibrate your political stance and unlock AI-personalized features.',
    position: 'bottom',
    requiredTab: 'FINGERPRINT'
  },
  [Language.ZH]: {
    id: 'onboarding',
    target: 'onboarding-modal',
    title: '校准问卷',
    description: '校准您的政治立场并解锁 AI 个性化功能。',
    position: 'bottom',
    requiredTab: 'FINGERPRINT'
  },
  [Language.JA]: {
    id: 'onboarding',
    target: 'onboarding-modal',
    title: 'キャリブレーション用アンケート',
    description: '政治的立場を較正し、AIパーソナライズ機能をロック解除します。',
    position: 'bottom',
    requiredTab: 'FINGERPRINT'
  },
  [Language.FR]: {
    id: 'onboarding',
    target: 'onboarding-modal',
    title: 'Questionnaire de Calibrage',
    description: 'Calibrez votre position politique et débloquez les fonctionnalités personnalisées par IA.',
    position: 'bottom',
    requiredTab: 'FINGERPRINT'
  },
  [Language.ES]: {
    id: 'onboarding',
    target: 'onboarding-modal',
    title: 'Cuestionario de Calibración',
    description: 'Calibre su postura política y desbloquee funciones personalizadas por IA.',
    position: 'bottom',
    requiredTab: 'FINGERPRINT'
  }
};

/**
 * Get tour steps for current language, dynamically adjusted based on user state
 * @param language - Current app language
 * @param hasCompletedOnboarding - Whether user has completed onboarding questionnaire
 */
export const getTourSteps = (language: Language, hasCompletedOnboarding: boolean = true): TourStep[] => {
  const baseSteps = BASE_TOUR_STEPS[language] || BASE_TOUR_STEPS[Language.EN];

  // Find the stance-tab step index (coordinates should be inserted after it)
  const stanceTabIndex = baseSteps.findIndex(step => step.id === 'stance-tab');

  if (stanceTabIndex === -1) {
    // Fallback: just return base steps if structure is unexpected
    return baseSteps;
  }

  // Insert appropriate coordinates/onboarding step after stance-tab
  const coordinatesStep = hasCompletedOnboarding
    ? COORDINATES_STEPS_EXISTING_USER[language] || COORDINATES_STEPS_EXISTING_USER[Language.EN]
    : ONBOARDING_STEPS_NEW_USER[language] || ONBOARDING_STEPS_NEW_USER[Language.EN];

  return [
    ...baseSteps.slice(0, stanceTabIndex + 1),
    coordinatesStep,
    ...baseSteps.slice(stanceTabIndex + 1)
  ];
};
