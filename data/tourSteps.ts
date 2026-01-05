import { Language } from '../types';
import { TourStep } from '../components/ui/AppTour';

/**
 * App Tour Steps - Multilingual
 *
 * Each language has 7 steps:
 * 1. Welcome (center)
 * 2. Feed Tab (bottom)
 * 3. Sense Tab (bottom)
 * 4. Stance Tab (bottom)
 * 5. Union Tab (bottom)
 * 6. Menu (left)
 * 7. Final Welcome (center)
 */

export const TOUR_STEPS: Record<Language, TourStep[]> = {
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
      description: 'Personalized news for your political stance.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: 'Market Alignment',
      description: 'Real-time stock prices for companies aligned with your values.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Values-Based Rankings',
      description: 'Top companies to support or oppose based on FEC, ESG, and news.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'The Feed',
      description: 'AI-curated news articles based on your political stance.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Sense Tab',
      description: 'Scan brands to check alignment with your values.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Stance Tab',
      description: 'Your political fingerprint and AI-generated persona.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: 'Political Coordinates',
      description: 'Your position on Economic, Social, and Diplomatic axes.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
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
      id: 'menu',
      target: 'menu-button',
      title: 'Menu',
      description: 'Settings, social media, manifesto, and account.',
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
      description: '根据政治立场推荐新闻。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: '市场对齐',
      description: '价值观一致公司的实时股价。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: '基于价值观的排名',
      description: '基于 FEC、ESG 和新闻的公司排名。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: '新闻动态',
      description: 'AI 策划的个性化新闻文章。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: '感知标签',
      description: '扫描品牌检查价值观一致性。',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: '立场标签',
      description: '政治指纹和 AI 人格标签。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: '政治坐标',
      description: '经济、社会、外交三轴位置。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
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
      id: 'menu',
      target: 'menu-button',
      title: '菜单',
      description: '设置、社交媒体、宣言和账户。',
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
      description: '政治的立場に合わせたニュース。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: '市場アライメント',
      description: '価値観一致企業の株価。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: '価値観ベースのランキング',
      description: 'FEC、ESG、ニュース基準のランキング。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'ニュースフィード',
      description: 'AI キュレーションのニュース記事。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'センスタブ',
      description: 'ブランドの価値観整合性スキャン。',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'スタンスタブ',
      description: '政治的指紋と AI ペルソナ。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: '政治的座標',
      description: '経済・社会・外交の3軸。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
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
      id: 'menu',
      target: 'menu-button',
      title: 'メニュー',
      description: '設定、SNS、マニフェスト、アカウント。',
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
      description: 'Actualités personnalisées selon position.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: 'Alignement du Marché',
      description: 'Prix actions alignées valeurs.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Classements Basés sur les Valeurs',
      description: 'Entreprises basées FEC, ESG, actualités.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'Le Flux d\'Actualités',
      description: 'Articles IA selon position politique.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Onglet Sense',
      description: 'Scanner alignement des marques.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Onglet Position',
      description: 'Empreinte politique et persona IA.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: 'Coordonnées Politiques',
      description: 'Position axes Économique, Social, Diplomatique.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
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
      id: 'menu',
      target: 'menu-button',
      title: 'Menu',
      description: 'Paramètres, réseaux, manifeste, compte.',
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
      description: 'Noticias personalizadas según postura.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: 'Alineación del Mercado',
      description: 'Precios acciones alineadas valores.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Clasificaciones Basadas en Valores',
      description: 'Empresas basadas FEC, ESG, noticias.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'El Feed de Noticias',
      description: 'Artículos IA según postura política.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Pestaña Sense',
      description: 'Escanear alineación de marcas.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Pestaña Postura',
      description: 'Huella política y persona IA.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: 'Coordenadas Políticas',
      description: 'Posición ejes Económico, Social, Diplomático.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
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
      id: 'menu',
      target: 'menu-button',
      title: 'Menú',
      description: 'Configuración, redes, manifiesto, cuenta.',
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

/**
 * Get tour steps for current language
 */
export const getTourSteps = (language: Language): TourStep[] => {
  return TOUR_STEPS[language] || TOUR_STEPS[Language.EN];
};
