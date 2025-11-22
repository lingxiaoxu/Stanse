
import React, { createContext, useState, useContext } from 'react';
import { Language } from '../types';

const TRANSLATIONS = {
  [Language.EN]: {
    slogan: "Don't just vote. Live your values.",
    nav: { feed: "FEED", sense: "SENSE", stance: "STANCE", union: "UNION" },
    login: { 
        title: "IDENTIFY YOURSELF", 
        email: "EMAIL FREQUENCY", 
        key: "ACCESS KEY", 
        btn: "ESTABLISH LINK", 
        google: "CONTINUE WITH GOOGLE",
        protocol: "Zero-Knowledge Protocol"
    },
    menu: {
        manifesto: "MANIFESTO",
        privacy: "PRIVACY",
        settings: "SETTINGS",
        source: "SOURCE",
        social: "SOCIAL MEDIA",
        logout: "LOGOUT",
        subs: {
            manifesto: "Our Philosophy",
            privacy: "Zero-Knowledge Proof",
            settings: "Preferences",
            source: "View on GitHub",
            social: "Connect X/Twitter"
        }
    },
    sense: {
        title: "SENSE",
        subtitle: "Signal Processing • Entity Decode",
        searchLabel: "SEARCH COMPANY, ENTITY, OR INDIVIDUAL",
        placeholder: "E.g. ELON MUSK, NIKE...",
        run: "RUN",
        loading: "COMPILING DOSSIER...",
        report: "INTELLIGENCE REPORT",
        summary: "Executive Summary",
        friction: "Friction Points",
        resonance: "Resonance Points",
        socialWire: "SOCIAL WIRE (X)",
        source: "Source Material",
        btn_union: "Check Union",
        btn_context: "View Context",
        btn_recal: "Recalibrate My Stance",
        alternatives: "Consider instead:"
    },
    union: {
        title: "THE UNION",
        subtitle: "Collective Action • Decentralized Power",
        live: "LIVE",
        active_allies: "Active Allies Online",
        active_desc: "Real-time count of users in your region currently aligning their consumption.",
        active_fronts: "ACTIVE FRONTS",
        view_all: "VIEW ALL",
        target: "TARGET",
        joined: "JOINED",
        goal: "GOAL",
        your_impact: "YOUR IMPACT",
        ledger: "Personal Ledger",
        camp_stat: "Campaigns",
        streak_stat: "Streak",
        redirect_stat: "Redirected",
        amplified: "AMPLIFIED BY THE UNION",
        union_strength: "Total Union Strength",
        capital_divested: "Capital Divested",
        divested_desc: "Estimated revenue denied to conflicting entities this quarter."
    },
    feed: {
        market: "Values Market Alignment",
        company_ranking: "Values Company Ranking",
        support_companies: "SUPPORT",
        oppose_companies: "OPPOSE",
        loading_rankings: "ANALYZING COMPANIES...",
        title: "THE FEED",
        subtitle: "GLOBAL INTELLIGENCE STREAM",
        lens: "PRISM LENS",
        close_lens: "CLOSE LENS",
        loading_lens: "REFRACTING PERSPECTIVES...",
        support: "SUPPORT",
        neutral: "NEUTRAL",
        oppose: "OPPOSE"
    },
    fingerprint: {
        title: "YOUR STANCE",
        subtitle: "DYNAMIC POLITICAL FINGERPRINT",
        computing: "COMPUTING",
        identified: "IDENTIFIED PERSONA",
        loading: "TRIANGULATING VECTORS...",
        analyzing: "ANALYZING COMPLEXITY...",
        econ: "Economic",
        soc: "Social",
        diplo: "Diplomatic",
        left: "LEFT",
        right: "RIGHT",
        auth: "AUTH",
        lib: "LIB",
        nat: "NAT",
        global: "GLOBAL"
    },
    settings: {
        title: "SYSTEM PREFS",
        notifications: "PUSH NOTIFICATIONS",
        loc: "LOCATION SERVICES",
        strict: "STRICT MODE",
        delete: "Delete Account & Wipe Local Data",
        sub_notif: "Alerts for campaign updates",
        sub_loc: "For local store scanning only",
        sub_strict: "Warn on 'Neutral' alignment"
    },
    manifesto: {
        title: "MANIFESTO",
        subtitle: "The Philosophy of Stanse",
        p1_title: "SILENT VOTING",
        p1_body: "We believe that every dollar spent is a vote cast. Traditional democracy happens every few years; economic democracy happens every day. Your wallet is your ballot box.",
        p2_title: "DATA SOVEREIGNTY",
        p2_body: "In an age of surveillance capitalism, we build tools that serve the user, not the advertiser. We calculate your values locally. We do not sell your political profile.",
        p3_title: "COLLECTIVE ACTION",
        p3_body: "Individual choices feel small, but aggregated action moves markets. Stanse is not just a mirror for self-reflection; it is a lens for collective focus.",
        footer: "DON'T JUST VOTE. LIVE YOUR VALUES."
    },
    privacy: {
        title: "ZERO KNOWLEDGE",
        subtitle: "PRIVACY ARCHITECTURE",
        card_title: "WE DON'T KNOW WHO YOU ARE",
        card_body: "We use Zero-Knowledge Proofs to verify your alignment with campaigns without ever accessing your actual political coordinates or transaction history.",
        local_title: "LOCAL COMPUTATION",
        local_body: "Your \"Political Fingerprint\" is generated and stored exclusively on your device.",
        diff_title: "DIFFERENTIAL PRIVACY",
        diff_body: "When you join a Union Campaign, we add random noise to the data, ensuring your individual contribution cannot be isolated."
    }
  },
  [Language.ZH]: {
    slogan: "不只投票，更要活出你的价值观。",
    nav: { feed: "动态", sense: "感知", stance: "立场", union: "联合" },
    login: { 
        title: "身份识别", 
        email: "电子邮箱", 
        key: "访问密钥", 
        btn: "建立连接", 
        google: "通过 GOOGLE 继续",
        protocol: "零知识证明协议"
    },
    menu: {
        manifesto: "宣言",
        privacy: "隐私",
        settings: "设置",
        source: "源代码",
        social: "社交媒体",
        logout: "登出",
        subs: {
            manifesto: "我们的哲学",
            privacy: "零知识证明",
            settings: "偏好设置",
            source: "GitHub 仓库",
            social: "连接 X/Twitter"
        }
    },
    sense: {
        title: "感知引擎",
        subtitle: "信号处理 • 实体解码",
        searchLabel: "搜索公司、实体或个人",
        placeholder: "例如：马斯克, 耐克...",
        run: "扫描",
        loading: "正在编制档案...",
        report: "情报报告",
        summary: "执行摘要",
        friction: "冲突点",
        resonance: "共鸣点",
        socialWire: "社交讯号 (X)",
        source: "情报来源",
        btn_union: "检查联合状态",
        btn_context: "查看背景",
        btn_recal: "重新校准立场",
        alternatives: "替代建议："
    },
    union: {
        title: "联合阵线",
        subtitle: "集体行动 • 去中心化力量",
        live: "实时",
        active_allies: "在线盟友",
        active_desc: "当前你所在区域正在实践消费对齐的用户数量。",
        active_fronts: "活跃前线",
        view_all: "查看全部",
        target: "目标",
        joined: "已加入",
        goal: "目标",
        your_impact: "你的影响",
        ledger: "个人账本",
        camp_stat: "战役",
        streak_stat: "连续",
        redirect_stat: "已转移",
        amplified: "联合阵线放大效应",
        union_strength: "联合总力量",
        capital_divested: "撤资总额",
        divested_desc: "本季度估计已拒绝流向冲突实体的收入。"
    },
    feed: {
        market: "价值观市场对齐度",
        company_ranking: "价值观公司排名",
        support_companies: "支持",
        oppose_companies: "抵制",
        loading_rankings: "正在分析公司...",
        title: "情报流",
        subtitle: "全球情报流",
        lens: "三棱镜透视",
        close_lens: "关闭透视",
        loading_lens: "正在折射视角...",
        support: "支持",
        neutral: "中立",
        oppose: "反对"
    },
    fingerprint: {
        title: "你的立场",
        subtitle: "动态政治指纹",
        computing: "计算中",
        identified: "已识别画像",
        loading: "正在三角定位...",
        analyzing: "正在分析复杂性...",
        econ: "经济维度",
        soc: "社会维度",
        diplo: "外交维度",
        left: "左翼",
        right: "右翼",
        auth: "权威",
        lib: "自由",
        nat: "本土",
        global: "全球"
    },
    settings: {
        title: "系统偏好",
        notifications: "推送通知",
        loc: "定位服务",
        strict: "严格模式",
        delete: "删除账户并清除本地数据",
        sub_notif: "战役更新提醒",
        sub_loc: "仅用于本地商店扫描",
        sub_strict: "对“中立”对齐发出警告"
    },
    manifesto: {
        title: "宣言",
        subtitle: "Stanse 的哲学",
        p1_title: "无声投票",
        p1_body: "我们相信每一次消费都是一次投票。传统的民主几年才发生一次；经济民主每天都在发生。你的钱包就是你的投票箱。",
        p2_title: "数据主权",
        p2_body: "在监控资本主义时代，我们构建服务于用户而非广告商的工具。我们在本地计算你的价值观，绝不出售你的政治画像。",
        p3_title: "集体行动",
        p3_body: "个人的选择看似渺小，但聚合的行动可以撼动市场。Stanse 不仅仅是一面自省的镜子，更是集体聚焦的透镜。",
        footer: "不只投票，更要活出你的价值观。"
    },
    privacy: {
        title: "零知识",
        subtitle: "隐私架构",
        card_title: "我们不知道你是谁",
        card_body: "我们使用零知识证明来验证你与战役的对齐情况，而无需访问你的实际政治坐标或交易历史。",
        local_title: "本地计算",
        local_body: "你的“政治指纹”仅在你的设备上生成和存储。",
        diff_title: "差分隐私",
        diff_body: "当你加入联合战役时，我们会向数据中添加随机噪声，确保你的个人贡献无法被隔离识别。"
    }
  },
  [Language.JA]: {
    slogan: "ただ投票するだけでなく、価値観を生きる。",
    nav: { feed: "フィード", sense: "センス", stance: "スタンス", union: "ユニオン" },
    login: { 
        title: "本人確認", 
        email: "メールアドレス", 
        key: "アクセスキー", 
        btn: "リンク確立", 
        google: "GOOGLEで続行",
        protocol: "ゼロ知識証明プロトコル"
    },
    menu: {
        manifesto: "マニフェスト",
        privacy: "プライバシー",
        settings: "設定",
        source: "ソース",
        social: "ソーシャル",
        logout: "ログアウト",
        subs: {
            manifesto: "私たちの哲学",
            privacy: "ゼロ知識証明",
            settings: "環境設定",
            source: "GitHubで表示",
            social: "X/Twitterを接続"
        }
    },
    sense: {
        title: "センス",
        subtitle: "信号処理 • エンティティ解読",
        searchLabel: "企業、エンティティ、または個人を検索",
        placeholder: "例: イーロン・マスク, ナイキ...",
        run: "実行",
        loading: "調査書を作成中...",
        report: "インテリジェンスレポート",
        summary: "エグゼクティブサマリー",
        friction: "摩擦点 (不一致)",
        resonance: "共鳴点 (一致)",
        socialWire: "ソーシャルワイヤー (X)",
        source: "情報源",
        btn_union: "ユニオン確認",
        btn_context: "文脈を表示",
        btn_recal: "スタンス再調整",
        alternatives: "代替案の検討："
    },
    union: {
        title: "ザ・ユニオン",
        subtitle: "集団行動 • 分散型権力",
        live: "ライブ",
        active_allies: "アクティブな同盟者",
        active_desc: "あなたの地域で現在、消費行動を調整しているユーザーのリアルタイム数。",
        active_fronts: "アクティブな戦線",
        view_all: "すべて表示",
        target: "ターゲット",
        joined: "参加者",
        goal: "目標",
        your_impact: "あなたの影響",
        ledger: "個人台帳",
        camp_stat: "参加数",
        streak_stat: "継続",
        redirect_stat: "転換額",
        amplified: "ユニオンによる増幅",
        union_strength: "ユニオン総力",
        capital_divested: "総撤退資本",
        divested_desc: "今四半期、対立するエンティティへの支払いを拒否した推定額。"
    },
    feed: {
        market: "価値観市場適合度",
        title: "フィード",
        subtitle: "グローバルインテリジェンス",
        lens: "プリズムレンズ",
        close_lens: "レンズを閉じる",
        loading_lens: "視点を屈折中...",
        support: "支持",
        neutral: "中立",
        oppose: "反対"
    },
    fingerprint: {
        title: "あなたのスタンス",
        subtitle: "動的政治指紋",
        computing: "計算中",
        identified: "特定されたペルソナ",
        loading: "ベクトル三角測量中...",
        analyzing: "複雑性を分析中...",
        econ: "経済軸",
        soc: "社会軸",
        diplo: "外交軸",
        left: "左派",
        right: "右派",
        auth: "権威",
        lib: "自由",
        nat: "自国",
        global: "国際"
    },
    settings: {
        title: "システム設定",
        notifications: "プッシュ通知",
        loc: "位置情報サービス",
        strict: "厳格モード",
        delete: "アカウント削除とデータ消去",
        sub_notif: "キャンペーン更新のアラート",
        sub_loc: "ローカル店舗スキャン用",
        sub_strict: "「中立」アライメントに警告"
    },
    manifesto: {
        title: "マニフェスト",
        subtitle: "Stanseの哲学",
        p1_title: "沈黙の投票",
        p1_body: "私たちは、使われるすべてのドルが投票であると信じています。従来の民主主義は数年に一度ですが、経済民主主義は毎日起こります。あなたの財布は投票箱です。",
        p2_title: "データ主権",
        p2_body: "監視資本主義の時代において、私たちは広告主ではなくユーザーに奉仕するツールを構築します。私たちはあなたの価値観をローカルで計算します。政治的プロファイルを販売することはありません。",
        p3_title: "集団行動",
        p3_body: "個人の選択は小さく見えますが、集約された行動は市場を動かします。Stanseは単なる内省のための鏡ではなく、集団的焦点のためのレンズです。",
        footer: "ただ投票するだけでなく、価値観を生きる。"
    },
    privacy: {
        title: "ゼロ知識",
        subtitle: "プライバシーアーキテクチャ",
        card_title: "私たちはあなたが誰かを知りません",
        card_body: "私たちはゼロ知識証明を使用して、実際の政治座標や取引履歴にアクセスすることなく、キャンペーンとの整合性を検証します。",
        local_title: "ローカル計算",
        local_body: "あなたの「政治的指紋」は、あなたのデバイス上でのみ生成および保存されます。",
        diff_title: "差分プライバシー",
        diff_body: "ユニオンキャンペーンに参加すると、データにランダムなノイズが追加され、個人の貢献が特定されないようになります。"
    }
  },
  [Language.FR]: {
    slogan: "Ne votez pas juste. Incarnez vos valeurs.",
    nav: { feed: "FLUX", sense: "SENS", stance: "POSITION", union: "UNION" },
    login: { 
        title: "IDENTIFICATION", 
        email: "EMAIL", 
        key: "CLÉ D'ACCÈS", 
        btn: "ÉTABLIR LIEN", 
        google: "CONTINUER AVEC GOOGLE",
        protocol: "Protocole à Divulgation Nulle"
    },
    menu: {
        manifesto: "MANIFESTE",
        privacy: "CONFIDENTIALITÉ",
        settings: "RÉGLAGES",
        source: "SOURCE",
        social: "MÉDIAS SOCIAUX",
        logout: "DÉCONNEXION",
        subs: {
            manifesto: "Notre Philosophie",
            privacy: "Preuve Zéro Connaissance",
            settings: "Préférences",
            source: "Voir sur GitHub",
            social: "Connecter X/Twitter"
        }
    },
    sense: {
        title: "SENS",
        subtitle: "Traitement du Signal • Décodage",
        searchLabel: "RECHERCHER ENTREPRISE, ENTITÉ OU INDIVIDU",
        placeholder: "Ex. LVMH, TOTAL...",
        run: "LANCER",
        loading: "COMPILATION DU DOSSIER...",
        report: "RAPPORT DE RENSEIGNEMENT",
        summary: "Résumé Exécutif",
        friction: "Points de Friction",
        resonance: "Points de Résonance",
        socialWire: "SIGNAL SOCIAL (X)",
        source: "Sources",
        btn_union: "Vérifier Union",
        btn_context: "Voir Contexte",
        btn_recal: "Recalibrer Position",
        alternatives: "Considérer plutôt :"
    },
    union: {
        title: "L'UNION",
        subtitle: "Action Collective • Pouvoir Décentralisé",
        live: "EN DIRECT",
        active_allies: "Alliés Actifs",
        active_desc: "Nombre temps réel d'utilisateurs alignant leur consommation.",
        active_fronts: "FRONTS ACTIFS",
        view_all: "VOIR TOUT",
        target: "CIBLE",
        joined: "REJOINTS",
        goal: "BUT",
        your_impact: "VOTRE IMPACT",
        ledger: "Registre Personnel",
        camp_stat: "Campagnes",
        streak_stat: "Série",
        redirect_stat: "Redirigé",
        amplified: "AMPLIFIÉ PAR L'UNION",
        union_strength: "Force Totale",
        capital_divested: "Capital Désinvesti",
        divested_desc: "Revenu estimé refusé aux entités en conflit ce trimestre."
    },
    feed: {
        market: "Alignement Marché Valeurs",
        title: "LE FLUX",
        subtitle: "FLUX DE RENSEIGNEMENT GLOBAL",
        lens: "LENTILLE PRISME",
        close_lens: "FERMER LENTILLE",
        loading_lens: "RÉFRACTION DES PERSPECTIVES...",
        support: "POUR",
        neutral: "NEUTRE",
        oppose: "CONTRE"
    },
    fingerprint: {
        title: "VOTRE POSITION",
        subtitle: "EMPREINTE POLITIQUE DYNAMIQUE",
        computing: "CALCUL",
        identified: "PERSONA IDENTIFIÉ",
        loading: "TRIANGULATION...",
        analyzing: "ANALYSE COMPLEXITÉ...",
        econ: "Économique",
        soc: "Social",
        diplo: "Diplomatique",
        left: "GAUCHE",
        right: "DROITE",
        auth: "AUTH",
        lib: "LIB",
        nat: "NAT",
        global: "MONDE"
    },
    settings: {
        title: "PRÉFS SYSTÈME",
        notifications: "NOTIFICATIONS PUSH",
        loc: "SERVICES LOCALISATION",
        strict: "MODE STRICT",
        delete: "Supprimer Compte & Données",
        sub_notif: "Alertes mises à jour campagnes",
        sub_loc: "Pour scan magasins locaux",
        sub_strict: "Avertir sur alignement 'Neutre'"
    },
    manifesto: {
        title: "MANIFESTE",
        subtitle: "La Philosophie de Stanse",
        p1_title: "VOTE SILENCIEUX",
        p1_body: "Nous croyons que chaque dollar dépensé est un vote. La démocratie traditionnelle a lieu tous les quelques années ; la démocratie économique a lieu tous les jours.",
        p2_title: "SOUVERAINETÉ DES DONNÉES",
        p2_body: "À l'ère du capitalisme de surveillance, nous construisons des outils qui servent l'utilisateur, pas l'annonceur. Nous ne vendons pas votre profil politique.",
        p3_title: "ACTION COLLECTIVE",
        p3_body: "Les choix individuels semblent petits, mais l'action agrégée déplace les marchés. Stanse n'est pas seulement un miroir ; c'est une lentille pour la concentration collective.",
        footer: "Ne votez pas juste. Incarnez vos valeurs."
    },
    privacy: {
        title: "ZÉRO CONNAISSANCE",
        subtitle: "ARCHITECTURE DE CONFIDENTIALITÉ",
        card_title: "NOUS NE SAVONS PAS QUI VOUS ÊTES",
        card_body: "Nous utilisons des preuves à divulgation nulle pour vérifier votre alignement sans jamais accéder à vos coordonnées politiques réelles.",
        local_title: "CALCUL LOCAL",
        local_body: "Votre \"Empreinte Politique\" est générée et stockée exclusivement sur votre appareil.",
        diff_title: "CONFIDENTIALITÉ DIFFÉRENTIELLE",
        diff_body: "Lorsque vous rejoignez une campagne, nous ajoutons du bruit aléatoire aux données, garantissant que votre contribution ne peut être isolée."
    }
  },
  [Language.ES]: {
    slogan: "No solo votes. Vive tus valores.",
    nav: { feed: "FEED", sense: "SENTIDO", stance: "POSTURA", union: "UNIÓN" },
    login: { 
        title: "IDENTIFÍCATE", 
        email: "CORREO ELECTRÓNICO", 
        key: "CLAVE DE ACCESO", 
        btn: "ESTABLECER ENLACE", 
        google: "CONTINUAR CON GOOGLE",
        protocol: "Protocolo de Conocimiento Cero"
    },
    menu: {
        manifesto: "MANIFIESTO",
        privacy: "PRIVACIDAD",
        settings: "AJUSTES",
        source: "CÓDIGO",
        social: "REDES SOCIALES",
        logout: "CERRAR SESIÓN",
        subs: {
            manifesto: "Nuestra Filosofía",
            privacy: "Prueba de Conocimiento Cero",
            settings: "Preferencias",
            source: "Ver en GitHub",
            social: "Conectar X/Twitter"
        }
    },
    sense: {
        title: "SENTIDO",
        subtitle: "Procesamiento de Señales • Decodificación",
        searchLabel: "BUSCAR EMPRESA, ENTIDAD O INDIVIDUO",
        placeholder: "Ej. INDITEX, PEMEX...",
        run: "EJECUTAR",
        loading: "COMPILANDO DOSSIER...",
        report: "INFORME DE INTELIGENCIA",
        summary: "Resumen Ejecutivo",
        friction: "Puntos de Fricción",
        resonance: "Puntos de Resonancia",
        socialWire: "CABLE SOCIAL (X)",
        source: "Fuentes",
        btn_union: "Ver Unión",
        btn_context: "Ver Contexto",
        btn_recal: "Recalibrar Postura",
        alternatives: "Considerar en su lugar:"
    },
    union: {
        title: "LA UNIÓN",
        subtitle: "Acción Colectiva • Poder Descentralizado",
        live: "EN VIVO",
        active_allies: "Aliados Activos",
        active_desc: "Recuento en tiempo real de usuarios alineando su consumo.",
        active_fronts: "FRENTES ACTIVOS",
        view_all: "VER TODOS",
        target: "OBJETIVO",
        joined: "UNIDOS",
        goal: "META",
        your_impact: "TU IMPACTO",
        ledger: "Libro Mayor Personal",
        camp_stat: "Campañas",
        streak_stat: "Racha",
        redirect_stat: "Redirigido",
        amplified: "AMPLIFICADO POR LA UNIÓN",
        union_strength: "Fuerza Total Unión",
        capital_divested: "Capital Desinvertido",
        divested_desc: "Ingresos estimados negados a entidades en conflicto."
    },
    feed: {
        market: "Alineación Mercado Valores",
        title: "EL FEED",
        subtitle: "FLUJO DE INTELIGENCIA GLOBAL",
        lens: "LENTE PRISMA",
        close_lens: "CERRAR LENTE",
        loading_lens: "REFRACTANDO PERSPECTIVAS...",
        support: "APOYO",
        neutral: "NEUTRO",
        oppose: "CONTRA"
    },
    fingerprint: {
        title: "TU POSTURA",
        subtitle: "HUELLA POLÍTICA DINÁMICA",
        computing: "COMPUTANDO",
        identified: "PERSONA IDENTIFICADA",
        loading: "TRIANGULANDO...",
        analyzing: "ANALIZANDO COMPLEJIDAD...",
        econ: "Económico",
        soc: "Social",
        diplo: "Diplomático",
        left: "IZQ",
        right: "DER",
        auth: "AUT",
        lib: "LIB",
        nat: "NAC",
        global: "GLOBAL"
    },
    settings: {
        title: "PREFS SISTEMA",
        notifications: "NOTIFICACIONES PUSH",
        loc: "SERVICIOS UBICACIÓN",
        strict: "MODO ESTRICTO",
        delete: "Borrar Cuenta y Datos",
        sub_notif: "Alertas actualizaciones campañas",
        sub_loc: "Para escaneo tiendas locales",
        sub_strict: "Advertir en alineación 'Neutra'"
    },
    manifesto: {
        title: "MANIFIESTO",
        subtitle: "La Filosofía de Stanse",
        p1_title: "VOTO SILENCIOSO",
        p1_body: "Creemos que cada dólar gastado es un voto. La democracia tradicional ocurre cada pocos años; la democracia económica ocurre todos los días. Tu billetera es tu urna.",
        p2_title: "SOBERANÍA DE DATOS",
        p2_body: "En la era del capitalismo de vigilancia, construimos herramientas que sirven al usuario, no al anunciante. Calculamos tus valores localmente. No vendemos tu perfil político.",
        p3_title: "ACCIÓN COLECTIVA",
        p3_body: "Las elecciones individuales parecen pequeñas, pero la acción agregada mueve los mercados. Stanse no es solo un espejo para la autorreflexión; es una lente para el enfoque colectivo.",
        footer: "No solo votes. Vive tus valores."
    },
    privacy: {
        title: "CONOCIMIENTO CERO",
        subtitle: "ARQUITECTURA DE PRIVACIDAD",
        card_title: "NO SABEMOS QUIÉN ERES",
        card_body: "Utilizamos Pruebas de Conocimiento Cero para verificar tu alineación con campañas sin acceder nunca a tus coordenadas políticas reales o historial de transacciones.",
        local_title: "COMPUTACIÓN LOCAL",
        local_body: "Tu \"Huella Política\" se genera y almacena exclusivamente en tu dispositivo.",
        diff_title: "PRIVACIDAD DIFERENCIAL",
        diff_body: "Cuando te unes a una campaña de la Unión, añadimos ruido aleatorio a los datos, asegurando que tu contribución individual no pueda ser aislada."
    }
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (section: keyof typeof TRANSLATIONS[Language.EN], key?: string) => any;
}

export const LanguageContext = createContext<LanguageContextType>({
  language: Language.EN,
  setLanguage: () => {},
  t: () => ""
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(Language.EN);

  const t = (section: string, key?: string): string => {
    const translations = TRANSLATIONS[language] as Record<string, Record<string, string>>;
    const sectionData = translations[section];
    if (!sectionData) return "MISSING_SECTION";
    if (!key) return typeof sectionData === 'string' ? sectionData : "MISSING_KEY";
    return sectionData[key] || "MISSING_KEY";
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
