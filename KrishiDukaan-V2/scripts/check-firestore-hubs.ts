import * as fs from 'fs';
import axios from 'axios';

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

  const projectId = 'krishidukan-e8315';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/hubs`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const docs = res.data.documents || [];
    console.log(`Found ${docs.length} documents in the hubs collection:`);
    for (const doc of docs) {
      console.log(`- Document ID: ${doc.name.split('/').pop()}, Name field: ${doc.fields?.name?.stringValue}`);
    }
  } catch (err: any) {
    console.error('Error querying Firestore hubs:', err.response?.data || err.message);
  }
}

main();
