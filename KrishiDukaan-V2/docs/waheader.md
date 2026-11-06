Documentation: Adding a new image-header WhatsApp template
  
  Step 1 — Upload the image to WhatsApp Media API (once)
  get creds from fiinnybusiness/KrishiDukaan-V2/functions/.env.local

  curl -X POST \
    "https://graph.facebook.com/v20.0/<WA_PHONE_NUMBER_ID>/media" \
    -H "Authorization: Bearer <WA_ACCESS_TOKEN>" \
    -F "messaging_product=whatsapp" \
    -F "type=image/jpeg" \
    -F "file=@/path/to/image.jpg"

  Response:
  { "id": "1234567890123456" }

  That id is your media ID. Re-upload if the template stops showing the image — Meta expires unused IDs after ~30 days.

  Alternatively, if you uploaded a sample image when creating the template in Meta Business Manager, that handle works too.

  ---
  Step 2 — Store the media ID in Secret Manager
  
  firebase functions:secrets:set WA_YOUR_TEMPLATE_HEADER_ID
  # paste the media ID when prompted

  Verify it saved:
  firebase functions:secrets:access WA_YOUR_TEMPLATE_HEADER_ID

  ---
  Step 3 — Declare the secret in wa-dispatch.ts
  
  // add near the other header ID declarations
  const WA_YOUR_TEMPLATE_HEADER_ID = defineSecret("WA_YOUR_TEMPLATE_HEADER_ID");

  Add it to both function secrets:[] arrays (sendWaNotification + retryWaNotifications):

  secrets: [...existing..., WA_YOUR_TEMPLATE_HEADER_ID],

  ---
  Step 4 — Read it in templateResolver.ts

  case "your_template_name": {
    const headerImageId = process.env.WA_YOUR_TEMPLATE_HEADER_ID;
    if (!headerImageId) {
      throw new Error("WA_YOUR_TEMPLATE_HEADER_ID not set — add to secrets[] and redeploy");
    }
    return [
      { type: "header", parameters: [{ type: "image", image: { id: headerImageId } }] },
    ];
  }

  Also add "your_template_name" to resolveTemplateLanguage() if it's not Marathi.

  ---
  Step 5 — Add the ID to functions/.env.local (emulator only)
  
  WA_YOUR_TEMPLATE_HEADER_ID=1234567890123456

  ---
  Step 6 — Deploy

  firebase deploy --only functions:sendWaNotification,functions:retryWaNotifications

  Firebase automatically grants the compute service account read access to the new secret on first deploy.

  ---
  Quick checklist for every new image-header template
  
  - [ ] Image uploaded to WhatsApp Media API → got media ID
  - [ ] Media ID stored in Secret Manager (firebase functions:secrets:set)
  - [ ] defineSecret("...") added in wa-dispatch.ts
  - [ ] Secret added to secrets:[] for both send + retry functions
  - [ ] process.env.WA_YOUR_TEMPLATE_HEADER_ID used in templateResolver.ts (no fallback to another template's ID)
  - [ ] ID added to functions/.env.local for local emulator use
  - [ ] Deployed


