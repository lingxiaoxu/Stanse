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
      description: '政治的立場に合わせてキュレーションされたパーソナライズされたニュース。あなたの価値観に基づいて重要なことを見る。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: '市場アライメント',
      description: 'あなたの政治的価値観と一致する（または反対する）企業のリアルタイム株価。市場があなたのイデオロギーをどう反映しているかを追跡。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: '価値観ベースのランキング',
      description: 'FEC 献金、ESG スコア、経営陣の声明、ニュース分析に基づいて支持または反対すべき企業。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'ニュースフィード',
      description: 'あなたの政治的立場に基づいて AI がキュレーションしたパーソナライズされたニュース記事。重要なトピックについて情報を得る。',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'センスタブ',
      description: 'ブランドや企業をスキャンして、あなたの政治的価値観との整合性を確認。情報に基づいた購入決定を行う。',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'スタンスタブ',
      description: 'あなたの政治的指紋。経済、社会、外交軸上の座標と AI 生成のペルソナを表示。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: '政治的座標',
      description: '3つの軸での位置：経済（左/右）、社会（リバタリアン/権威主義）、外交（グローバリスト/ナショナリスト）。',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'ユニオンタブ',
      description: 'Polis Protocol ブロックチェーンを通じて集団的政治的影響を追跡。リアルタイムのユニオン強度と転換された資本を確認。',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: 'アクティブな仲間',
      description: 'あなたの地域で政治的価値観に沿って消費を調整しているユーザーのリアルタイムカウント。リアルタイムの集団行動を見る。',
      position: 'top',
      requiredTab: 'UNION'
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
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: 'Alignement du Marché',
      description: 'Prix des actions en temps réel pour les entreprises qui s\'alignent avec (ou s\'opposent à) vos valeurs politiques.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Classements Basés sur les Valeurs',
      description: 'Meilleures entreprises à soutenir ou à opposer basées sur les dons FEC, scores ESG, déclarations des dirigeants et analyse des actualités.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'Le Flux d\'Actualités',
      description: 'Articles d\'actualité personnalisés organisés par l\'IA selon votre position politique. Restez informé sur les sujets qui comptent pour vous.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Onglet Sense',
      description: 'Scannez les marques et entreprises pour vérifier leur alignement avec vos valeurs politiques. Prenez des décisions d\'achat éclairées.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Onglet Position',
      description: 'Votre empreinte politique. Visualisez vos coordonnées sur les axes économique, social et diplomatique, plus votre persona généré par l\'IA.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: 'Coordonnées Politiques',
      description: 'Votre position sur 3 axes : Économique (gauche/droite), Social (libertarien/autoritaire), Diplomatique (mondialiste/nationaliste).',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Onglet Union',
      description: 'Suivez votre impact politique collectif via la blockchain Polis Protocol. Voyez la force de l\'union et le capital détourné en temps réel.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: 'Alliés Actifs',
      description: 'Nombre en temps réel d\'utilisateurs dans votre région alignant actuellement leur consommation avec les valeurs politiques.',
      position: 'top',
      requiredTab: 'UNION'
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
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'market-stocks',
      target: 'market-stocks',
      title: 'Alineación del Mercado',
      description: 'Precios de acciones en tiempo real para empresas que se alinean con (u oponen a) sus valores políticos.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'company-rankings',
      target: 'company-rankings',
      title: 'Clasificaciones Basadas en Valores',
      description: 'Principales empresas para apoyar u oponerse basadas en donaciones FEC, puntajes ESG, declaraciones ejecutivas y análisis de noticias.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'news-feed',
      target: 'news-feed',
      title: 'El Feed de Noticias',
      description: 'Artículos de noticias personalizados curados por IA según su postura política. Manténgase informado sobre temas que le importan.',
      position: 'top',
      requiredTab: 'FEED'
    },
    {
      id: 'sense-tab',
      target: 'sense-tab',
      title: 'Pestaña Sense',
      description: 'Escanee marcas y empresas para verificar su alineación con sus valores políticos. Tome decisiones de compra informadas.',
      position: 'top',
      requiredTab: 'SENSE'
    },
    {
      id: 'stance-tab',
      target: 'stance-tab',
      title: 'Pestaña Postura',
      description: 'Su huella política. Vea sus coordenadas en los ejes económico, social y diplomático, más su persona generado por IA.',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'coordinates',
      target: 'coordinates-chart',
      title: 'Coordenadas Políticas',
      description: 'Su posición en 3 ejes: Económico (izquierda/derecha), Social (libertario/autoritario), Diplomático (globalista/nacionalista).',
      position: 'top',
      requiredTab: 'FINGERPRINT'
    },
    {
      id: 'union-tab',
      target: 'union-tab',
      title: 'Pestaña Unión',
      description: 'Rastree su impacto político colectivo a través de blockchain Polis Protocol. Vea la fuerza de la unión y el capital desviado en tiempo real.',
      position: 'top',
      requiredTab: 'UNION'
    },
    {
      id: 'active-allies',
      target: 'active-allies',
      title: 'Aliados Activos',
      description: 'Recuento en tiempo real de usuarios en su región alineando actualmente su consumo con valores políticos.',
      position: 'top',
      requiredTab: 'UNION'
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
