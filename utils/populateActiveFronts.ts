/**
 * Multi-Language Active Fronts Campaign Population Utility
 *
 * Generates campaigns in 5 languages: EN, ZH, JA, FR, ES
 * Total campaigns: 188 base campaigns × 5 languages = 940 campaigns
 *
 * Campaign ID format: {type}_{target}_{action}_{language}
 * Examples:
 * - company_aapl_oppose_EN
 * - company_aapl_oppose_ZH
 * - sector_technology_support_FR
 *
 * Usage (in browser console):
 * - window.populateActiveFronts() - Generate ALL 940 campaigns (188 × 5 languages)
 * - window.populateActiveFronts('example') - Generate 40 example campaigns (8 × 5 languages)
 * - window.populateActiveFronts('example', 'EN') - Generate 8 example campaigns (English only)
 */

import { SP500_COMPANIES, getAllSectors, getCompaniesBySector } from '../data/sp500Companies';
import { Campaign, Language } from '../types';
import { saveCampaign } from '../services/activeFrontsService';

// All supported languages
const ALL_LANGUAGES: Language[] = [Language.EN, Language.ZH, Language.JA, Language.FR, Language.ES];

/**
 * Generate campaign ID with language suffix
 */
export const generateCampaignId = (
  targetType: 'COMPANY' | 'SECTOR',
  target: string,
  campaignType: 'SUPPORT' | 'OPPOSE',
  language: Language
): string => {
  const prefix = targetType === 'COMPANY' ? 'company' : 'sector';
  const sanitizedTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const action = campaignType.toLowerCase();
  return `${prefix}_${sanitizedTarget}_${action}_${language}`;
};

/**
 * Generate base ID (without language suffix)
 */
export const generateBaseId = (
  targetType: 'COMPANY' | 'SECTOR',
  target: string,
  campaignType: 'SUPPORT' | 'OPPOSE'
): string => {
  const prefix = targetType === 'COMPANY' ? 'company' : 'sector';
  const sanitizedTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const action = campaignType.toLowerCase();
  return `${prefix}_${sanitizedTarget}_${action}`;
};

/**
 * Translate campaign title
 */
const translateTitle = (
  targetType: 'COMPANY' | 'SECTOR',
  targetName: string,
  campaignType: 'SUPPORT' | 'OPPOSE',
  language: Language
): string => {
  const templates = {
    [Language.EN]: {
      SECTOR_SUPPORT: `Support ${targetName} Innovation`,
      SECTOR_OPPOSE: `Reform ${targetName} Practices`,
      COMPANY_SUPPORT: `Back ${targetName}`,
      COMPANY_OPPOSE: `Hold ${targetName} Accountable`
    },
    [Language.ZH]: {
      SECTOR_SUPPORT: `支持${targetName}创新`,
      SECTOR_OPPOSE: `改革${targetName}行业实践`,
      COMPANY_SUPPORT: `支持${targetName}`,
      COMPANY_OPPOSE: `要求${targetName}负责`
    },
    [Language.JA]: {
      SECTOR_SUPPORT: `${targetName}イノベーションを支援`,
      SECTOR_OPPOSE: `${targetName}業界改革`,
      COMPANY_SUPPORT: `${targetName}を支援`,
      COMPANY_OPPOSE: `${targetName}に説明責任を求める`
    },
    [Language.FR]: {
      SECTOR_SUPPORT: `Soutenir l'innovation ${targetName}`,
      SECTOR_OPPOSE: `Réformer les pratiques ${targetName}`,
      COMPANY_SUPPORT: `Soutenir ${targetName}`,
      COMPANY_OPPOSE: `Responsabiliser ${targetName}`
    },
    [Language.ES]: {
      SECTOR_SUPPORT: `Apoyar la innovación de ${targetName}`,
      SECTOR_OPPOSE: `Reformar prácticas de ${targetName}`,
      COMPANY_SUPPORT: `Apoyar a ${targetName}`,
      COMPANY_OPPOSE: `Responsabilizar a ${targetName}`
    }
  };

  const key = targetType === 'SECTOR'
    ? (campaignType === 'SUPPORT' ? 'SECTOR_SUPPORT' : 'SECTOR_OPPOSE')
    : (campaignType === 'SUPPORT' ? 'COMPANY_SUPPORT' : 'COMPANY_OPPOSE');

  return templates[language][key];
};

/**
 * Translate campaign description
 */
const translateDescription = (
  targetType: 'COMPANY' | 'SECTOR',
  targetName: string,
  campaignType: 'SUPPORT' | 'OPPOSE',
  language: Language
): string => {
  if (language === Language.EN) {
    if (targetType === 'SECTOR') {
      return campaignType === 'SUPPORT'
        ? `Join the movement to support ${targetName} sector companies that prioritize innovation, sustainability, and ethical business practices. Together, we can amplify positive change and reward corporate responsibility.`
        : `Stand against harmful practices in the ${targetName} sector. Demand transparency, accountability, and reform. Your collective action can drive real change and protect communities.`;
    } else {
      return campaignType === 'SUPPORT'
        ? `Support ${targetName} for their demonstrated commitment to values that matter. By participating in this campaign, you're voting with your wallet and amplifying positive corporate behavior that aligns with your principles.`
        : `Hold ${targetName} accountable for practices that conflict with our shared values. This campaign demands transparency, reform, and corporate responsibility. Together, our collective voice can drive meaningful change.`;
    }
  } else if (language === Language.ZH) {
    if (targetType === 'SECTOR') {
      return campaignType === 'SUPPORT'
        ? `加入我们，支持${targetName}行业中优先考虑创新、可持续性和道德商业实践的公司。我们共同的行动可以放大积极变革，奖励负责任的企业行为。`
        : `抵制${targetName}行业的有害做法。要求透明度、问责制和改革。你的集体行动可以推动真正的变革，保护社区。`;
    } else {
      return campaignType === 'SUPPORT'
        ? `支持${targetName}对重要价值观的承诺。参与此活动，你用钱包投票，放大符合你原则的积极企业行为。`
        : `要求${targetName}对与我们共同价值观冲突的做法负责。此活动要求透明度、改革和企业责任。我们的集体声音可以推动有意义的变革。`;
    }
  } else if (language === Language.JA) {
    if (targetType === 'SECTOR') {
      return campaignType === 'SUPPORT'
        ? `革新、持続可能性、倫理的なビジネス慣行を優先する${targetName}セクターの企業を支援する運動に参加しましょう。共に、前向きな変化を増幅し、企業責任に報いることができます。`
        : `${targetName}セクターの有害な慣行に反対します。透明性、説明責任、改革を要求します。あなたの集団行動が真の変化を推進し、コミュニティを保護できます。`;
    } else {
      return campaignType === 'SUPPORT'
        ? `重要な価値観への${targetName}の実証されたコミットメントを支援します。このキャンペーンに参加することで、あなたは財布で投票し、あなたの原則に沿った積極的な企業行動を増幅させています。`
        : `私たちの共有価値観と矛盾する慣行について${targetName}に説明責任を求めます。このキャンペーンは透明性、改革、企業責任を要求します。共に、私たちの集団的な声が有意義な変化を推進できます。`;
    }
  } else if (language === Language.FR) {
    if (targetType === 'SECTOR') {
      return campaignType === 'SUPPORT'
        ? `Rejoignez le mouvement pour soutenir les entreprises du secteur ${targetName} qui privilégient l'innovation, la durabilité et les pratiques commerciales éthiques. Ensemble, nous pouvons amplifier le changement positif et récompenser la responsabilité des entreprises.`
        : `Opposez-vous aux pratiques nuisibles dans le secteur ${targetName}. Exigez transparence, responsabilité et réforme. Votre action collective peut générer un changement réel et protéger les communautés.`;
    } else {
      return campaignType === 'SUPPORT'
        ? `Soutenez ${targetName} pour son engagement démontré envers les valeurs qui comptent. En participant à cette campagne, vous votez avec votre portefeuille et amplifiez un comportement d'entreprise positif qui s'aligne sur vos principes.`
        : `Tenez ${targetName} responsable des pratiques qui entrent en conflit avec nos valeurs partagées. Cette campagne exige transparence, réforme et responsabilité d'entreprise. Ensemble, notre voix collective peut générer un changement significatif.`;
    }
  } else { // ES
    if (targetType === 'SECTOR') {
      return campaignType === 'SUPPORT'
        ? `Únete al movimiento para apoyar a las empresas del sector ${targetName} que priorizan la innovación, la sostenibilidad y las prácticas comerciales éticas. Juntos, podemos amplificar el cambio positivo y recompensar la responsabilidad corporativa.`
        : `Oponte a las prácticas dañinas en el sector ${targetName}. Exige transparencia, responsabilidad y reforma. Tu acción colectiva puede impulsar un cambio real y proteger a las comunidades.`;
    } else {
      return campaignType === 'SUPPORT'
        ? `Apoya a ${targetName} por su compromiso demostrado con valores que importan. Al participar en esta campaña, estás votando con tu billetera y amplificando un comportamiento corporativo positivo que se alinea con tus principios.`
        : `Haz que ${targetName} rinda cuentas por prácticas que entran en conflicto con nuestros valores compartidos. Esta campaña exige transparencia, reforma y responsabilidad corporativa. Juntos, nuestra voz colectiva puede impulsar un cambio significativo.`;
    }
  }
};

/**
 * Translate political statement
 */
const translatePoliticalStatement = (
  targetType: 'COMPANY' | 'SECTOR',
  targetName: string,
  campaignType: 'SUPPORT' | 'OPPOSE',
  language: Language
): string => {
  // For brevity, only implementing EN. Others can be added later.
  if (language === Language.EN) {
    if (targetType === 'SECTOR') {
      return campaignType === 'SUPPORT'
        ? `We believe that the ${targetName} sector has the potential to drive positive change in our society. By supporting companies in this sector that prioritize ethical practices, environmental sustainability, and social responsibility, we are investing in a better future. Our collective economic power can reward corporate behavior that aligns with our values and creates lasting positive impact.`
        : `The ${targetName} sector has demonstrated patterns of behavior that harm workers, communities, and our environment. We demand comprehensive reform, transparency in operations, and accountability for corporate actions. Through collective economic action, we will pressure these companies to prioritize people and planet over profit. Our organized response sends a clear message: business as usual is no longer acceptable.`;
    } else {
      return campaignType === 'SUPPORT'
        ? `${targetName} has demonstrated leadership in areas that matter to us. By supporting this company through our economic choices, we are amplifying positive corporate behavior and sending a clear market signal about the values we expect from major corporations. Our collective support can help this company continue its positive trajectory and inspire others to follow.`
        : `${targetName}'s actions have shown a pattern of prioritizing shareholder value over stakeholder wellbeing. We demand immediate reform, transparent disclosure of practices, and meaningful accountability measures. Through organized collective action, we will use our economic power to pressure this company to change course. This is not just about one company—it's about establishing standards for corporate behavior that protect workers, communities, and our shared future.`;
    }
  }

  // For other languages, use a placeholder for now (can be improved with AI translation later)
  return translateDescription(targetType, targetName, campaignType, language);
};

/**
 * Translate goals array
 */
const translateGoals = (
  targetType: 'COMPANY' | 'SECTOR',
  targetName: string,
  campaignType: 'SUPPORT' | 'OPPOSE',
  language: Language
): string[] => {
  if (targetType === 'SECTOR') {
    if (campaignType === 'SUPPORT') {
      return {
        [Language.EN]: ['Promote ethical business practices', 'Support innovation and sustainability', 'Encourage corporate transparency'],
        [Language.ZH]: ['促进道德商业实践', '支持创新和可持续发展', '鼓励企业透明度'],
        [Language.JA]: ['倫理的なビジネス慣行を促進', 'イノベーションと持続可能性を支援', '企業の透明性を奨励'],
        [Language.FR]: ['Promouvoir des pratiques commerciales éthiques', 'Soutenir l\'innovation et la durabilité', 'Encourager la transparence des entreprises'],
        [Language.ES]: ['Promover prácticas comerciales éticas', 'Apoyar la innovación y sostenibilidad', 'Fomentar la transparencia corporativa']
      }[language];
    } else {
      return {
        [Language.EN]: ['Demand corporate accountability', 'Reform harmful industry practices', 'Protect workers and communities'],
        [Language.ZH]: ['要求企业问责', '改革有害的行业实践', '保护工人和社区'],
        [Language.JA]: ['企業の説明責任を要求', '有害な業界慣行を改革', '労働者とコミュニティを保護'],
        [Language.FR]: ['Exiger la responsabilité des entreprises', 'Réformer les pratiques nuisibles', 'Protéger les travailleurs et les communautés'],
        [Language.ES]: ['Exigir responsabilidad corporativa', 'Reformar prácticas dañinas', 'Proteger a trabajadores y comunidades']
      }[language];
    }
  } else {
    if (campaignType === 'SUPPORT') {
      return {
        [Language.EN]: [`Support ${targetName}'s positive impact`, 'Encourage continued ethical practices', 'Build a values-aligned investment community'],
        [Language.ZH]: [`支持${targetName}的积极影响`, '鼓励继续道德实践', '建立价值观一致的投资社区'],
        [Language.JA]: [`${targetName}の積極的な影響を支援`, '継続的な倫理的実践を奨励', '価値観に沿った投資コミュニティを構築'],
        [Language.FR]: [`Soutenir l'impact positif de ${targetName}`, 'Encourager les pratiques éthiques continues', 'Créer une communauté d\'investissement alignée sur les valeurs'],
        [Language.ES]: [`Apoyar el impacto positivo de ${targetName}`, 'Fomentar prácticas éticas continuas', 'Construir una comunidad de inversión alineada con valores']
      }[language];
    } else {
      return {
        [Language.EN]: [`Hold ${targetName} accountable`, 'Demand transparency and reform', 'Protect stakeholder interests'],
        [Language.ZH]: [`要求${targetName}负责`, '要求透明度和改革', '保护利益相关者利益'],
        [Language.JA]: [`${targetName}に説明責任を求める`, '透明性と改革を要求', 'ステークホルダーの利益を保護'],
        [Language.FR]: [`Tenir ${targetName} responsable`, 'Exiger transparence et réforme', 'Protéger les intérêts des parties prenantes'],
        [Language.ES]: [`Responsabilizar a ${targetName}`, 'Exigir transparencia y reforma', 'Proteger intereses de stakeholders']
      }[language];
    }
  }
};

/**
 * Generate random start date (within last 30 days)
 */
const generateStartDate = (): string => {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return startDate.toISOString();
};

/**
 * Calculate days active from start date
 */
const calculateDaysActive = (startDate: string): number => {
  const start = new Date(startDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Generate a single campaign in one language
 */
const generateCampaign = (
  targetType: 'COMPANY' | 'SECTOR',
  target: string, // ticker symbol or sector name (EN)
  campaignType: 'SUPPORT' | 'OPPOSE',
  language: Language,
  ticker?: string,
  sector?: string,
  companiesInSector?: string[]
): Campaign => {
  const baseId = generateBaseId(targetType, target, campaignType);
  const id = generateCampaignId(targetType, target, campaignType, language);
  const startDate = generateStartDate();
  const daysActive = calculateDaysActive(startDate);

  // Get localized target name
  const localizedTarget = target; // TODO: Add translation for company/sector names if needed

  // Build campaign object, only including fields that have values
  const campaign: Campaign = {
    id,
    language,
    baseId,
    title: translateTitle(targetType, localizedTarget, campaignType, language),
    target: localizedTarget,
    targetType,
    type: campaignType === 'SUPPORT' ? 'BUYCOTT' : 'BOYCOTT',
    participants: 0,
    goal: targetType === 'SECTOR' ? 10000 : 5000,
    description: translateDescription(targetType, localizedTarget, campaignType, language),
    daysActive,
    metadata: {
      createdAt: startDate,
      updatedAt: new Date().toISOString(),
      startDate,
      totalBoycottAmount: 0,
      totalBuycottAmount: 0,
      uniqueParticipants: 0,
      goals: translateGoals(targetType, localizedTarget, campaignType, language),
      politicalStatement: translatePoliticalStatement(targetType, localizedTarget, campaignType, language)
    },
    offlineActivity: {
      hasProposal: false
    }
  };

  // Only add optional fields if they have values
  if (ticker) campaign.ticker = ticker;
  if (sector) campaign.sector = sector;
  if (companiesInSector && companiesInSector.length > 0) campaign.companiesInSector = companiesInSector;

  return campaign;
};

/**
 * Generate sector campaigns for all languages (or specific language)
 */
export const generateSectorCampaigns = (languages?: Language[]): Campaign[] => {
  const targetLanguages = languages || ALL_LANGUAGES;
  const sectors = getAllSectors();
  const campaigns: Campaign[] = [];

  for (const sector of sectors) {
    const companiesInSector = getCompaniesBySector(sector).map(c => c.name);

    for (const language of targetLanguages) {
      // SUPPORT campaign
      campaigns.push(generateCampaign('SECTOR', sector, 'SUPPORT', language, undefined, sector, companiesInSector));

      // OPPOSE campaign
      campaigns.push(generateCampaign('SECTOR', sector, 'OPPOSE', language, undefined, sector, companiesInSector));
    }
  }

  return campaigns;
};

/**
 * Generate company campaigns for all languages (or specific language)
 */
export const generateCompanyCampaigns = (languages?: Language[]): Campaign[] => {
  const targetLanguages = languages || ALL_LANGUAGES;
  const campaigns: Campaign[] = [];

  for (const company of SP500_COMPANIES) {
    for (const language of targetLanguages) {
      // SUPPORT campaign
      campaigns.push(generateCampaign('COMPANY', company.symbol, 'SUPPORT', language, company.symbol, company.sector));

      // OPPOSE campaign
      campaigns.push(generateCampaign('COMPANY', company.symbol, 'OPPOSE', language, company.symbol, company.sector));
    }
  }

  return campaigns;
};

/**
 * Generate example campaigns (Apple & Exxon, Technology & Energy) for all languages
 */
export const generateExampleCampaigns = (languages?: Language[]): Campaign[] => {
  const targetLanguages = languages || ALL_LANGUAGES;
  const campaigns: Campaign[] = [];

  // Example companies
  const exampleCompanies = [
    SP500_COMPANIES.find(c => c.symbol === 'AAPL'),
    SP500_COMPANIES.find(c => c.symbol === 'XOM')
  ].filter(c => c !== undefined);

  for (const company of exampleCompanies) {
    if (!company) continue;

    for (const language of targetLanguages) {
      campaigns.push(generateCampaign('COMPANY', company.symbol, 'SUPPORT', language, company.symbol, company.sector));
      campaigns.push(generateCampaign('COMPANY', company.symbol, 'OPPOSE', language, company.symbol, company.sector));
    }
  }

  // Example sectors
  const exampleSectors = ['Technology', 'Energy'];

  for (const sector of exampleSectors) {
    const companiesInSector = getCompaniesBySector(sector).map(c => c.name);

    for (const language of targetLanguages) {
      campaigns.push(generateCampaign('SECTOR', sector, 'SUPPORT', language, undefined, sector, companiesInSector));
      campaigns.push(generateCampaign('SECTOR', sector, 'OPPOSE', language, undefined, sector, companiesInSector));
    }
  }

  return campaigns;
};

/**
 * Save campaigns to Firebase
 */
export const saveCampaignsToFirebase = async (campaigns: Campaign[]): Promise<void> => {
  console.log(`[Populate Active Fronts] Saving ${campaigns.length} campaigns to Firebase...`);

  let successCount = 0;
  let errorCount = 0;

  for (const campaign of campaigns) {
    try {
      await saveCampaign(campaign);
      successCount++;

      // Log progress every 20 campaigns
      if (successCount % 20 === 0) {
        console.log(`[Populate Active Fronts] Progress: ${successCount}/${campaigns.length}`);
      }
    } catch (error) {
      console.error(`[Populate Active Fronts] Error saving campaign ${campaign.id}:`, error);
      errorCount++;
    }
  }

  console.log(`[Populate Active Fronts] Complete! Success: ${successCount}, Errors: ${errorCount}`);
};

/**
 * Main function to populate Active Fronts campaigns
 * @param type - 'all' | 'example' | 'sector' | 'company'
 * @param language - Optional: specific language, or undefined for all 5 languages
 */
export const populateActiveFronts = async (
  type: 'all' | 'example' | 'sector' | 'company' = 'all',
  language?: Language
): Promise<void> => {
  const languages = language ? [language] : ALL_LANGUAGES;
  console.log(`[Populate Active Fronts] Starting population (type: ${type}, languages: ${languages.join(', ')})...`);

  let campaigns: Campaign[] = [];

  if (type === 'example') {
    console.log(`[Populate Active Fronts] Generating example campaigns for ${languages.length} language(s)...`);
    campaigns = generateExampleCampaigns(languages);
    console.log(`[Populate Active Fronts] Generated ${campaigns.length} example campaigns`);
  } else {
    if (type === 'all' || type === 'sector') {
      console.log(`[Populate Active Fronts] Generating sector campaigns for ${languages.length} language(s)...`);
      const sectorCampaigns = generateSectorCampaigns(languages);
      campaigns.push(...sectorCampaigns);
      console.log(`[Populate Active Fronts] Generated ${sectorCampaigns.length} sector campaigns`);
    }

    if (type === 'all' || type === 'company') {
      console.log(`[Populate Active Fronts] Generating company campaigns for ${languages.length} language(s)...`);
      const companyCampaigns = generateCompanyCampaigns(languages);
      campaigns.push(...companyCampaigns);
      console.log(`[Populate Active Fronts] Generated ${companyCampaigns.length} company campaigns`);
    }
  }

  console.log(`[Populate Active Fronts] Total campaigns to save: ${campaigns.length}`);
  await saveCampaignsToFirebase(campaigns);
};

/**
 * Debug function to view all campaigns in Firebase
 */
export const debugViewCampaigns = async (): Promise<void> => {
  const { getAllCampaigns } = await import('../services/activeFrontsService');
  const camps = await getAllCampaigns();
  console.log(`📊 Total campaigns in Firebase: ${camps.length}`);
  console.table(camps.map(c => ({
    id: c.id,
    language: c.language,
    target: c.target,
    targetType: c.targetType,
    type: c.type,
    sector: c.sector,
    ticker: c.ticker
  })));
  return;
};

/**
 * Add offline activity to a campaign (all language versions)
 */
export const addOfflineActivity = async (
  baseId: string, // e.g., "company_aapl_oppose" (without language suffix)
  offlineData: {
    isLegallyCompliant?: boolean;
    events?: Array<{
      date: string;
      city: string;
      state: string;
      country: string;
      address?: string;
      attendees?: number;
    }>;
    legalCounsel?: {
      name: string;
      firm: string;
      city: string;
      state: string;
      country: string;
      phone: string;
    };
    policeInfo?: {
      department: string;
      address: string;
      city: string;
      state: string;
      country: string;
      phone: string;
      emergencyContact?: string;
    };
  }
): Promise<void> => {
  const { getCampaignById, saveCampaign } = await import('../services/activeFrontsService');

  try {
    // Update all language versions of this campaign
    for (const language of ALL_LANGUAGES) {
      const campaignId = `${baseId}_${language}`;
      const campaign = await getCampaignById(campaignId);

      if (!campaign) {
        console.warn(`⚠️ Campaign not found: ${campaignId}`);
        continue;
      }

      // Add offline activity
      const updatedCampaign = {
        ...campaign,
        offlineActivity: {
          hasProposal: true,
          isLegallyCompliant: offlineData.isLegallyCompliant,
          events: offlineData.events?.map((e, index) => ({
            id: `event_${index + 1}`,
            ...e
          })),
          legalCounsel: offlineData.legalCounsel,
          policeInfo: offlineData.policeInfo
        }
      };

      await saveCampaign(updatedCampaign);
      console.log(`✅ Updated ${campaignId}`);
    }

    console.log(`✅ Added offline activity to all language versions of: ${baseId}`);
  } catch (error) {
    console.error(`❌ Error adding offline activity:`, error);
  }
};

// Make it available in browser console
if (typeof window !== 'undefined') {
  (window as any).populateActiveFronts = populateActiveFronts;
  (window as any).generateSectorCampaigns = generateSectorCampaigns;
  (window as any).generateCompanyCampaigns = generateCompanyCampaigns;
  (window as any).generateExampleCampaigns = generateExampleCampaigns;
  (window as any).debugViewCampaigns = debugViewCampaigns;
  (window as any).addOfflineActivity = addOfflineActivity;
  console.log('✅ Active Fronts Multi-Language utilities loaded!');
  console.log('Usage:');
  console.log('  window.populateActiveFronts()                  - Generate ALL 940 campaigns (188 × 5 languages)');
  console.log('  window.populateActiveFronts("example")         - Generate 40 example campaigns (8 × 5 languages)');
  console.log('  window.populateActiveFronts("example", "EN")   - Generate 8 example campaigns (English only)');
  console.log('  window.populateActiveFronts("all", "ZH")       - Generate 188 campaigns (Chinese only)');
  console.log('  window.debugViewCampaigns()                    - View all campaigns in Firebase (table format)');
  console.log('  window.addOfflineActivity(baseId, data)        - Add offline activity to all language versions');
}
