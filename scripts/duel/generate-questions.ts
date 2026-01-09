/**
 * Generate DUEL Arena Questions with AI-Generated Images
 *
 * This script generates 150 questions (40 easy, 70 medium, 40 hard) with AI-generated images
 * using Google's Gemini API for image generation.
 *
 * Usage:
 *   npx ts-node scripts/duel/generate-questions.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';

// Firebase config (use your project config)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  projectId: 'gen-lang-client-0960644135',
  // ... other config
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Get Gemini API key from environment
const getGeminiApiKey = async (): Promise<string> => {
  // In production, fetch from Google Secret Manager
  return process.env.GEMINI_API_KEY || '';
};

interface QuestionTemplate {
  id: string;
  stem: string;
  correct: string; // Text description for AI to generate
  distractors: string[]; // Text descriptions for AI to generate
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  category: 'FLAGS' | 'LANDMARKS' | 'ANIMALS' | 'LOGOS' | 'FOOD' | 'SYMBOLS';
}

// 150 Question Templates
const QUESTION_TEMPLATES: QuestionTemplate[] = [
  // ============ EASY QUESTIONS (40) ============

  // FLAGS - Easy (10)
  { id: 'q001', stem: 'Flag of the United States', correct: 'American flag with stars and stripes', distractors: ['Flag of Liberia', 'Flag of Malaysia', 'Flag of Chile'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q002', stem: 'Flag of Japan', correct: 'Japanese flag with red circle on white', distractors: ['Flag of Bangladesh', 'Flag of Palau', 'Flag of South Korea'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q003', stem: 'Flag of Canada', correct: 'Canadian flag with red maple leaf', distractors: ['Flag of Peru', 'Flag of Austria', 'Flag of Lebanon'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q004', stem: 'Flag of the United Kingdom', correct: 'British Union Jack flag', distractors: ['Flag of Australia', 'Flag of New Zealand', 'Flag of Iceland'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q005', stem: 'Flag of China', correct: 'Chinese flag with yellow stars on red', distractors: ['Flag of Vietnam', 'Flag of Morocco', 'Flag of Turkey'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q006', stem: 'Flag of Germany', correct: 'German flag with black red yellow horizontal stripes', distractors: ['Flag of Belgium', 'Flag of Lithuania', 'Flag of Armenia'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q007', stem: 'Flag of France', correct: 'French flag with blue white red vertical stripes', distractors: ['Flag of Netherlands', 'Flag of Russia', 'Flag of Luxembourg'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q008', stem: 'Flag of Italy', correct: 'Italian flag with green white red vertical stripes', distractors: ['Flag of Mexico', 'Flag of Ireland', 'Flag of Hungary'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q009', stem: 'Flag of Brazil', correct: 'Brazilian flag with green yellow blue diamond', distractors: ['Flag of Portugal', 'Flag of Cape Verde', 'Flag of Senegal'], difficulty: 'EASY', category: 'FLAGS' },
  { id: 'q010', stem: 'Flag of South Korea', correct: 'South Korean flag with yin-yang symbol', distractors: ['Flag of North Korea', 'Flag of Mongolia', 'Flag of Kazakhstan'], difficulty: 'EASY', category: 'FLAGS' },

  // LANDMARKS - Easy (10)
  { id: 'q011', stem: 'Eiffel Tower', correct: 'Eiffel Tower in Paris', distractors: ['Tokyo Tower in Japan', 'Blackpool Tower in UK', 'Fernsehturm Berlin Tower'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q012', stem: 'Statue of Liberty', correct: 'Statue of Liberty in New York', distractors: ['Christ the Redeemer in Brazil', 'Motherland Calls in Russia', 'Spring Temple Buddha in China'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q013', stem: 'Big Ben Clock Tower', correct: 'Big Ben in London', distractors: ['Peace Tower in Canada', 'Spasskaya Tower in Moscow', 'Town Hall Clock in Philadelphia'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q014', stem: 'Sydney Opera House', correct: 'Sydney Opera House in Australia', distractors: ['Harpa Concert Hall in Iceland', 'Guangzhou Opera House in China', 'Oslo Opera House in Norway'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q015', stem: 'Great Wall of China', correct: 'Great Wall of China with watchtowers', distractors: ['Hadrians Wall in UK', 'Berlin Wall remnants', 'Western Wall in Jerusalem'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q016', stem: 'Taj Mahal', correct: 'Taj Mahal white marble building', distractors: ['Lotus Temple in India', 'Blue Mosque in Turkey', 'Grand Palace in Thailand'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q017', stem: 'Pyramids of Giza', correct: 'Egyptian pyramids with sphinx', distractors: ['Mayan pyramids in Mexico', 'Nubian pyramids in Sudan', 'Pyramid of Cestius in Rome'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q018', stem: 'Colosseum in Rome', correct: 'Roman Colosseum amphitheater', distractors: ['Arena of Nimes in France', 'Pula Arena in Croatia', 'El Jem Amphitheatre in Tunisia'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q019', stem: 'Golden Gate Bridge', correct: 'Golden Gate Bridge in San Francisco', distractors: ['Brooklyn Bridge in New York', 'Tower Bridge in London', 'Sydney Harbour Bridge'], difficulty: 'EASY', category: 'LANDMARKS' },
  { id: 'q020', stem: 'Leaning Tower of Pisa', correct: 'Leaning Tower of Pisa in Italy', distractors: ['Two Towers of Bologna', 'Asinelli Tower in Bologna', 'Capital Gate in Abu Dhabi'], difficulty: 'EASY', category: 'LANDMARKS' },

  // ANIMALS - Easy (10)
  { id: 'q021', stem: 'Lion', correct: 'Male lion with mane', distractors: ['Tiger with stripes', 'Cheetah with spots', 'Leopard with rosettes'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q022', stem: 'Elephant', correct: 'African elephant with big ears', distractors: ['Asian elephant with smaller ears', 'Mammoth extinct species', 'Rhinoceros with horn'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q023', stem: 'Penguin', correct: 'Emperor penguin standing', distractors: ['Puffin bird', 'Auklet seabird', 'Cormorant water bird'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q024', stem: 'Giraffe', correct: 'Giraffe with long neck and spots', distractors: ['Okapi with zebra stripes', 'Deer with antlers', 'Llama with long neck'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q025', stem: 'Panda Bear', correct: 'Giant panda black and white', distractors: ['Red panda small mammal', 'Koala bear gray', 'Sun bear smallest bear'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q026', stem: 'Dolphin', correct: 'Bottlenose dolphin jumping', distractors: ['Porpoise small cetacean', 'Shark with fin', 'Beluga whale white'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q027', stem: 'Zebra', correct: 'Zebra with black and white stripes', distractors: ['Horse without stripes', 'Okapi with partial stripes', 'Donkey gray color'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q028', stem: 'Kangaroo', correct: 'Red kangaroo hopping', distractors: ['Wallaby smaller marsupial', 'Rabbit with long ears', 'Jerboa desert rodent'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q029', stem: 'Peacock', correct: 'Peacock with colorful tail feathers', distractors: ['Pheasant game bird', 'Turkey with fan tail', 'Quetzal tropical bird'], difficulty: 'EASY', category: 'ANIMALS' },
  { id: 'q030', stem: 'Polar Bear', correct: 'Polar bear white fur on ice', distractors: ['Arctic fox white', 'Grizzly bear brown', 'Seal on ice'], difficulty: 'EASY', category: 'ANIMALS' },

  // FOOD - Easy (10)
  { id: 'q031', stem: 'Pizza', correct: 'Italian pizza with cheese and toppings', distractors: ['Flatbread with toppings', 'Focaccia bread', 'Calzone folded pizza'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q032', stem: 'Hamburger', correct: 'Classic hamburger with bun and patty', distractors: ['Hot dog in bun', 'Sandwich with bread', 'Sloppy joe ground meat'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q033', stem: 'Sushi Roll', correct: 'Japanese sushi maki roll', distractors: ['Spring roll Vietnamese', 'Burrito Mexican wrap', 'Kimbap Korean roll'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q034', stem: 'Chocolate Cake', correct: 'Layered chocolate cake with frosting', distractors: ['Brownie chocolate square', 'Chocolate mousse dessert', 'Tiramisu Italian dessert'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q035', stem: 'Ice Cream Cone', correct: 'Ice cream in waffle cone', distractors: ['Gelato in cup', 'Frozen yogurt swirl', 'Sorbet in bowl'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q036', stem: 'French Fries', correct: 'Golden french fries', distractors: ['Potato wedges thick', 'Hash browns shredded', 'Tater tots round'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q037', stem: 'Croissant', correct: 'French croissant pastry', distractors: ['Danish pastry', 'Puff pastry layers', 'Brioche bread'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q038', stem: 'Donut', correct: 'Glazed donut with hole', distractors: ['Bagel with hole', 'Churro Spanish pastry', 'Beignet French donut'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q039', stem: 'Taco', correct: 'Mexican taco with shell', distractors: ['Burrito wrapped', 'Quesadilla folded', 'Enchilada rolled'], difficulty: 'EASY', category: 'FOOD' },
  { id: 'q040', stem: 'Banana', correct: 'Yellow banana fruit', distractors: ['Plantain cooking banana', 'Yellow squash vegetable', 'Papaya yellow fruit'], difficulty: 'EASY', category: 'FOOD' },

  // ============ MEDIUM QUESTIONS (70) ============

  // FLAGS - Medium (15)
  { id: 'q041', stem: 'Flag of Switzerland', correct: 'Swiss flag red with white cross', distractors: ['Flag of Denmark red with white cross', 'Flag of Georgia white with red crosses', 'Flag of Tonga red with white cross'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q042', stem: 'Flag of Sweden', correct: 'Swedish flag blue with yellow cross', distractors: ['Flag of Finland blue with white cross', 'Flag of Iceland blue with red cross', 'Flag of Norway blue with red white cross'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q043', stem: 'Flag of Turkey', correct: 'Turkish flag red with white crescent and star', distractors: ['Flag of Tunisia red with white circle', 'Flag of Algeria green with crescent', 'Flag of Pakistan green with crescent'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q044', stem: 'Flag of Greece', correct: 'Greek flag blue and white stripes with cross', distractors: ['Flag of Uruguay blue and white stripes', 'Flag of Israel blue and white with star', 'Flag of Argentina blue and white with sun'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q045', stem: 'Flag of Poland', correct: 'Polish flag white and red horizontal', distractors: ['Flag of Indonesia red and white', 'Flag of Monaco red and white', 'Flag of Singapore red and white'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q046', stem: 'Flag of South Africa', correct: 'South African flag with Y shape', distractors: ['Flag of Zimbabwe with bird', 'Flag of Kenya with shield', 'Flag of Uganda with crane'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q047', stem: 'Flag of India', correct: 'Indian flag orange white green with wheel', distractors: ['Flag of Niger orange white green', 'Flag of Ireland green white orange', 'Flag of Ivory Coast orange white green'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q048', stem: 'Flag of Thailand', correct: 'Thai flag red white blue horizontal stripes', distractors: ['Flag of Costa Rica blue white red', 'Flag of Paraguay red white blue', 'Flag of Netherlands red white blue'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q049', stem: 'Flag of Argentina', correct: 'Argentine flag blue white blue with sun', distractors: ['Flag of Uruguay blue white with sun', 'Flag of El Salvador blue white blue', 'Flag of Honduras blue white blue'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q050', stem: 'Flag of Saudi Arabia', correct: 'Saudi flag green with Arabic text and sword', distractors: ['Flag of Pakistan green with crescent', 'Flag of Libya green flag', 'Flag of Turkmenistan green with patterns'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q051', stem: 'Flag of Austria', correct: 'Austrian flag red white red horizontal', distractors: ['Flag of Latvia red white red', 'Flag of Lebanon red white red with tree', 'Flag of Peru red white red'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q052', stem: 'Flag of Belgium', correct: 'Belgian flag black yellow red vertical', distractors: ['Flag of Germany black red yellow horizontal', 'Flag of Romania blue yellow red', 'Flag of Chad blue yellow red'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q053', stem: 'Flag of Egypt', correct: 'Egyptian flag red white black with eagle', distractors: ['Flag of Syria red white black with stars', 'Flag of Iraq red white black', 'Flag of Yemen red white black'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q054', stem: 'Flag of Nigeria', correct: 'Nigerian flag green white green vertical', distractors: ['Flag of Pakistan green with white and star', 'Flag of Algeria green white', 'Flag of Zambia green with eagle'], difficulty: 'MEDIUM', category: 'FLAGS' },
  { id: 'q055', stem: 'Flag of Philippines', correct: 'Philippine flag blue red white with sun and stars', distractors: ['Flag of Czech Republic blue red white', 'Flag of Cuba blue red white with star', 'Flag of Puerto Rico blue red white with star'], difficulty: 'MEDIUM', category: 'FLAGS' },

  // LANDMARKS - Medium (15)
  { id: 'q056', stem: 'Burj Khalifa Tower', correct: 'Burj Khalifa tallest building Dubai', distractors: ['Shanghai Tower China', 'Taipei 101 Taiwan', 'One World Trade Center NYC'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q057', stem: 'Machu Picchu', correct: 'Machu Picchu ruins Peru mountains', distractors: ['Chichen Itza pyramid Mexico', 'Angkor Wat temple Cambodia', 'Petra ancient city Jordan'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q058', stem: 'Mount Rushmore', correct: 'Mount Rushmore four presidents faces', distractors: ['Stone Mountain Georgia carving', 'Crazy Horse Memorial South Dakota', 'Devils Tower Wyoming'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q059', stem: 'Parthenon Athens', correct: 'Parthenon temple on Acropolis', distractors: ['Temple of Poseidon Greece', 'Pantheon Rome', 'Temple of Olympian Zeus Athens'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q060', stem: 'Christ the Redeemer', correct: 'Christ the Redeemer statue Rio', distractors: ['Statue of Liberty New York', 'Christ of Vung Tau Vietnam', 'Christ the King Portugal'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q061', stem: 'Sagrada Familia', correct: 'Sagrada Familia basilica Barcelona', distractors: ['Milan Cathedral Italy', 'Cologne Cathedral Germany', 'Notre Dame Paris'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q062', stem: 'Neuschwanstein Castle', correct: 'Neuschwanstein Castle Germany', distractors: ['Edinburgh Castle Scotland', 'Prague Castle Czech', 'Windsor Castle England'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q063', stem: 'Brandenburg Gate', correct: 'Brandenburg Gate Berlin Germany', distractors: ['Arc de Triomphe Paris', 'Gateway Arch St Louis', 'India Gate Delhi'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q064', stem: 'Forbidden City', correct: 'Forbidden City Beijing palace', distractors: ['Summer Palace Beijing', 'Temple of Heaven Beijing', 'Imperial Palace Tokyo'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q065', stem: 'Tower Bridge London', correct: 'Tower Bridge drawbridge London', distractors: ['London Bridge plain', 'Westminster Bridge London', 'Brooklyn Bridge New York'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q066', stem: 'Saint Basils Cathedral', correct: 'Saint Basils Cathedral colorful domes Moscow', distractors: ['Church of Savior on Blood St Petersburg', 'Trinity Cathedral Sergiev Posad', 'Assumption Cathedral Moscow'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q067', stem: 'Arc de Triomphe', correct: 'Arc de Triomphe Paris arch', distractors: ['Arch of Constantine Rome', 'Gateway of India Mumbai', 'Marble Arch London'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q068', stem: 'CN Tower Toronto', correct: 'CN Tower tallest tower Toronto', distractors: ['Space Needle Seattle', 'Oriental Pearl Tower Shanghai', 'Sky Tower Auckland'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q069', stem: 'Palace of Versailles', correct: 'Palace of Versailles grand French palace', distractors: ['Schönbrunn Palace Vienna', 'Buckingham Palace London', 'Peterhof Palace Russia'], difficulty: 'MEDIUM', category: 'LANDMARKS' },
  { id: 'q070', stem: 'Angkor Wat Temple', correct: 'Angkor Wat largest temple Cambodia', distractors: ['Borobudur Temple Indonesia', 'Prambanan Temple Indonesia', 'Shwedagon Pagoda Myanmar'], difficulty: 'MEDIUM', category: 'LANDMARKS' },

  // ANIMALS - Medium (20)
  { id: 'q071', stem: 'Snow Leopard', correct: 'Snow leopard with thick spotted fur', distractors: ['Clouded leopard with cloud patterns', 'Jaguar with rosettes', 'Lynx with tufted ears'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q072', stem: 'Orangutan', correct: 'Orangutan red ape swinging', distractors: ['Chimpanzee black ape', 'Gorilla large ape', 'Gibbon small ape'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q073', stem: 'Bald Eagle', correct: 'Bald eagle white head brown body', distractors: ['Golden eagle all brown', 'Harpy eagle crested', 'Stellers sea eagle large'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q074', stem: 'Koala', correct: 'Koala gray marsupial in tree', distractors: ['Wombat ground dwelling', 'Sloth hanging upside down', 'Tree kangaroo in tree'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q075', stem: 'Flamingo', correct: 'Pink flamingo standing on one leg', distractors: ['Roseate spoonbill pink bird', 'Ibis wading bird', 'Stork large bird'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q076', stem: 'Hippopotamus', correct: 'Hippopotamus large mammal in water', distractors: ['Rhinoceros with horn', 'Manatee aquatic mammal', 'Tapir with trunk'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q077', stem: 'Arctic Fox', correct: 'Arctic fox white winter coat', distractors: ['Red fox orange coat', 'Fennec fox desert fox', 'Gray wolf white'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q078', stem: 'Manta Ray', correct: 'Manta ray large flat fish', distractors: ['Stingray smaller ray', 'Eagle ray spotted', 'Sawfish with saw'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q079', stem: 'Toucan', correct: 'Toucan colorful large beak', distractors: ['Hornbill similar beak', 'Macaw parrot', 'Puffin seabird beak'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q080', stem: 'Red Panda', correct: 'Red panda small reddish mammal', distractors: ['Raccoon masked face', 'Ring-tailed lemur striped tail', 'Coati long snout'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q081', stem: 'Orca Whale', correct: 'Orca black and white killer whale', distractors: ['Beluga whale all white', 'Pilot whale black', 'Humpback whale large'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q082', stem: 'Chameleon', correct: 'Chameleon lizard color changing', distractors: ['Iguana green lizard', 'Gecko small lizard', 'Bearded dragon desert lizard'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q083', stem: 'Emperor Penguin', correct: 'Emperor penguin largest penguin', distractors: ['King penguin orange patches', 'Gentoo penguin white stripe', 'Adelie penguin white ring'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q084', stem: 'Axolotl', correct: 'Axolotl pink salamander with gills', distractors: ['Newt small salamander', 'Mudpuppy aquatic salamander', 'Tree frog amphibian'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q085', stem: 'Sloth', correct: 'Three-toed sloth hanging upside down', distractors: ['Two-toed sloth larger', 'Anteater long snout', 'Armadillo armored'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q086', stem: 'Porcupine', correct: 'Porcupine with sharp quills', distractors: ['Hedgehog smaller spines', 'Echidna spiny anteater', 'Pangolin with scales'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q087', stem: 'Platypus', correct: 'Platypus duck-billed mammal', distractors: ['Otter aquatic mammal', 'Beaver flat tail', 'Water vole small rodent'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q088', stem: 'Secretary Bird', correct: 'Secretary bird tall legs hunting snake', distractors: ['Crane tall wading bird', 'Stork large bird', 'Heron long neck'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q089', stem: 'Capybara', correct: 'Capybara largest rodent', distractors: ['Beaver dam building', 'Nutria smaller rodent', 'Muskrat aquatic rodent'], difficulty: 'MEDIUM', category: 'ANIMALS' },
  { id: 'q090', stem: 'Quokka', correct: 'Quokka small smiling marsupial', distractors: ['Wallaby small kangaroo', 'Potoroo rat-kangaroo', 'Bilby rabbit-eared bandicoot'], difficulty: 'MEDIUM', category: 'ANIMALS' },

  // LOGOS - Medium (10)
  { id: 'q091', stem: 'Apple Company Logo', correct: 'Apple logo bitten apple', distractors: ['Pear logo similar fruit', 'Cherry logo with stem', 'Plum logo round fruit'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q092', stem: 'Nike Swoosh', correct: 'Nike swoosh checkmark logo', distractors: ['Adidas three stripes', 'Puma leaping cat', 'Reebok vector'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q093', stem: 'McDonalds Golden Arches', correct: 'McDonalds M golden arches', distractors: ['Burger King bun logo', 'Wendys girl logo', 'Arby s hat logo'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q094', stem: 'Starbucks Siren', correct: 'Starbucks green siren mermaid', distractors: ['Costa Coffee bean logo', 'Tim Hortons maple leaf', 'Dunkin Donuts DD logo'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q095', stem: 'Mercedes-Benz Star', correct: 'Mercedes-Benz three-pointed star', distractors: ['BMW blue white roundel', 'Audi four rings', 'Volkswagen VW circle'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q096', stem: 'Twitter Bird (X)', correct: 'Twitter blue bird logo', distractors: ['Facebook F logo', 'Instagram camera logo', 'LinkedIn in logo'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q097', stem: 'Amazon Smile Arrow', correct: 'Amazon smile arrow A to Z', distractors: ['eBay colorful letters', 'Alibaba stylized letters', 'Walmart spark logo'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q098', stem: 'Coca-Cola Script', correct: 'Coca-Cola red cursive script', distractors: ['Pepsi red blue circle', 'Dr Pepper oval logo', 'RC Cola script'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q099', stem: 'Google G', correct: 'Google multicolor G letter', distractors: ['Microsoft colorful squares', 'Yahoo purple Y', 'Bing blue B'], difficulty: 'MEDIUM', category: 'LOGOS' },
  { id: 'q100', stem: 'Target Bullseye', correct: 'Target red bullseye circles', distractors: ['Walmart blue spark', 'Costco red blue logo', 'Home Depot orange letters'], difficulty: 'MEDIUM', category: 'LOGOS' },

  // FOOD - Medium (10)
  { id: 'q101', stem: 'Ramen Bowl', correct: 'Japanese ramen noodle soup', distractors: ['Pho Vietnamese soup', 'Udon thick noodle soup', 'Laksa spicy noodle soup'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q102', stem: 'Paella Dish', correct: 'Spanish paella with seafood', distractors: ['Risotto Italian rice', 'Jambalaya Cajun rice', 'Biryani Indian rice'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q103', stem: 'Dim Sum Dumplings', correct: 'Chinese dim sum steamer baskets', distractors: ['Gyoza Japanese dumplings', 'Mandu Korean dumplings', 'Pierogi Polish dumplings'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q104', stem: 'Baklava Pastry', correct: 'Baklava layered honey pastry', distractors: ['Kanafeh cheese pastry', 'Galaktoboureko Greek custard', 'Napoleone Italian pastry'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q105', stem: 'Poutine', correct: 'Canadian poutine fries gravy cheese', distractors: ['Loaded fries with toppings', 'Disco fries New Jersey', 'Cheese fries melted cheese'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q106', stem: 'Pad Thai Noodles', correct: 'Thai pad thai stir fried noodles', distractors: ['Lo mein Chinese noodles', 'Chow mein fried noodles', 'Yakisoba Japanese noodles'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q107', stem: 'Falafel Balls', correct: 'Middle Eastern falafel chickpea balls', distractors: ['Hush puppies cornmeal balls', 'Arancini rice balls', 'Takoyaki octopus balls'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q108', stem: 'Goulash Stew', correct: 'Hungarian goulash beef stew', distractors: ['Beef bourguignon French stew', 'Irish stew lamb', 'Borscht beet soup'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q109', stem: 'Beignet French Donut', correct: 'French beignet powdered sugar', distractors: ['Churro Spanish fried dough', 'Funnel cake fried batter', 'Zeppole Italian donut'], difficulty: 'MEDIUM', category: 'FOOD' },
  { id: 'q110', stem: 'Mochi Rice Cake', correct: 'Japanese mochi chewy rice cake', distractors: ['Daifuku filled mochi', 'Tteok Korean rice cake', 'Nian gao Chinese rice cake'], difficulty: 'MEDIUM', category: 'FOOD' },

  // ============ HARD QUESTIONS (40) ============

  // FLAGS - Hard (10)
  { id: 'q111', stem: 'Flag of Nepal', correct: 'Nepalese flag double pennant red blue', distractors: ['Flag of Ohio pennant shape', 'Flag of Tampa triangular', 'Flag of Vatican square'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q112', stem: 'Flag of Bhutan', correct: 'Bhutanese flag orange yellow with dragon', distractors: ['Flag of Wales with dragon', 'Flag of Malta with cross', 'Flag of Sikkim with symbols'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q113', stem: 'Flag of Kazakhstan', correct: 'Kazakhstan flag light blue with sun and eagle', distractors: ['Flag of Uzbekistan blue with crescents', 'Flag of Turkmenistan green with patterns', 'Flag of Kyrgyzstan red with sun'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q114', stem: 'Flag of Mozambique', correct: 'Mozambican flag with AK-47 rifle', distractors: ['Flag of Zimbabwe with bird', 'Flag of Angola with machete', 'Flag of Zambia with eagle'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q115', stem: 'Flag of Seychelles', correct: 'Seychelles flag five diagonal stripes', distractors: ['Flag of Mauritius four horizontal stripes', 'Flag of South Sudan with star', 'Flag of Tanzania diagonal split'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q116', stem: 'Flag of Sri Lanka', correct: 'Sri Lankan flag with lion holding sword', distractors: ['Flag of Bhutan with dragon', 'Flag of Wales with dragon', 'Flag of Montenegro with eagle'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q117', stem: 'Flag of Papua New Guinea', correct: 'Papua New Guinea flag bird of paradise', distractors: ['Flag of Solomon Islands with stars', 'Flag of Vanuatu with boars tusk', 'Flag of Fiji with shield'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q118', stem: 'Flag of Belize', correct: 'Belize flag with coat of arms circle', distractors: ['Flag of Guatemala with emblem', 'Flag of El Salvador with text', 'Flag of Honduras with stars'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q119', stem: 'Flag of Turkmenistan', correct: 'Turkmenistan flag green with carpet patterns', distractors: ['Flag of Saudi Arabia with sword', 'Flag of Uzbekistan with crescents', 'Flag of Pakistan with crescent'], difficulty: 'HARD', category: 'FLAGS' },
  { id: 'q120', stem: 'Flag of Dominica', correct: 'Dominica flag with sisserou parrot', distractors: ['Flag of Grenada with nutmeg', 'Flag of Saint Lucia with triangles', 'Flag of Barbados with trident'], difficulty: 'HARD', category: 'FLAGS' },

  // LANDMARKS - Hard (10)
  { id: 'q121', stem: 'Petra Treasury Jordan', correct: 'Petra Treasury carved in pink rock', distractors: ['Abu Simbel Egypt carved temples', 'Ellora Caves India rock cut', 'Lalibela Ethiopia rock churches'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q122', stem: 'Borobudur Temple', correct: 'Borobudur Buddhist temple Indonesia', distractors: ['Angkor Wat Cambodia', 'Prambanan Hindu temple Indonesia', 'Bagan temples Myanmar'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q123', stem: 'Alhambra Palace', correct: 'Alhambra Moorish palace Granada', distractors: ['Alcazar of Seville palace', 'Mezquita Cordoba mosque', 'Topkapi Palace Istanbul'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q124', stem: 'Mont Saint-Michel', correct: 'Mont Saint-Michel island abbey France', distractors: ['St Michaels Mount Cornwall', 'Lindisfarne Priory England', 'Skellig Michael Ireland'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q125', stem: 'Chichen Itza El Castillo', correct: 'Chichen Itza Mayan pyramid Mexico', distractors: ['Tikal pyramid Guatemala', 'Uxmal pyramid Mexico', 'Copan ruins Honduras'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q126', stem: 'Hagia Sophia', correct: 'Hagia Sophia Byzantine dome Istanbul', distractors: ['Blue Mosque Istanbul minarets', 'Suleymaniye Mosque Istanbul', 'Basilica Cistern Istanbul'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q127', stem: 'Potala Palace', correct: 'Potala Palace Tibetan palace Lhasa', distractors: ['Jokhang Temple Lhasa', 'Sera Monastery Tibet', 'Tashilhunpo Monastery Tibet'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q128', stem: 'Bran Castle Dracula', correct: 'Bran Castle Romania Dracula castle', distractors: ['Peles Castle Romania', 'Corvin Castle Romania', 'Hohenzollern Castle Germany'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q129', stem: 'Moai Statues Easter Island', correct: 'Moai stone heads Easter Island', distractors: ['Olmec heads Mexico', 'Stone spheres Costa Rica', 'Stonehenge England'], difficulty: 'HARD', category: 'LANDMARKS' },
  { id: 'q130', stem: 'Meteora Monasteries', correct: 'Meteora monasteries on rock pillars Greece', distractors: ['Sumela Monastery Turkey cliff', 'Taktsang Monastery Bhutan cliff', 'Montserrat monastery Spain'], difficulty: 'HARD', category: 'LANDMARKS' },

  // ANIMALS - Hard (10)
  { id: 'q131', stem: 'Okapi', correct: 'Okapi striped legs giraffe relative', distractors: ['Bongo antelope with stripes', 'Nyala antelope spiral horns', 'Sitatunga swamp antelope'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q132', stem: 'Pangolin', correct: 'Pangolin scaly anteater', distractors: ['Armadillo armored mammal', 'Echidna spiny anteater', 'Hedgehog with spines'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q133', stem: 'Cassowary', correct: 'Cassowary large flightless bird casque', distractors: ['Emu large bird Australia', 'Ostrich largest bird', 'Rhea South American bird'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q134', stem: 'Narwhal', correct: 'Narwhal whale with long tusk', distractors: ['Beluga whale white', 'Swordfish with bill', 'Sawfish with saw'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q135', stem: 'Gharial Crocodile', correct: 'Gharial thin long snout crocodile', distractors: ['Alligator broad snout', 'Crocodile moderate snout', 'Caiman smaller crocodilian'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q136', stem: 'Fossa', correct: 'Fossa Madagascar cat-like predator', distractors: ['Civet cat-like', 'Genet spotted predator', 'Mongoose small carnivore'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q137', stem: 'Shoebill Stork', correct: 'Shoebill large beak whale-headed bird', distractors: ['Marabou stork large', 'Hammerkop bird hammer head', 'Jabiru stork Americas'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q138', stem: 'Blobfish', correct: 'Blobfish gelatinous deep sea fish', distractors: ['Anglerfish with lure', 'Hagfish eel-like', 'Lamprey parasitic fish'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q139', stem: 'Aye-aye', correct: 'Aye-aye lemur long fingers Madagascar', distractors: ['Tarsier big eyes', 'Slow loris large eyes', 'Bush baby nocturnal primate'], difficulty: 'HARD', category: 'ANIMALS' },
  { id: 'q140', stem: 'Kakapo Parrot', correct: 'Kakapo flightless green parrot', distractors: ['Kea alpine parrot', 'Kākāriki small parrot', 'Takahe flightless rail'], difficulty: 'HARD', category: 'ANIMALS' },

  // SYMBOLS - Hard (10)
  { id: 'q141', stem: 'Yin Yang Symbol', correct: 'Yin Yang black white circle symbol', distractors: ['Taijitu similar symbol', 'Tomoe triple swirl', 'Bagua eight trigrams'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q142', stem: 'Om Symbol', correct: 'Om Sanskrit sacred sound symbol', distractors: ['Aum variant spelling', 'Swastika ancient symbol', 'Trishula trident symbol'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q143', stem: 'Ankh Egyptian', correct: 'Ankh Egyptian cross with loop', distractors: ['Was scepter staff', 'Djed pillar stability', 'Eye of Horus symbol'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q144', stem: 'Star of David', correct: 'Star of David six-pointed star', distractors: ['Pentagram five-pointed star', 'Seal of Solomon two triangles', 'Rub el Hizb Islamic star'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q145', stem: 'Hamsa Hand', correct: 'Hamsa hand palm-shaped amulet', distractors: ['Hand of Fatima similar', 'Evil eye circular amulet', 'Nazar boncugu Turkish eye'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q146', stem: 'Celtic Knot', correct: 'Celtic knot interlaced pattern', distractors: ['Norse knot Viking pattern', 'Chinese knot decorative', 'Gordian knot legend'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q147', stem: 'Infinity Symbol', correct: 'Infinity lemniscate horizontal eight', distractors: ['Ouroboros snake circle', 'Mobius strip twisted loop', 'Figure eight number'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q148', stem: 'Caduceus Medical', correct: 'Caduceus two snakes winged staff', distractors: ['Rod of Asclepius one snake', 'Staff of Hermes messenger staff', 'Medical cross red cross'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q149', stem: 'Triquetra Symbol', correct: 'Triquetra three interlaced arcs', distractors: ['Triskelion three spirals', 'Valknut three triangles', 'Trinity knot similar'], difficulty: 'HARD', category: 'SYMBOLS' },
  { id: 'q150', stem: 'Ouroboros Dragon', correct: 'Ouroboros snake eating own tail', distractors: ['Dragon circle circular dragon', 'Jormungandr Norse serpent', 'Quetzalcoatl feathered serpent'], difficulty: 'HARD', category: 'SYMBOLS' },
];

async function generateImageWithAI(description: string): Promise<string> {
  // TODO: Implement actual AI image generation using Gemini
  // For now, return placeholder
  console.log(`Generating image for: ${description}`);

  // In production, call Gemini image generation API
  // const apiKey = await getGeminiApiKey();
  // const ai = new GoogleGenAI({ apiKey });
  // const image = await ai.generateImage({ prompt: description, size: '512x512' });
  // return image.url;

  // Placeholder URL for development
  return `https://via.placeholder.com/512?text=${encodeURIComponent(description.substring(0, 30))}`;
}

async function generateAllQuestions() {
  console.log('🎨 Generating 150 questions with AI images...\n');

  const batch = writeBatch(db);
  let count = 0;

  for (const template of QUESTION_TEMPLATES) {
    console.log(`[${count + 1}/150] Generating: ${template.stem}`);

    // Generate images for correct answer and distractors
    const correctImage = await generateImageWithAI(template.correct);
    const distractorImages = await Promise.all(
      template.distractors.map(d => generateImageWithAI(d))
    );

    // Shuffle choices
    const allChoices = [correctImage, ...distractorImages];
    const shuffled = allChoices
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);

    const correctIndex = shuffled.indexOf(correctImage);

    // Create question document
    const questionDoc = {
      id: template.id,
      stem: template.stem,
      choices: shuffled,
      correctIndex,
      difficulty: template.difficulty,
      category: template.category,
      createdAt: new Date().toISOString(),
      metadata: {
        correctDescription: template.correct,
        distractorDescriptions: template.distractors
      }
    };

    const docRef = doc(db, 'duel_questions', template.id);
    batch.set(docRef, questionDoc);

    count++;

    // Commit in batches of 50
    if (count % 50 === 0) {
      await batch.commit();
      console.log(`✅ Committed batch of 50 questions\n`);
    }
  }

  // Commit remaining
  await batch.commit();
  console.log(`\n✅ All 150 questions generated and stored in Firestore!`);
}

async function main() {
  try {
    await generateAllQuestions();
    console.log('\n🎉 Question generation complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
