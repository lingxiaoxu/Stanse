"use strict";
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
/**
 * Populate initial conflict zones data.
 *
 * This script creates sample conflict zone records based on major global conflicts.
 * These are for demonstration purposes and should be updated with real-time data.
 *
 * Run: npx ts-node src/scripts/populate-conflict-zones.ts
 */
const admin = __importStar(require("firebase-admin"));
const sampleConflictZones = [
    {
        name: 'Ukraine-Russia Border Region',
        description: 'Ongoing military conflict in Eastern Ukraine',
        country: 'Ukraine',
        region: 'Donbas',
        coordinates: {
            latitude: 48.0196,
            longitude: 37.8028
        },
        conflictType: 'MILITARY',
        status: 'ACTIVE',
        severity: 'CRITICAL',
        parties: ['Russia', 'Ukraine'],
        startDate: new Date('2022-02-24'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'Gaza Strip',
        description: 'Israeli-Palestinian conflict zone',
        country: 'Palestine',
        region: 'Gaza',
        coordinates: {
            latitude: 31.5,
            longitude: 34.4667
        },
        conflictType: 'TERRITORIAL',
        status: 'ACTIVE',
        severity: 'CRITICAL',
        parties: ['Israel', 'Hamas'],
        startDate: new Date('2023-10-07'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'Sudan Civil Conflict',
        description: 'Internal military conflict in Sudan',
        country: 'Sudan',
        region: 'Khartoum',
        coordinates: {
            latitude: 15.5007,
            longitude: 32.5599
        },
        conflictType: 'CIVIL',
        status: 'ACTIVE',
        severity: 'HIGH',
        parties: ['Sudanese Armed Forces', 'Rapid Support Forces'],
        startDate: new Date('2023-04-15'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'Myanmar Civil War',
        description: 'Ongoing civil war between military junta and resistance groups',
        country: 'Myanmar',
        region: 'Multiple regions',
        coordinates: {
            latitude: 21.9162,
            longitude: 95.956
        },
        conflictType: 'CIVIL',
        status: 'ACTIVE',
        severity: 'HIGH',
        parties: ['Myanmar Military', 'NUG', 'Ethnic Armed Organizations'],
        startDate: new Date('2021-02-01'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'Nagorno-Karabakh',
        description: 'Territorial dispute between Armenia and Azerbaijan',
        country: 'Azerbaijan',
        region: 'Nagorno-Karabakh',
        coordinates: {
            latitude: 39.8282,
            longitude: 46.7631
        },
        conflictType: 'TERRITORIAL',
        status: 'DE_ESCALATING',
        severity: 'MEDIUM',
        parties: ['Armenia', 'Azerbaijan'],
        startDate: new Date('2020-09-27'),
        isActive: false,
        source: 'Public News Sources'
    },
    {
        name: 'Sahel Region Conflict',
        description: 'Insurgency and terrorism in West African Sahel',
        country: 'Mali',
        region: 'Northern Mali',
        coordinates: {
            latitude: 16.2672,
            longitude: -0.0236
        },
        conflictType: 'MILITARY',
        status: 'ACTIVE',
        severity: 'HIGH',
        parties: ['Mali Government', 'Various Militant Groups'],
        startDate: new Date('2012-01-16'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'Yemen Civil War',
        description: 'Ongoing multi-sided civil war',
        country: 'Yemen',
        region: 'Multiple regions',
        coordinates: {
            latitude: 15.5527,
            longitude: 48.5164
        },
        conflictType: 'CIVIL',
        status: 'ACTIVE',
        severity: 'CRITICAL',
        parties: ['Yemeni Government', 'Houthi Movement', 'Saudi-led Coalition'],
        startDate: new Date('2014-09-21'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'Kashmir Dispute',
        description: 'Territorial dispute between India and Pakistan',
        country: 'India',
        region: 'Kashmir',
        coordinates: {
            latitude: 34.0837,
            longitude: 74.7973
        },
        conflictType: 'TERRITORIAL',
        status: 'ACTIVE',
        severity: 'MEDIUM',
        parties: ['India', 'Pakistan'],
        startDate: new Date('1947-10-27'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'South China Sea Dispute',
        description: 'Territorial disputes in South China Sea',
        country: 'China',
        region: 'South China Sea',
        coordinates: {
            latitude: 12.0,
            longitude: 113.0
        },
        conflictType: 'TERRITORIAL',
        status: 'ACTIVE',
        severity: 'MEDIUM',
        parties: ['China', 'Philippines', 'Vietnam', 'Malaysia'],
        startDate: new Date('1947-01-01'),
        isActive: true,
        source: 'Public News Sources'
    },
    {
        name: 'Ethiopia Tigray Conflict',
        description: 'Armed conflict in northern Ethiopia',
        country: 'Ethiopia',
        region: 'Tigray',
        coordinates: {
            latitude: 14.0,
            longitude: 38.0
        },
        conflictType: 'CIVIL',
        status: 'DE_ESCALATING',
        severity: 'MEDIUM',
        parties: ['Ethiopian Government', 'TPLF'],
        startDate: new Date('2020-11-03'),
        isActive: false,
        source: 'Public News Sources'
    }
];
/**
 * Main populate function
 */
async function populateConflictZones() {
    console.log('🚀 Starting conflict zones population...\n');
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'stanseproject',
            databaseURL: 'https://stanseproject.firebaseio.com'
        });
        console.log('✅ Firebase Admin initialized for project: stanseproject\n');
    }
    const db = admin.firestore();
    try {
        let created = 0;
        let updated = 0;
        let skipped = 0;
        for (const zone of sampleConflictZones) {
            try {
                // Check if conflict zone already exists by name
                const existing = await db.collection('conflict_zones')
                    .where('name', '==', zone.name)
                    .limit(1)
                    .get();
                if (!existing.empty) {
                    console.log(`⏭️  Skipping "${zone.name}" - already exists`);
                    skipped++;
                    continue;
                }
                // Create new conflict zone
                await db.collection('conflict_zones').add({
                    ...zone,
                    startDate: admin.firestore.Timestamp.fromDate(zone.startDate),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(`✅ Created: "${zone.name}" (${zone.country}, ${zone.severity})`);
                created++;
            }
            catch (error) {
                console.error(`❌ Failed to create "${zone.name}":`, error.message);
            }
        }
        console.log('\n✅ Population complete!');
        console.log(`Created: ${created}`);
        console.log(`Updated: ${updated}`);
        console.log(`Skipped: ${skipped}`);
        console.log(`Total zones in sample: ${sampleConflictZones.length}`);
    }
    catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}
// Run the script
populateConflictZones()
    .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
})
    .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
});
//# sourceMappingURL=populate-conflict-zones.js.map