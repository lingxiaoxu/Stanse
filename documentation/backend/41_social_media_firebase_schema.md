# Social Media Connections - Firebase Collection Schema

## Overview

This document describes the Firebase Firestore collection schema designed for storing social media account connections for Stanse users. The schema is optimized for future Twitter/X API integration and other social media platforms.

## Collection Structure

### Collection Name: `socialConnections`

This is a **top-level collection** (not a subcollection) for better queryability and scalability.

### Document Schema

```typescript
{
  id: string;                    // Firestore document ID (auto-generated)
  userId: string;                // Reference to the user (indexed)
  platform: SocialPlatform;      // TWITTER | FACEBOOK | INSTAGRAM | LINKEDIN | TIKTOK
  handle: string;                // Username/handle (without @ prefix)
  displayName?: string;          // Display name from the platform
  profileUrl?: string;           // URL to the profile
  verified?: boolean;            // Whether the account is verified on the platform
  followerCount?: number;        // Number of followers (for future API integration)

  // OAuth & API Integration fields (for future use)
  accessToken?: string;          // OAuth access token (should be encrypted in production)
  refreshToken?: string;         // OAuth refresh token (should be encrypted in production)
  tokenExpiresAt?: string;       // ISO date string for token expiration
  apiUserId?: string;            // Platform-specific user ID

  // Metadata
  connectedAt: string;           // ISO date string when connection was established
  lastSyncedAt?: string;         // ISO date string of last API sync
  isActive: boolean;             // Whether the connection is currently active
  updatedAt: string;             // ISO date string of last update
}
```

## Indexes Required

For optimal query performance, create the following composite indexes in Firebase Console:

1. **Query active connections by user:**
   - Collection: `socialConnections`
   - Fields indexed: `userId` (Ascending), `isActive` (Ascending)

2. **Query specific platform connection by user:**
   - Collection: `socialConnections`
   - Fields indexed: `userId` (Ascending), `platform` (Ascending), `isActive` (Ascending)

3. **Query by connection date:**
   - Collection: `socialConnections`
   - Fields indexed: `userId` (Ascending), `connectedAt` (Descending)

## Design Principles

### 1. **Top-Level Collection vs Subcollection**

We chose a **top-level collection** instead of a subcollection under `users/{userId}/socialConnections` for the following reasons:

- **Better Queryability**: Allows querying across all users if needed (e.g., analytics, admin dashboard)
- **Simpler API Integration**: Easier to implement batch operations and cross-user features
- **Scalability**: Better performance for large-scale operations
- **Flexibility**: Can add relationships to other collections without complex query constraints

### 2. **Platform Support**

The schema supports multiple platforms through the `SocialPlatform` enum:
- `TWITTER` - Twitter/X
- `FACEBOOK` - Facebook
- `INSTAGRAM` - Instagram
- `LINKEDIN` - LinkedIn
- `TIKTOK` - TikTok

New platforms can be easily added by extending the enum.

### 3. **Soft Delete Pattern**

Connections use the `isActive` boolean field for soft deletes:
- **Benefits**: Maintains historical data, allows for "undo" functionality, audit trails
- **Active Connection**: `isActive: true`
- **Disconnected**: `isActive: false`

### 4. **OAuth Token Storage**

The schema includes fields for OAuth tokens:
- `accessToken` - Short-lived access token for API calls
- `refreshToken` - Long-lived refresh token for obtaining new access tokens
- `tokenExpiresAt` - Expiration timestamp for access token

**Security Note**: In production, these tokens MUST be encrypted before storage. Consider using:
- Firebase Security Rules to restrict access
- Cloud Functions with encryption libraries
- Google Cloud KMS for key management

### 5. **Future Twitter/X API Integration**

The schema is designed to support Twitter/X API v2 features:

#### Profile Data Sync
- `displayName` - User's display name from Twitter
- `verified` - Blue checkmark status
- `followerCount` - Number of followers
- `apiUserId` - Twitter user ID

#### API Authentication
- `accessToken` - OAuth 2.0 Bearer token for API requests
- `refreshToken` - For token refresh without re-authentication
- `tokenExpiresAt` - Track token validity

#### Data Sync Tracking
- `lastSyncedAt` - Timestamp of last API sync
- Enables periodic background sync jobs
- Prevents rate limit issues

### 6. **TypeScript Type Safety**

All types are defined in [`types.ts`](../types.ts):
- `SocialPlatform` enum for platform values
- `SocialMediaConnection` interface matching the schema
- Ensures type safety across the application

## Service Functions

All database operations are centralized in [`services/userService.ts`](../services/userService.ts):

### Core Functions

1. **`connectSocialMedia(userId, platform, handle, additionalData?)`**
   - Creates or updates a social media connection
   - Automatically handles existing connections (upsert pattern)
   - Returns the connection document ID

2. **`getSocialMediaConnection(userId, platform)`**
   - Retrieves a specific platform connection for a user
   - Only returns active connections
   - Returns null if not found

3. **`getAllSocialMediaConnections(userId)`**
   - Gets all active connections for a user
   - Sorted by connection date (most recent first)
   - Returns empty array if none found

4. **`disconnectSocialMedia(userId, platform)`**
   - Soft delete - marks connection as inactive
   - Preserves historical data
   - No error if connection doesn't exist

5. **`deleteSocialMediaConnection(userId, platform)`**
   - Permanently deletes a connection
   - Use with caution - data cannot be recovered
   - For compliance (GDPR, CCPA) requirements

6. **`disconnectAllSocialMedia(userId)`**
   - Disconnects all social media accounts for a user
   - Used during settings reset
   - Batch operation for efficiency

7. **`updateSocialMediaConnection(connectionId, updates)`**
   - Updates connection metadata
   - Used after API sync operations
   - Automatically updates `updatedAt` timestamp

8. **`syncSocialMediaData(userId, platform)`**
   - Placeholder for future API sync functionality
   - Will implement Twitter/X API calls
   - Updates profile data and sync timestamp

## Usage Examples

### Connect Twitter Account

```typescript
import { connectSocialMedia } from '../services/userService';
import { SocialPlatform } from '../types';

const userId = 'user123';
const handle = 'elonmusk';

await connectSocialMedia(userId, SocialPlatform.TWITTER, handle, {
  profileUrl: `https://twitter.com/${handle}`,
  displayName: 'Elon Musk',
  verified: true,
  followerCount: 150000000
});
```

### Get User's Twitter Connection

```typescript
import { getSocialMediaConnection } from '../services/userService';
import { SocialPlatform } from '../types';

const connection = await getSocialMediaConnection('user123', SocialPlatform.TWITTER);

if (connection) {
  console.log(`Connected to @${connection.handle}`);
  console.log(`Connected since: ${connection.connectedAt}`);
}
```

### Disconnect All Social Media

```typescript
import { disconnectAllSocialMedia } from '../services/userService';

// Used during settings reset
await disconnectAllSocialMedia('user123');
```

### Future: Sync Profile Data from Twitter API

```typescript
// Placeholder - to be implemented with Twitter API
import { syncSocialMediaData } from '../services/userService';
import { SocialPlatform } from '../types';

await syncSocialMediaData('user123', SocialPlatform.TWITTER);
// This will fetch latest profile data, follower count, etc.
```

## Integration Points

### 1. MenuOverlay Component
- Displays Twitter connection UI
- Loads existing connection on mount
- Saves new connections to Firebase
- Location: [`components/ui/MenuOverlay.tsx`](../components/ui/MenuOverlay.tsx)

### 2. Settings Reset
- Clears all social media connections
- Part of "Reset All Stanse Settings" feature
- Location: [`components/views/SettingsView.tsx`](../components/views/SettingsView.tsx)

### 3. Authentication Context
- Could be extended to manage social media state
- Currently handled locally in components
- Location: [`contexts/AuthContext.tsx`](../contexts/AuthContext.tsx)

## Future Enhancements

### 1. Twitter/X API Integration

#### OAuth 2.0 Flow
1. Redirect user to Twitter OAuth page
2. Receive authorization code
3. Exchange code for access token + refresh token
4. Store encrypted tokens in Firebase
5. Use tokens for API calls

#### API Features to Implement
- **Profile Sync**: Fetch user's profile data, followers, verification status
- **Tweet Analysis**: Analyze user's tweets for political alignment
- **Social Signal**: Use tweets in brand alignment scoring
- **Timeline Search**: Search for brand mentions in user's timeline
- **Network Analysis**: Analyze who the user follows/is followed by

#### Rate Limiting
- Twitter API v2 has strict rate limits
- Implement token bucket algorithm
- Cache results to minimize API calls
- Use `lastSyncedAt` to throttle sync operations

### 2. Multi-Platform Support

Extend to other platforms following the same pattern:
- Facebook: Profile sync, page likes, political ad exposure
- Instagram: Profile sync, influencer alignment check
- LinkedIn: Company connections, endorsements
- TikTok: Creator alignment, content analysis

### 3. Privacy & Security

#### Token Encryption
```typescript
// Example: Encrypt tokens before storage
import { encrypt, decrypt } from '../utils/encryption';

const encryptedToken = encrypt(accessToken, userEncryptionKey);
await updateSocialMediaConnection(connectionId, {
  accessToken: encryptedToken
});
```

#### User Consent
- Add explicit consent for social media data usage
- GDPR/CCPA compliance
- Data retention policies

### 4. Analytics & Insights

Potential features using social media data:
- **Political Echo Chamber Score**: Analyze who user follows
- **News Source Diversity**: Check followed news accounts
- **Brand Engagement**: Detect brand mentions/interactions
- **Influence Score**: Calculate user's political influence
- **Trend Alignment**: Compare user's activity to political trends

### 5. Background Sync Jobs

Implement Cloud Functions for periodic data sync:
```typescript
// Example Cloud Function (Firebase)
export const syncSocialMediaDaily = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const users = await getAllUsersWithActiveConnections();

    for (const user of users) {
      await syncSocialMediaData(user.id, SocialPlatform.TWITTER);
    }
  });
```

## Security Considerations

### Firebase Security Rules

**Status**: ✅ **IMPLEMENTED** in [`firestore.rules`](../../firestore.rules)

```javascript
// Firestore Security Rules for socialConnections collection
// Located in: /Users/xuling/code/Stanse/firestore.rules (lines 192-214)

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Social Media Connections - users can only access their own connections
    match /socialConnections/{connectionId} {
      // Users can only read their own connections
      allow read: if request.auth != null
                  && resource.data.userId == request.auth.uid;

      // Users can only create connections for themselves
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid
                    && request.resource.data.platform in ['TWITTER', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TIKTOK']
                    && request.resource.data.handle is string
                    && request.resource.data.handle.size() > 0
                    && request.resource.data.isActive == true;

      // Users can only update their own connections
      allow update: if request.auth != null
                    && resource.data.userId == request.auth.uid
                    && request.resource.data.userId == request.auth.uid;

      // Users can only delete their own connections
      allow delete: if request.auth != null
                    && resource.data.userId == request.auth.uid;
    }
  }
}
```

**Security Features Implemented**:
1. ✅ **Authentication Required**: All operations require `request.auth != null`
2. ✅ **User Isolation**: Users can only access their own connections via `userId` check
3. ✅ **Platform Validation**: Only valid platform values are accepted on create
4. ✅ **Handle Validation**: Handle must be a non-empty string on create
5. ✅ **Active Status**: New connections must have `isActive: true`
6. ✅ **Prevent Hijacking**: Update checks both old and new `userId` match auth user

### Best Practices

1. **Never expose tokens to client**: Use Cloud Functions for API calls
2. **Encrypt sensitive data**: Access/refresh tokens, API user IDs
3. **Implement token rotation**: Refresh tokens before expiration
4. **Audit logs**: Track who accesses social media data
5. **Rate limiting**: Prevent abuse of sync operations
6. **Data minimization**: Only store necessary fields

## Testing Strategy

### Unit Tests
- Test all service functions
- Mock Firestore operations
- Validate schema constraints

### Integration Tests
- Test complete OAuth flow
- Verify token refresh logic
- Test rate limiting

### E2E Tests
- Connect/disconnect flow
- Settings reset clears connections
- Profile data sync

## Monitoring & Maintenance

### Metrics to Track
- Number of active connections per platform
- API sync success/failure rates
- Token refresh frequency
- User engagement with social features

### Maintenance Tasks
- Monitor Firestore usage and costs
- Review and update indexes
- Audit token security
- Clean up inactive connections (> 1 year)

## Migration Notes

### From LocalStorage to Firebase

Previous implementation used localStorage:
- `stanse_twitter_handle`
- `stanse_twitter_connected`

Migration strategy:
1. No automatic migration needed (simple feature)
2. Users will need to reconnect their accounts
3. Old localStorage keys are removed on settings reset
4. Clean implementation without legacy data

---

## Summary

This Firebase collection schema provides:
- ✅ **Scalable**: Top-level collection for cross-user queries
- ✅ **Flexible**: Supports multiple social platforms
- ✅ **Secure**: Designed with encryption and privacy in mind
- ✅ **Future-proof**: Ready for Twitter/X API integration
- ✅ **Maintainable**: Clear service layer with type safety
- ✅ **Queryable**: Optimized indexes for common operations

The design balances current simplicity with future extensibility, making it easy to add rich social media features as the application grows.
