import * as fs from 'fs';
import axios from 'axios';
import { INITIAL_HUBS } from '../app/initialHubs';

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'number') {
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue)
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      fields[key] = toFirestoreValue(val[key]);
    }
    return {
      mapValue: { fields }
    };
  }
  throw new Error(`Unsupported type: ${typeof val}`);
}

function toFirestoreDocument(obj: Record<string, any>): any {
  const fields: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    fields[key] = toFirestoreValue(obj[key]);
  }
  return { fields };
}

async function main() {
  const credentialsPath = '/home/charon/.config/configstore/firebase-tools.json';
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Firebase tools credentials not found at ${credentialsPath}`);
  }
  const config = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const accessToken = config.tokens?.access_token;
  if (!accessToken) {
    throw new Error('Access token not found in firebase-tools config');
  }

  console.log('Using owner access token to seed Firestore hubs...');
  const projectId = 'krishidukan-e8315';
  
  for (const hub of INITIAL_HUBS) {
    const { id, ...hubData } = hub;
    // Add timestamps
    const payload = {
      ...hubData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/hubs/${id}`;
    const firestoreDoc = toFirestoreDocument(payload);

    console.log(`Writing hub: ${id}...`);
    try {
      await axios.patch(docUrl, firestoreDoc, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      console.log(`Successfully seeded ${id}`);
    } catch (err: any) {
      console.error(`Failed to write ${id}:`, err.response?.data || err.message);
      throw err;
    }
  }

  console.log('All hubs seeded successfully!');
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
