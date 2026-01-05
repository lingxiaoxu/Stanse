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
      description: 'Personalized news curated for your political stance. See what matters to you based on your values.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: 'Market Alignment',
      description: 'Real-time stock prices for companies that align with (or oppose) your political values. Track how markets reflect your ideology.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Values-Based Rankings',
      description: 'Top companies to support or oppose based on FEC donations, ESG scores, executive statements, and news analysis.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Sense Tab',
      description: 'Scan any brand or company to check their alignment with your political values. Make informed purchasing decisions.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Stance Tab',
      description: 'Your political fingerprint. View your coordinates on economic, social, and diplomatic axes, plus your AI-generated persona.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: 'Political Coordinates',
      description: 'Your position on 3 axes: Economic (left/right), Social (libertarian/authoritarian), Diplomatic (globalist/nationalist).',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Union Tab',
      description: 'Track your collective political impact through Polis Protocol blockchain. See real-time union strength and capital diverted.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'Menu',
      description: 'Access settings, connect social media accounts, view our manifesto, manage your account, and explore source code.',
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
      description: '根据您的政治立场个性化推荐新闻。基于您的价值观查看对您重要的内容。',
      position: 'top'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: '市场对齐',
      description: '与您政治价值观一致（或相反）的公司的实时股价。追踪市场如何反映您的意识形态。',
      position: 'top'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: '基于价值观的排名',
      description: '基于 FEC 捐款、ESG 评分、高管声明和新闻分析的支持或反对公司排名。',
      position: 'top'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: '感知标签',
      description: '扫描任何品牌或公司，检查它们与您政治价值观的一致性。做出明智的购买决策。',
      position: 'top'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: '立场标签',
      description: '您的政治指纹。查看您在经济、社会和外交轴上的坐标，以及 AI 生成的人格标签。',
      position: 'top'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: '政治坐标',
      description: '您在 3 个轴上的位置：经济（左/右）、社会（自由/威权）、外交（全球/民族）。',
      position: 'top'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: '联合标签',
      description: '通过 Polis Protocol 区块链追踪您的集体政治影响力。查看实时联盟强度和资本转移。',
      position: 'top'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: '菜单',
      description: '访问设置、连接社交媒体账户、查看我们的宣言、管理您的账户并浏览源代码。',
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
      description: '政治的立場に合わせてキュレーションされたパーソナライズされたニュース。あなたの価値観に基づいて重要なことを見る。',
      position: 'top'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'センスタブ',
      description: 'ブランドや企業をスキャンして、あなたの政治的価値観との整合性を確認。情報に基づいた購入決定を行う。',
      position: 'top'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'スタンスタブ',
      description: 'あなたの政治的指紋。経済、社会、外交軸上の座標と AI 生成のペルソナを表示。',
      position: 'top'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'ユニオンタブ',
      description: 'Polis Protocol ブロックチェーンを通じて集団的政治的影響を追跡。リアルタイムのユニオン強度と転換された資本を確認。',
      position: 'top'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'メニュー',
      description: '設定へのアクセス、ソーシャルメディアアカウントの接続、マニフェストの表示、アカウント管理、ソースコードの探索。',
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
      description: 'Actualités personnalisées selon votre position politique. Voyez ce qui compte pour vous en fonction de vos valeurs.',
      position: 'top'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Onglet Sense',
      description: 'Scannez les marques et entreprises pour vérifier leur alignement avec vos valeurs politiques. Prenez des décisions d\'achat éclairées.',
      position: 'top'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Onglet Position',
      description: 'Votre empreinte politique. Visualisez vos coordonnées sur les axes économique, social et diplomatique, plus votre persona généré par l\'IA.',
      position: 'top'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Onglet Union',
      description: 'Suivez votre impact politique collectif via la blockchain Polis Protocol. Voyez la force de l\'union et le capital détourné en temps réel.',
      position: 'top'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'Menu',
      description: 'Accédez aux paramètres, connectez les comptes de réseaux sociaux, consultez notre manifeste, gérez votre compte et explorez le code source.',
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
      description: 'Noticias personalizadas según su postura política. Vea lo que importa para usted basado en sus valores.',
      position: 'top'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Pestaña Sense',
      description: 'Escanee marcas y empresas para verificar su alineación con sus valores políticos. Tome decisiones de compra informadas.',
      position: 'top'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Pestaña Postura',
      description: 'Su huella política. Vea sus coordenadas en los ejes económico, social y diplomático, más su persona generado por IA.',
      position: 'top'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Pestaña Unión',
      description: 'Rastree su impacto político colectivo a través de blockchain Polis Protocol. Vea la fuerza de la unión y el capital desviado en tiempo real.',
      position: 'top'
    },
    {
      id: 'menu',
      target: 'menu-button',
      title: 'Menú',
      description: 'Acceda a configuración, conecte cuentas de redes sociales, vea nuestro manifiesto, gestione su cuenta y explore el código fuente.',
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
