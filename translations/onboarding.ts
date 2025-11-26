import { Language } from '../types';

// Onboarding questionnaire translations
export const ONBOARDING_TRANSLATIONS = {
  [Language.EN]: {
    // Headers and navigation
    calibration: "CALIBRATION",
    stepOf: "Step {step} of {total}",
    back: "BACK",
    next: "NEXT",
    submit: "CALIBRATE",
    neutral: "Neutral / It depends",

    // Step titles
    steps: {
      demographics: "Your Background",
      questions: "Political Compass",
      initiatives: "Your Political Views",
      wars: "Active War Positions",
      conflicts: "Geopolitical Disputes",
      confirm: "Confirm Your Profile"
    },

    // Demographics
    demographics: {
      birthCountry: "Birth Country",
      currentCountry: "Current Country",
      state: "State",
      stateProvince: "State / Province",
      age: "Age",
      selectCountry: "Select country...",
      selectState: "Select state...",
      enterState: "Enter state/province...",
      enterAge: "Enter your age..."
    },

    // Questions
    questionsDesc: "Answer these questions to calibrate your political position",

    // Wars
    warsDesc: "Select your stance on current armed conflicts",

    // Conflicts
    conflictsDesc: "Select your stance on non-war geopolitical conflicts",

    // Initiatives
    initiatives: {
      oppose: "Political Initiative You MOST OPPOSE",
      opposeEx: 'e.g., "Universal Basic Income", "Border Wall", "Carbon Tax"',
      opposePlaceholder: "Enter initiative you oppose...",
      support: "Political Initiative You MOST SUPPORT",
      supportEx: 'e.g., "Medicare for All", "School Choice", "Green New Deal"',
      supportPlaceholder: "Enter initiative you support..."
    },

    // Confirmation
    confirm: {
      birth: "Birth",
      location: "Location",
      age: "Age",
      oppose: "Oppose",
      support: "Support",
      disclaimer: "Your responses will be analyzed by AI to calculate your political fingerprint. Data is stored securely and never shared."
    },

    // War-specific translations
    wars: {
      'ukraine-russia': {
        name: "Russia-Ukraine War",
        sideA: "Ukraine",
        sideB: "Russia"
      },
      'israel-palestine': {
        name: "Israel-Palestine Conflict",
        sideA: "Israel",
        sideB: "Palestine"
      },
      'pakistan-india': {
        name: "Pakistan-India Conflict",
        sideA: "Pakistan",
        sideB: "India"
      }
    },

    // Conflicts
    conflictStanceTitle: "Geopolitical Positions",
    conflictStanceDesc: "What is your stance on these geopolitical issues?",
    support: "Support",
    oppose: "Oppose",

    // Conflict-specific translations
    conflicts: {
      'trade-war': {
        name: "Trade Tariff War: China/EU vs USA",
        supportLabel: "Support China/EU position",
        opposeLabel: "Support USA position",
        desc: "Ongoing trade disputes and tariffs between major economic powers"
      },
      'taiwan-sovereignty': {
        name: "China-Taiwan Cross-Strait Relations",
        supportLabel: "Support Mainland China",
        opposeLabel: "Oppose Mainland China",
        desc: "Cross-strait tensions and sovereignty claims"
      },
      'west-decoupling': {
        name: "Western Economic Decoupling from China & Russia",
        supportLabel: "Support decoupling",
        opposeLabel: "Oppose decoupling",
        desc: "Proposals to reduce economic interdependence with China and Russia"
      }
    },

    // Political Questions
    questions: {
      'econ-1': {
        question: "How should healthcare be funded?",
        optionA: "Government-funded universal healthcare",
        optionB: "Private insurance with market competition"
      },
      'econ-2': {
        question: "What is the best approach to wealth inequality?",
        optionA: "Higher taxes on the wealthy, more redistribution",
        optionB: "Lower taxes, let the free market create opportunities"
      },
      'social-1': {
        question: "How should society approach traditional values vs progressive change?",
        optionA: "Preserve traditional values and institutions",
        optionB: "Embrace progressive social change"
      },
      'social-2': {
        question: "What role should government play in personal lifestyle choices?",
        optionA: "Government should guide moral standards",
        optionB: "Individuals should decide for themselves"
      },
      'diplo-1': {
        question: "How should your country engage with the world?",
        optionA: "Prioritize national interests, limit foreign involvement",
        optionB: "Embrace international cooperation and global institutions"
      },
      'social-3': {
        question: "Should religion play a role in politics and governance?",
        optionA: "Yes, religious values should guide policies",
        optionB: "No, keep religion separate from government"
      }
    }
  },

  [Language.ZH]: {
    // Headers and navigation
    calibration: "立场校准",
    stepOf: "第 {step} 步，共 {total} 步",
    back: "返回",
    next: "下一步",
    submit: "提交",
    neutral: "中立",

    // Step titles
    steps: {
      demographics: "个人背景",
      questions: "政治问题",
      initiatives: "你的优先事项",
      wars: "战争立场",
      conflicts: "地缘政治立场",
      confirm: "确认你的答案"
    },

    // Demographics
    demographics: {
      birthCountry: "出生国家",
      currentCountry: "当前国家",
      state: "州/省",
      stateProvince: "州/省",
      age: "年龄",
      selectCountry: "选择国家...",
      selectState: "选择州/省...",
      enterState: "输入州/省...",
      enterAge: "输入年龄..."
    },

    // Questions
    questionsDesc: "在这些正在进行的冲突中，你支持哪一方？",

    // Wars
    warsDesc: "在这些正在进行的冲突中，你支持哪一方？",

    // Conflicts
    conflictsDesc: "你对这些地缘政治问题的立场是什么？",

    // Initiatives
    initiatives: {
      oppose: "你最反对的政治倡议",
      opposeEx: "例如：全民基本收入、移民限制",
      opposePlaceholder: "输入你反对的倡议...",
      support: "你最支持的政治倡议",
      supportEx: "例如：气候行动、税制改革",
      supportPlaceholder: "输入你支持的倡议..."
    },

    // Confirmation
    confirm: {
      birth: "出生于",
      location: "居住于",
      age: "岁",
      oppose: "最反对",
      support: "最支持",
      disclaimer: "您的回答将由AI分析以计算您的政治指纹。数据安全存储，永不共享。"
    },

    // War-specific translations
    wars: {
      'ukraine-russia': {
        name: "俄乌战争",
        sideA: "乌克兰",
        sideB: "俄罗斯"
      },
      'israel-palestine': {
        name: "以巴冲突",
        sideA: "以色列",
        sideB: "巴勒斯坦"
      },
      'pakistan-india': {
        name: "巴基斯坦-印度冲突",
        sideA: "巴基斯坦",
        sideB: "印度"
      }
    },

    // Conflicts
    conflictStanceTitle: "地缘政治立场",
    conflictStanceDesc: "你对这些地缘政治问题的立场是什么？",
    support: "支持",
    oppose: "反对",

    // Conflict-specific translations
    conflicts: {
      'trade-war': {
        name: "贸易关税战：中国/欧盟 vs 美国",
        supportLabel: "支持中国/欧盟立场",
        opposeLabel: "支持美国立场",
        desc: "主要经济体之间的持续贸易争端和关税"
      },
      'taiwan-sovereignty': {
        name: "中国-台湾海峡两岸关系",
        supportLabel: "支持中国大陆",
        opposeLabel: "反对中国大陆",
        desc: "海峡两岸紧张局势和主权主张"
      },
      'west-decoupling': {
        name: "西方与中国和俄罗斯经济脱钩",
        supportLabel: "支持脱钩",
        opposeLabel: "反对脱钩",
        desc: "减少与中国和俄罗斯经济相互依赖的提议"
      }
    },

    // Political Questions
    questions: {
      'econ-1': {
        question: "医疗保健应该如何筹资？",
        optionA: "政府资助的全民医疗保健",
        optionB: "市场竞争的私人保险"
      },
      'econ-2': {
        question: "解决财富不平等的最佳方法是什么？",
        optionA: "对富人增税，更多再分配",
        optionB: "降低税收，让自由市场创造机会"
      },
      'social-1': {
        question: "社会应该如何对待传统价值观与进步变革？",
        optionA: "保留传统价值观和制度",
        optionB: "拥抱进步的社会变革"
      },
      'social-2': {
        question: "政府在个人生活方式选择中应扮演什么角色？",
        optionA: "政府应该引导道德标准",
        optionB: "个人应该自己决定"
      },
      'diplo-1': {
        question: "你的国家应该如何与世界互动？",
        optionA: "优先考虑国家利益，限制对外参与",
        optionB: "拥抱国际合作和全球机构"
      },
      'social-3': {
        question: "宗教是否应该在政治和治理中发挥作用？",
        optionA: "是的，宗教价值观应该指导政策",
        optionB: "不，政教分离"
      }
    }
  },

  [Language.JA]: {
    // Headers and navigation
    calibration: "キャリブレーション",
    stepOf: "ステップ {step} / {total}",
    back: "戻る",
    next: "次へ",
    submit: "提出",
    neutral: "中立",

    // Step titles
    steps: {
      demographics: "あなたの背景",
      questions: "政治的質問",
      initiatives: "あなたの優先事項",
      wars: "戦争の立場",
      conflicts: "地政学的立場",
      confirm: "回答を確認"
    },

    // Demographics
    demographics: {
      birthCountry: "出生国",
      currentCountry: "現在の国",
      state: "州/県",
      stateProvince: "州/県",
      age: "年齢",
      selectCountry: "国を選択...",
      selectState: "州/県を選択...",
      enterState: "州/県を入力...",
      enterAge: "年齢を入力..."
    },

    // Questions
    questionsDesc: "これらの進行中の紛争でどちら側を支持しますか？",

    // Wars
    warsDesc: "これらの進行中の紛争でどちら側を支持しますか？",

    // Conflicts
    conflictsDesc: "これらの地政学的問題についてのあなたの立場は？",

    // Initiatives
    initiatives: {
      oppose: "最も反対する政治的イニシアチブ",
      opposeEx: "例：ベーシックインカム、移民制限",
      opposePlaceholder: "反対するイニシアチブを入力...",
      support: "最も支持する政治的イニシアチブ",
      supportEx: "例：気候変動対策、税制改革",
      supportPlaceholder: "支持するイニシアチブを入力..."
    },

    // Confirmation
    confirm: {
      birth: "生まれ",
      location: "現住所",
      age: "歳",
      oppose: "最も反対",
      support: "最も支持",
      disclaimer: "あなたの回答はAIによって分析され、あなたの政治的指紋が計算されます。データは安全に保管され、共有されることはありません。"
    },

    // War-specific translations
    wars: {
      'ukraine-russia': {
        name: "ロシア・ウクライナ戦争",
        sideA: "ウクライナ",
        sideB: "ロシア"
      },
      'israel-palestine': {
        name: "イスラエル・パレスチナ紛争",
        sideA: "イスラエル",
        sideB: "パレスチナ"
      },
      'pakistan-india': {
        name: "パキスタン・インド紛争",
        sideA: "パキスタン",
        sideB: "インド"
      }
    },

    // Conflicts
    conflictStanceTitle: "地政学的立場",
    conflictStanceDesc: "これらの地政学的問題についてのあなたの立場は？",
    support: "支持",
    oppose: "反対",

    // Conflict-specific translations
    conflicts: {
      'trade-war': {
        name: "貿易関税戦争：中国/EU vs 米国",
        supportLabel: "中国/EUの立場を支持",
        opposeLabel: "米国の立場を支持",
        desc: "主要経済大国間の継続的な貿易紛争と関税"
      },
      'taiwan-sovereignty': {
        name: "中国・台湾海峡両岸関係",
        supportLabel: "中国本土を支持",
        opposeLabel: "中国本土に反対",
        desc: "海峡両岸の緊張と主権主張"
      },
      'west-decoupling': {
        name: "西側諸国の中国とロシアからの経済的デカップリング",
        supportLabel: "デカップリングを支持",
        opposeLabel: "デカップリングに反対",
        desc: "中国とロシアとの経済的相互依存を減らす提案"
      }
    },

    // Political Questions
    questions: {
      'econ-1': {
        question: "医療はどのように資金調達されるべきですか？",
        optionA: "政府資金による国民皆保険",
        optionB: "市場競争による民間保険"
      },
      'econ-2': {
        question: "富の不平等への最良のアプローチは何ですか？",
        optionA: "富裕層への増税、より多くの再分配",
        optionB: "減税、自由市場が機会を創出"
      },
      'social-1': {
        question: "社会は伝統的価値観と進歩的変化にどう取り組むべきですか？",
        optionA: "伝統的価値観と制度を保持",
        optionB: "進歩的な社会変化を受け入れる"
      },
      'social-2': {
        question: "政府は個人のライフスタイルの選択においてどのような役割を果たすべきですか？",
        optionA: "政府が道徳的基準を導くべき",
        optionB: "個人が自分で決めるべき"
      },
      'diplo-1': {
        question: "あなたの国は世界とどのように関わるべきですか？",
        optionA: "国益を優先し、対外関与を制限",
        optionB: "国際協力とグローバル機関を受け入れる"
      },
      'social-3': {
        question: "宗教は政治と統治において役割を果たすべきですか？",
        optionA: "はい、宗教的価値観が政策を導くべき",
        optionB: "いいえ、宗教と政府は分離すべき"
      }
    }
  },

  [Language.FR]: {
    // Headers and navigation
    calibration: "CALIBRAGE",
    stepOf: "Étape {step} sur {total}",
    back: "RETOUR",
    next: "SUIVANT",
    submit: "SOUMETTRE",
    neutral: "Neutre",

    // Step titles
    steps: {
      demographics: "Vos Origines",
      questions: "Questions Politiques",
      initiatives: "Vos Priorités",
      wars: "Positions sur les Guerres",
      conflicts: "Positions Géopolitiques",
      confirm: "Confirmez Vos Réponses"
    },

    // Demographics
    demographics: {
      birthCountry: "Pays de Naissance",
      currentCountry: "Pays Actuel",
      state: "État/Province",
      stateProvince: "État/Province",
      age: "Âge",
      selectCountry: "Sélectionner le pays...",
      selectState: "Sélectionner l'état/province...",
      enterState: "Entrer l'état/province...",
      enterAge: "Entrer votre âge..."
    },

    // Questions
    questionsDesc: "Quel côté soutenez-vous dans ces conflits en cours?",

    // Wars
    warsDesc: "Quel côté soutenez-vous dans ces conflits en cours?",

    // Conflicts
    conflictsDesc: "Quelle est votre position sur ces questions géopolitiques?",

    // Initiatives
    initiatives: {
      oppose: "Initiative Politique à Laquelle Vous Vous Opposez le Plus",
      opposeEx: "ex: Revenu de Base Universel, Restrictions d'Immigration",
      opposePlaceholder: "Entrer l'initiative que vous opposez...",
      support: "Initiative Politique Que Vous Soutenez le Plus",
      supportEx: "ex: Action Climatique, Réforme Fiscale",
      supportPlaceholder: "Entrer l'initiative que vous soutenez..."
    },

    // Confirmation
    confirm: {
      birth: "Né en",
      location: "Vivant en",
      age: "ans",
      oppose: "Plus Opposé",
      support: "Plus Soutenu",
      disclaimer: "Vos réponses seront analysées par IA pour calculer votre empreinte politique. Les données sont stockées en toute sécurité et ne sont jamais partagées."
    },

    // War-specific translations
    wars: {
      'ukraine-russia': {
        name: "Guerre Russie-Ukraine",
        sideA: "Ukraine",
        sideB: "Russie"
      },
      'israel-palestine': {
        name: "Conflit Israël-Palestine",
        sideA: "Israël",
        sideB: "Palestine"
      },
      'pakistan-india': {
        name: "Conflit Pakistan-Inde",
        sideA: "Pakistan",
        sideB: "Inde"
      }
    },

    // Conflicts
    conflictStanceTitle: "Positions Géopolitiques",
    conflictStanceDesc: "Quelle est votre position sur ces questions géopolitiques?",
    support: "Soutenir",
    oppose: "Opposer",

    // Conflict-specific translations
    conflicts: {
      'trade-war': {
        name: "Guerre Tarifaire: Chine/UE vs USA",
        supportLabel: "Soutenir la position Chine/UE",
        opposeLabel: "Soutenir la position USA",
        desc: "Différends commerciaux et tarifs entre grandes puissances économiques"
      },
      'taiwan-sovereignty': {
        name: "Relations Chine-Taïwan",
        supportLabel: "Soutenir la Chine continentale",
        opposeLabel: "S'opposer à la Chine continentale",
        desc: "Tensions transdétroit et revendications de souveraineté"
      },
      'west-decoupling': {
        name: "Découplage Économique Occidental de la Chine et la Russie",
        supportLabel: "Soutenir le découplage",
        opposeLabel: "S'opposer au découplage",
        desc: "Propositions de réduire l'interdépendance économique avec la Chine et la Russie"
      }
    },

    // Political Questions
    questions: {
      'econ-1': {
        question: "Comment les soins de santé devraient-ils être financés?",
        optionA: "Soins de santé universels financés par le gouvernement",
        optionB: "Assurance privée avec concurrence du marché"
      },
      'econ-2': {
        question: "Quelle est la meilleure approche face à l'inégalité des richesses?",
        optionA: "Impôts plus élevés sur les riches, plus de redistribution",
        optionB: "Impôts plus bas, laisser le marché libre créer des opportunités"
      },
      'social-1': {
        question: "Comment la société devrait-elle aborder les valeurs traditionnelles vs le changement progressif?",
        optionA: "Préserver les valeurs et institutions traditionnelles",
        optionB: "Embrasser le changement social progressif"
      },
      'social-2': {
        question: "Quel rôle le gouvernement devrait-il jouer dans les choix de mode de vie personnels?",
        optionA: "Le gouvernement devrait guider les normes morales",
        optionB: "Les individus devraient décider par eux-mêmes"
      },
      'diplo-1': {
        question: "Comment votre pays devrait-il s'engager avec le monde?",
        optionA: "Prioriser les intérêts nationaux, limiter l'implication étrangère",
        optionB: "Embrasser la coopération internationale et les institutions mondiales"
      },
      'social-3': {
        question: "La religion devrait-elle jouer un rôle dans la politique et la gouvernance?",
        optionA: "Oui, les valeurs religieuses devraient guider les politiques",
        optionB: "Non, séparer la religion du gouvernement"
      }
    }
  },

  [Language.ES]: {
    // Headers and navigation
    calibration: "CALIBRACIÓN",
    stepOf: "Paso {step} de {total}",
    back: "ATRÁS",
    next: "SIGUIENTE",
    submit: "ENVIAR",
    neutral: "Neutral",

    // Step titles
    steps: {
      demographics: "Sus Antecedentes",
      questions: "Preguntas Políticas",
      initiatives: "Sus Prioridades",
      wars: "Posturas sobre Guerras",
      conflicts: "Posiciones Geopolíticas",
      confirm: "Confirme Sus Respuestas"
    },

    // Demographics
    demographics: {
      birthCountry: "País de Nacimiento",
      currentCountry: "País Actual",
      state: "Estado/Provincia",
      stateProvince: "Estado/Provincia",
      age: "Edad",
      selectCountry: "Seleccionar país...",
      selectState: "Seleccionar estado/provincia...",
      enterState: "Introducir estado/provincia...",
      enterAge: "Introducir su edad..."
    },

    // Questions
    questionsDesc: "¿Qué lado apoya en estos conflictos en curso?",

    // Wars
    warsDesc: "¿Qué lado apoya en estos conflictos en curso?",

    // Conflicts
    conflictsDesc: "¿Cuál es su postura sobre estos temas geopolíticos?",

    // Initiatives
    initiatives: {
      oppose: "Iniciativa Política a la Que Más Se Opone",
      opposeEx: "ej: Renta Básica Universal, Restricciones de Inmigración",
      opposePlaceholder: "Introducir iniciativa que opone...",
      support: "Iniciativa Política Que Más Apoya",
      supportEx: "ej: Acción Climática, Reforma Fiscal",
      supportPlaceholder: "Introducir iniciativa que apoya..."
    },

    // Confirmation
    confirm: {
      birth: "Nacido en",
      location: "Viviendo en",
      age: "años",
      oppose: "Más Opuesto",
      support: "Más Apoyado",
      disclaimer: "Sus respuestas serán analizadas por IA para calcular su huella política. Los datos se almacenan de forma segura y nunca se comparten."
    },

    // War-specific translations
    wars: {
      'ukraine-russia': {
        name: "Guerra Rusia-Ucrania",
        sideA: "Ucrania",
        sideB: "Rusia"
      },
      'israel-palestine': {
        name: "Conflicto Israel-Palestina",
        sideA: "Israel",
        sideB: "Palestina"
      },
      'pakistan-india': {
        name: "Conflicto Pakistán-India",
        sideA: "Pakistán",
        sideB: "India"
      }
    },

    // Conflicts
    conflictStanceTitle: "Posiciones Geopolíticas",
    conflictStanceDesc: "¿Cuál es su postura sobre estos temas geopolíticos?",
    support: "Apoyar",
    oppose: "Oponerse",

    // Conflict-specific translations
    conflicts: {
      'trade-war': {
        name: "Guerra Arancelaria: China/UE vs EE.UU.",
        supportLabel: "Apoyar posición China/UE",
        opposeLabel: "Apoyar posición EE.UU.",
        desc: "Disputas comerciales y aranceles entre grandes potencias económicas"
      },
      'taiwan-sovereignty': {
        name: "Relaciones China-Taiwán",
        supportLabel: "Apoyar China continental",
        opposeLabel: "Oponerse a China continental",
        desc: "Tensiones transestrecho y reivindicaciones de soberanía"
      },
      'west-decoupling': {
        name: "Desacoplamiento Económico Occidental de China y Rusia",
        supportLabel: "Apoyar el desacoplamiento",
        opposeLabel: "Oponerse al desacoplamiento",
        desc: "Propuestas para reducir la interdependencia económica con China y Rusia"
      }
    },

    // Political Questions
    questions: {
      'econ-1': {
        question: "¿Cómo debería financiarse la atención médica?",
        optionA: "Atención médica universal financiada por el gobierno",
        optionB: "Seguro privado con competencia de mercado"
      },
      'econ-2': {
        question: "¿Cuál es el mejor enfoque para la desigualdad de riqueza?",
        optionA: "Impuestos más altos a los ricos, más redistribución",
        optionB: "Impuestos más bajos, dejar que el mercado libre cree oportunidades"
      },
      'social-1': {
        question: "¿Cómo debería abordar la sociedad los valores tradicionales vs el cambio progresivo?",
        optionA: "Preservar los valores e instituciones tradicionales",
        optionB: "Abrazar el cambio social progresivo"
      },
      'social-2': {
        question: "¿Qué papel debería desempeñar el gobierno en las elecciones de estilo de vida personal?",
        optionA: "El gobierno debería guiar los estándares morales",
        optionB: "Los individuos deberían decidir por sí mismos"
      },
      'diplo-1': {
        question: "¿Cómo debería su país relacionarse con el mundo?",
        optionA: "Priorizar los intereses nacionales, limitar la participación extranjera",
        optionB: "Abrazar la cooperación internacional y las instituciones globales"
      },
      'social-3': {
        question: "¿Debería la religión desempeñar un papel en la política y la gobernanza?",
        optionA: "Sí, los valores religiosos deberían guiar las políticas",
        optionB: "No, mantener la religión separada del gobierno"
      }
    }
  }
};
