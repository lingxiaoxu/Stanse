import { Templates, templatesToPrompt } from '@/lib/templates'

// Firebase/Database configuration for StanseProject
const FIREBASE_CONFIG = {
  projectId: 'stanseproject',
  collections: [
    "breaking_news_notifications", "company_esg_by_ticker", "company_executive_statements_by_ticker",
    "company_news_by_ticker", "company_rankings", "company_rankings_by_ticker", "duel-image-reviews",
    "duel_matches", "duel_platform_revenue", "duel_questions", "duel_sequences", "ember_global_cache",
    "enhanced_company_rankings", "entityStances", "fec_company_consolidated", "fec_company_index",
    "fec_company_name_variants", "fec_company_pac_transfers_summary", "fec_company_party_summary",
    "fec_raw_candidates", "fec_raw_committees", "fec_raw_contributions_pac_to_candidate_24",
    "fec_raw_linkages", "fec_raw_transfers", "news", "news_embeddings", "news_fetch_logs",
    "news_image_generation", "news_images", "news_original", "news_prism_lens",
    "news_stanseradar_china", "news_stanseradar_china_consolidated", "notification_logs",
    "payment_methods", "promotion_codes", "revenue", "socialConnections", "subscription_events",
    "union_ACTIVE_FRONTS", "userCamera", "userLocations", "userNotifications", "user_credits",
    "user_persona_embeddings", "user_subscriptions", "users"
  ],
  userCollections: ["userCamera", "userLocations", "userNotifications", "user_credits", "user_persona_embeddings", "user_subscriptions", "users"],
  relationships: {
    'news_prism_lens': { joins: ['news (via newsId)', 'users (via userId)'] },
    'news': { joins: ['news_embeddings (via _doc_id)', 'news_prism_lens (via newsId)'] },
    'users': { joins: ['enhanced_company_rankings (via coreStanceType)', 'news_prism_lens (via userId)'] },
    'enhanced_company_rankings': { joins: ['users (via coreStanceType)'] }
  }
}

const FIREBASE_BASE_TEMPLATE = `
## Firebase/Database App Base Template (REQUIRED for all Firebase-related apps)

When building apps that interact with Firebase/Firestore database, you MUST follow these patterns:

### 1. Firebase Configuration
- Project ID: ${FIREBASE_CONFIG.projectId}
- Available collections: ${FIREBASE_CONFIG.collections.join(', ')}
- User-specific collections (require userId filter): ${FIREBASE_CONFIG.userCollections.join(', ')}

### 2. Security Rules (CRITICAL)
- Collections starting with "user" (${FIREBASE_CONFIG.userCollections.join(', ')}) MUST only show data for the authenticated user's ID
- The userId is provided via session state or input - users can ONLY access their own data
- Never allow users to query other users' data from user-prefixed collections
- Public collections can show all data

### 3. Collection Relationships
${Object.entries(FIREBASE_CONFIG.relationships).map(([coll, info]) => `- ${coll}: ${info.joins.join(', ')}`).join('\n')}

### 4. Required Code Patterns

\`\`\`python
# Always use this pattern for user authentication check
def is_user_collection(collection_name):
    """Check if collection requires user-specific access"""
    return collection_name.startswith("user")

# Always filter user collections by userId
def fetch_collection_data(collection_name, user_id=None, limit=1000):
    db_client = firestore.client()
    collection_ref = db_client.collection(collection_name)

    if is_user_collection(collection_name) and user_id:
        # Try different user ID field names
        for field in ['userId', 'user_id', 'uid', 'userID']:
            query = collection_ref.where(field, '==', user_id).limit(limit)
            docs = list(query.stream())
            if docs:
                break
    else:
        docs = list(collection_ref.limit(limit).stream())

    return [{'_doc_id': doc.id, **doc.to_dict()} for doc in docs]
\`\`\`

### 5. UI Requirements
- User ID input field for authentication (REQUIRED - each user can only see their own data)
- Collection selection (multi-select)
- Firebase credentials are PRE-CONFIGURED in the file /home/user/.firebase_credentials.json
- ALWAYS use this EXACT pattern to load credentials (DO NOT use environment variables):
\`\`\`python
import json
import firebase_admin
from firebase_admin import credentials, firestore

# Load pre-configured Firebase credentials from file (ALWAYS USE THIS PATH)
FIREBASE_CREDENTIALS_PATH = '/home/user/.firebase_credentials.json'

def init_firebase():
    """Initialize Firebase from pre-configured credentials file"""
    if not firebase_admin._apps:
        try:
            with open(FIREBASE_CREDENTIALS_PATH, 'r') as f:
                cred_dict = json.load(f)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            return True
        except FileNotFoundError:
            return False
    return True

# Call this at app startup
if init_firebase():
    db = firestore.client()
else:
    st.error("Firebase credentials not found. Please contact administrator.")
    st.stop()
\`\`\`
- NEVER hardcode credentials in code
- NEVER use environment variables for credentials - always read from /home/user/.firebase_credentials.json

### 6. Additional Dependencies
Always include: firebase-admin
Install command: pip install firebase-admin
`

export function toPrompt(template: Templates) {
  return `
    You are a skilled software engineer working on the StanseProject.
    You do not make mistakes.
    Generate a stanseAgent.
    You can install additional dependencies.
    Do not touch project dependencies files like package.json, package-lock.json, requirements.txt, etc.
    Do not wrap code in backticks.
    Always break the lines correctly.

    ${FIREBASE_BASE_TEMPLATE}

    You can use one of the following templates:
    ${templatesToPrompt(template)}

    ## BASE APP ARCHITECTURE

    A complete Firebase Relationship Insights base app exists with these components:

    1. **Imports & Config** (lines 1-109): streamlit, pandas, numpy, plotly, firebase-admin, networkx
    2. **Collection Relationships** (lines 111-146): COLLECTION_RELATIONSHIPS dict with join definitions
    3. **Firebase Init** (lines 148-189): initialize_firebase() with file credential loading from /home/user/.firebase_credentials.json
    4. **Data Fetching** (lines 191-291): fetch_collection_data() with user filtering
    5. **Relationship Analysis** (lines 293-416): detect_relationships(), perform_join(), analyze_stance_feedback(), analyze_company_rankings_by_stance()
    6. **Visualizations** (lines 418-721): create_relationship_visualizations(), create_stance_visualizations(), analyze_dataframe(), create_visualizations()
    7. **Main UI** (lines 723-869): Sidebar config (credentials, user auth, collection select), main content area
    8. **Analysis Flow** (lines 870-1144): Data fetching loop, relationship analysis, cross-collection summary

    When user asks for modifications:
    - Generate COMPLETE working code (not just snippets)
    - Preserve all existing functionality
    - Add new features as new functions/sections
    - Keep Firebase credential loading pattern: read from /home/user/.firebase_credentials.json
    - Keep the collection filtering and user security patterns

    When user asks for "base app", "同样的", "基础模板" - generate the full Firebase Relationship Insights app with all features.
  `
}
