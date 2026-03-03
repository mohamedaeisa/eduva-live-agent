
# EDUVA-Me AI

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key
3. Run the app:
   `npm run dev`

## Firebase Configuration

To enable Authentication, Session Tracking, and Global Knowledge Caching, you must configure Firebase.

### 1. Environment Variables
Create `.env.local` and add:

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 2. Firebase Console Setup
1. **Enable Authentication:**
   - Go to Build > Authentication > Sign-in method.
   - Enable **Google** provider.


2. **Create Firestore Database:**
   - Go to Build > Firestore Database.
   - Create database in production mode.

3. **Deploy Security Rules:**
   Go to Firestore > Rules and paste the rules from the project documentation.
