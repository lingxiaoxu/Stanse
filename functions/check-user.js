const admin = require("firebase-admin");

// Initialize with application default credentials
// Run: gcloud auth application-default login
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "stanseproject",
    databaseURL: "https://stanseproject-default-rtdb.firebaseio.com"
  });
}

const rtdb = admin.database();

async function checkPolisStatus() {
  console.log("=== Polis Protocol Status ===");
  console.log("Time:", new Date().toISOString());
  console.log("");

  const presenceSnap = await rtdb.ref("presence").once("value");
  const presence = presenceSnap.val() || {};

  const onlineUsers = [];
  for (const [uid, data] of Object.entries(presence)) {
    if (data.status === "online") {
      onlineUsers.push({ uid, ...data });
    }
  }

  console.log("👥 Active Allies Online:", onlineUsers.length);
  console.log("----------------------------------------");

  onlineUsers.forEach((u, i) => {
    const lastSeenTime = u.lastSeen ? new Date(u.lastSeen).toLocaleTimeString() : "N/A";
    console.log((i+1) + ". " + (u.personaLabel || "Unknown Persona"));
    console.log("   UID: " + (u.userId || u.uid).substring(0, 12) + "...");
    console.log("   Stance: " + (u.stanceType || "N/A"));
    console.log("   Core: " + (u.coreStanceType || "N/A"));
    console.log("   Last Seen: " + lastSeenTime);
    console.log("   In Queue: " + (u.inDuelQueue ? "Yes" : "No"));
    console.log("");
  });

  process.exit(0);
}

checkPolisStatus();
