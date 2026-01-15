"use strict";
/**
 * Setup news image generation keywords and structure in Firebase
 * Creates 6 categories with 25 keywords each (150 total)
 * Each keyword will later have generated images stored in subcollection
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
// 6 categories × 25 keywords = 150 total
const CATEGORY_KEYWORDS = {
    POLITICS: [
        { keyword: 'capitol_building', description: 'The United States Capitol building in Washington DC, symbol of American democracy and legislative power', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'white_house', description: 'The White House, official residence and workplace of the President of the United States', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'presidential_debate', description: 'Presidential candidates debating on stage during election campaign season', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'voting_booth', description: 'Citizens casting ballots in voting booths during democratic elections', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'political_rally', description: 'Large crowd gathered at political rally with American flags and campaign signs', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'congress_session', description: 'Congressional session in progress with legislators debating policy and laws', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'supreme_court', description: 'Supreme Court building representing the judicial branch of US government', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'oval_office', description: 'Presidential Oval Office where executive decisions and policy announcements are made', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'campaign_trail', description: 'Political candidates on campaign trail meeting voters and giving speeches', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'press_conference', description: 'Government officials holding press conference answering questions from journalists', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'inauguration', description: 'Presidential inauguration ceremony with oath of office and peaceful transfer of power', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'senate_chamber', description: 'United States Senate chamber where senators vote on legislation and policy', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'political_protest', description: 'Citizens exercising free speech rights through peaceful political demonstrations', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'election_night', description: 'Election night coverage with vote counts and results coming in nationwide', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'state_capitol', description: 'State capitol building where local government and legislature conducts business', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'town_hall', description: 'Politicians meeting constituents at town hall events to discuss policy concerns', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'political_advertisement', description: 'Campaign advertisements and political messaging on billboards and media', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'legislative_vote', description: 'Lawmakers casting votes on important legislation in chamber session', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'political_handshake', description: 'Political leaders shaking hands symbolizing diplomacy and bipartisan cooperation', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'ballot_counting', description: 'Election workers counting and verifying ballots to determine election results', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'political_podium', description: 'Political leader speaking at podium with presidential seal and American flags', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'campaign_volunteers', description: 'Campaign volunteers canvassing neighborhoods and phone banking for candidates', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'political_debate_stage', description: 'Empty debate stage with podiums prepared for political candidates', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'voter_registration', description: 'Citizens registering to vote at community centers and election offices', category: 'POLITICS', createdAt: new Date() },
        { keyword: 'american_democracy', description: 'Symbols of American democratic system including Constitution and founding documents', category: 'POLITICS', createdAt: new Date() },
    ],
    TECH: [
        { keyword: 'silicon_valley', description: 'Silicon Valley tech headquarters and innovation hubs in California', category: 'TECH', createdAt: new Date() },
        { keyword: 'data_center', description: 'Massive server farms and data centers powering cloud computing infrastructure', category: 'TECH', createdAt: new Date() },
        { keyword: 'artificial_intelligence', description: 'AI and machine learning algorithms transforming technology and automation', category: 'TECH', createdAt: new Date() },
        { keyword: 'cybersecurity', description: 'Digital security measures protecting networks from cyber attacks and threats', category: 'TECH', createdAt: new Date() },
        { keyword: 'smartphone', description: 'Modern smartphones and mobile devices connecting billions of people worldwide', category: 'TECH', createdAt: new Date() },
        { keyword: 'coding_programming', description: 'Software developers writing code on laptops building apps and platforms', category: 'TECH', createdAt: new Date() },
        { keyword: 'tech_conference', description: 'Technology conferences with product launches and innovation announcements', category: 'TECH', createdAt: new Date() },
        { keyword: 'quantum_computing', description: 'Next-generation quantum computers solving complex computational problems', category: 'TECH', createdAt: new Date() },
        { keyword: 'social_media', description: 'Social media platforms connecting users and shaping digital communication', category: 'TECH', createdAt: new Date() },
        { keyword: 'cloud_computing', description: 'Cloud infrastructure enabling scalable computing and storage solutions', category: 'TECH', createdAt: new Date() },
        { keyword: 'cryptocurrency', description: 'Digital currencies and blockchain technology disrupting financial systems', category: 'TECH', createdAt: new Date() },
        { keyword: 'robotics', description: 'Advanced robots and automation transforming manufacturing and industry', category: 'TECH', createdAt: new Date() },
        { keyword: 'virtual_reality', description: 'VR and AR technologies creating immersive digital experiences', category: 'TECH', createdAt: new Date() },
        { keyword: 'tech_startup', description: 'Technology startups innovating and disrupting traditional industries', category: 'TECH', createdAt: new Date() },
        { keyword: 'semiconductor_chips', description: 'Microchips and semiconductors powering all modern electronic devices', category: 'TECH', createdAt: new Date() },
        { keyword: 'electric_vehicles', description: 'Electric cars and sustainable transportation technology advancing rapidly', category: 'TECH', createdAt: new Date() },
        { keyword: 'space_technology', description: 'Satellites, rockets, and space exploration technology reaching new frontiers', category: 'TECH', createdAt: new Date() },
        { keyword: 'tech_regulation', description: 'Government regulation of technology companies addressing privacy and antitrust', category: 'TECH', createdAt: new Date() },
        { keyword: 'internet_infrastructure', description: 'Global internet infrastructure including fiber optics and 5G networks', category: 'TECH', createdAt: new Date() },
        { keyword: 'tech_acquisition', description: 'Major technology company mergers and acquisitions reshaping industry', category: 'TECH', createdAt: new Date() },
        { keyword: 'software_development', description: 'Developers building software applications and platforms for global users', category: 'TECH', createdAt: new Date() },
        { keyword: 'tech_privacy', description: 'Data privacy concerns and encryption protecting user information online', category: 'TECH', createdAt: new Date() },
        { keyword: 'innovation_lab', description: 'Research and development labs where breakthrough technologies are invented', category: 'TECH', createdAt: new Date() },
        { keyword: 'tech_ipo', description: 'Technology companies going public through initial public offerings', category: 'TECH', createdAt: new Date() },
        { keyword: 'digital_transformation', description: 'Businesses adopting digital technologies to modernize operations and services', category: 'TECH', createdAt: new Date() },
    ],
    MILITARY: [
        { keyword: 'aircraft_carrier', description: 'US Navy aircraft carrier deployed in strategic waters projecting military power', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'fighter_jets', description: 'Advanced fighter jets conducting air superiority and defense missions', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_base', description: 'US military installation with troops, equipment, and strategic operations', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'naval_fleet', description: 'Navy fleet of warships conducting maritime operations and patrols', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'pentagon', description: 'The Pentagon building housing Department of Defense and military leadership', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_training', description: 'Soldiers undergoing combat training and tactical exercises for readiness', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'defense_budget', description: 'Congressional debate over military spending and defense appropriations', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'veterans', description: 'Military veterans and their service to the nation and communities', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_drone', description: 'Unmanned aerial vehicles used for reconnaissance and precision strikes', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'submarine', description: 'Nuclear submarines patrolling oceans as strategic deterrent force', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'army_tanks', description: 'Armored tanks and ground vehicles in military operations and maneuvers', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_helicopter', description: 'Military helicopters conducting transport, attack, and rescue missions', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'special_forces', description: 'Elite special operations forces conducting covert missions worldwide', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'missile_defense', description: 'Missile defense systems protecting against ballistic threats and attacks', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_parade', description: 'Military parade displaying armed forces strength and national pride', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'war_room', description: 'Military command center coordinating operations and strategic decisions', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_technology', description: 'Advanced weapons systems and defense technology being developed', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'naval_base', description: 'Naval base with docked ships and submarine maintenance facilities', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'air_force_base', description: 'Air Force base with runways and aircraft ready for rapid deployment', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_ceremony', description: 'Military ceremony honoring service members and presenting awards', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'defense_contractor', description: 'Defense industry contractors manufacturing military equipment and systems', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_deployment', description: 'Troops deploying overseas for combat operations or peacekeeping missions', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'cyber_warfare', description: 'Military cyber operations defending networks and conducting digital warfare', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'military_alliance', description: 'NATO and military alliances coordinating defense strategy between nations', category: 'MILITARY', createdAt: new Date() },
        { keyword: 'nuclear_weapons', description: 'Nuclear arsenal and deterrence strategy maintaining strategic stability', category: 'MILITARY', createdAt: new Date() },
    ],
    WORLD: [
        { keyword: 'united_nations', description: 'UN headquarters and international diplomacy addressing global challenges', category: 'WORLD', createdAt: new Date() },
        { keyword: 'global_summit', description: 'World leaders meeting at international summit to discuss cooperation', category: 'WORLD', createdAt: new Date() },
        { keyword: 'international_airport', description: 'Busy international airport connecting countries through global travel', category: 'WORLD', createdAt: new Date() },
        { keyword: 'foreign_embassy', description: 'Foreign embassy representing diplomatic relations between nations', category: 'WORLD', createdAt: new Date() },
        { keyword: 'world_map', description: 'Global map showing international borders and geopolitical relationships', category: 'WORLD', createdAt: new Date() },
        { keyword: 'international_trade', description: 'Container ships and ports facilitating global trade and commerce', category: 'WORLD', createdAt: new Date() },
        { keyword: 'refugee_crisis', description: 'Humanitarian crisis with refugees fleeing conflict and seeking asylum', category: 'WORLD', createdAt: new Date() },
        { keyword: 'climate_change', description: 'Global climate impacts including extreme weather and environmental damage', category: 'WORLD', createdAt: new Date() },
        { keyword: 'international_conflict', description: 'Geopolitical tensions and conflicts between nations affecting stability', category: 'WORLD', createdAt: new Date() },
        { keyword: 'global_pandemic', description: 'Worldwide health crisis requiring international coordination and response', category: 'WORLD', createdAt: new Date() },
        { keyword: 'diplomatic_meeting', description: 'Diplomats negotiating treaties and agreements between countries', category: 'WORLD', createdAt: new Date() },
        { keyword: 'world_heritage', description: 'UNESCO World Heritage sites representing global cultural significance', category: 'WORLD', createdAt: new Date() },
        { keyword: 'international_aid', description: 'Humanitarian aid organizations providing relief to crisis-affected regions', category: 'WORLD', createdAt: new Date() },
        { keyword: 'global_economy', description: 'International economic indicators and trade relationships between nations', category: 'WORLD', createdAt: new Date() },
        { keyword: 'foreign_policy', description: 'Nations conducting diplomacy and establishing international relations', category: 'WORLD', createdAt: new Date() },
        { keyword: 'border_crossing', description: 'International borders and immigration checkpoints between countries', category: 'WORLD', createdAt: new Date() },
        { keyword: 'world_currency', description: 'Global currencies and foreign exchange markets affecting economies', category: 'WORLD', createdAt: new Date() },
        { keyword: 'international_law', description: 'International courts and legal frameworks governing global relations', category: 'WORLD', createdAt: new Date() },
        { keyword: 'global_poverty', description: 'Economic inequality and poverty affecting developing nations worldwide', category: 'WORLD', createdAt: new Date() },
        { keyword: 'world_politics', description: 'Global political movements and ideological shifts across continents', category: 'WORLD', createdAt: new Date() },
        { keyword: 'international_sanctions', description: 'Economic sanctions imposed between nations for political pressure', category: 'WORLD', createdAt: new Date() },
        { keyword: 'global_migration', description: 'Mass migration patterns and demographic shifts affecting countries', category: 'WORLD', createdAt: new Date() },
        { keyword: 'world_health', description: 'Global health initiatives and disease prevention programs across borders', category: 'WORLD', createdAt: new Date() },
        { keyword: 'cultural_exchange', description: 'International cultural exchanges fostering understanding between nations', category: 'WORLD', createdAt: new Date() },
        { keyword: 'global_cooperation', description: 'Countries working together on shared challenges like climate and security', category: 'WORLD', createdAt: new Date() },
    ],
    BUSINESS: [
        { keyword: 'stock_market', description: 'Stock market trading floor with brokers buying and selling securities', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'wall_street', description: 'Wall Street financial district in New York representing global finance', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'corporate_headquarters', description: 'Modern corporate office buildings housing Fortune 500 companies', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'business_meeting', description: 'Executive board meeting discussing company strategy and quarterly results', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'startup_office', description: 'Tech startup office with entrepreneurs building innovative businesses', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'financial_charts', description: 'Stock charts and financial graphs showing market trends and analysis', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'earnings_report', description: 'Company earnings announcement affecting stock price and investor sentiment', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'merger_acquisition', description: 'Corporate merger or acquisition creating industry consolidation', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'ipo_launch', description: 'Company going public with initial public offering on stock exchange', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'business_handshake', description: 'Business partners shaking hands to seal deal or partnership agreement', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'skyscraper', description: 'Modern glass skyscraper symbolizing corporate power and economic growth', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'trading_floor', description: 'Stock exchange trading floor with traders executing buy and sell orders', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'business_analytics', description: 'Data analytics and business intelligence driving decision making', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'corporate_scandal', description: 'Business ethics violation or corporate fraud investigation unfolding', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'retail_stores', description: 'Retail businesses and shopping centers serving consumer markets', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'manufacturing_plant', description: 'Industrial manufacturing facility producing goods at scale', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'supply_chain', description: 'Global supply chain logistics moving products from factories to consumers', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'business_bankruptcy', description: 'Company filing bankruptcy protection amid financial difficulties', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'venture_capital', description: 'Venture capitalists funding startups and early stage companies', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'corporate_leadership', description: 'CEO and executive leadership team guiding company vision and strategy', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'business_contract', description: 'Legal contracts and agreements between companies and partners', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'market_volatility', description: 'Stock market experiencing high volatility and rapid price swings', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'business_expansion', description: 'Companies expanding operations into new markets and territories', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'economic_recession', description: 'Economic downturn affecting businesses and employment nationwide', category: 'BUSINESS', createdAt: new Date() },
        { keyword: 'corporate_profits', description: 'Record corporate profits and shareholder returns driving stock gains', category: 'BUSINESS', createdAt: new Date() },
    ],
    DEFAULT: [
        { keyword: 'breaking_news', description: 'Television broadcast of breaking news alert with urgent developments', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'newspaper_print', description: 'Traditional newspaper printing press producing daily editions', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_anchor', description: 'Television news anchor reporting current events from broadcast studio', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'journalism', description: 'Journalists investigating stories and reporting news to public', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'press_freedom', description: 'Free press and independent media holding power accountable', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_camera', description: 'News camera crews filming on-location coverage of live events', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'headline_news', description: 'Front page newspaper headlines covering major stories of the day', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_studio', description: 'Television news studio with anchors and production crew', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'reporter_microphone', description: 'News reporter with microphone conducting interviews and reporting', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_van', description: 'Broadcast news van with satellite equipment for live field reporting', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'media_interview', description: 'Subject being interviewed by multiple reporters and camera crews', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_deadline', description: 'Newsroom racing against deadline to publish breaking story', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'editorial_meeting', description: 'News editors deciding which stories to cover and how to frame them', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'fact_checking', description: 'Journalists verifying facts and sources before publishing stories', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_alert', description: 'Mobile phone notifications alerting users to breaking news developments', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'photojournalism', description: 'Photojournalists capturing powerful images documenting news events', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_website', description: 'Digital news platforms delivering stories online to global audiences', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'investigative_journalism', description: 'Journalists conducting deep investigations exposing corruption and wrongdoing', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_broadcast', description: 'Live television news broadcast covering current events and analysis', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'press_badge', description: 'Journalist press credentials granting access to news events and coverage', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_archive', description: 'Historical news archives preserving important stories for future reference', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'media_bias', description: 'Debate over media bias and objectivity in news coverage', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_subscription', description: 'Readers subscribing to quality journalism and supporting news organizations', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'live_reporting', description: 'Reporters providing live updates from scene of developing news story', category: 'DEFAULT', createdAt: new Date() },
        { keyword: 'news_ethics', description: 'Journalistic ethics and standards guiding responsible news reporting', category: 'DEFAULT', createdAt: new Date() },
    ],
};
async function setupKeywords() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📸 SETTING UP NEWS IMAGE GENERATION STRUCTURE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    const collectionRef = db.collection('news_image_generation');
    let successCount = 0;
    let errorCount = 0;
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        console.log(`\n🏷️  Creating ${category} document with ${keywords.length} keywords...`);
        try {
            // Create ONE document per category with all keywords as array
            const categoryDoc = collectionRef.doc(category);
            // Convert keywords to simple array format
            const keywordsArray = keywords.map(k => ({
                keyword: k.keyword,
                description: k.description
            }));
            await categoryDoc.set({
                category: category,
                keywords: keywordsArray,
                totalKeywords: keywords.length,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });
            successCount++;
            console.log(`  ✓ Created ${category} with ${keywords.length} keywords`);
        }
        catch (error) {
            errorCount++;
            console.error(`  ✗ Failed to create ${category}:`, error);
        }
    }
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📊 SETUP COMPLETE`);
    console.log(`   Categories created: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📁 Structure created:');
    console.log('   news_image_generation/');
    console.log('   ├── POLITICS/ (25 keywords)');
    console.log('   │   └── images/ (subcollection - ready for generated images)');
    console.log('   ├── TECH/ (25 keywords)');
    console.log('   ├── MILITARY/ (25 keywords)');
    console.log('   ├── WORLD/ (25 keywords)');
    console.log('   ├── BUSINESS/ (25 keywords)');
    console.log('   └── DEFAULT/ (25 keywords)\n');
    console.log('💡 Next step: Run image generation script to populate images/ subcollections\n');
    process.exit(0);
}
setupKeywords().catch(err => {
    console.error('Setup failed:', err);
    process.exit(1);
});
//# sourceMappingURL=setup-news-image-keywords.js.map