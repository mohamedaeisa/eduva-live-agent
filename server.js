import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config(); // Fallback to .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(compression());
app.use(express.json());

// Serve frontend build artifacts
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    // Check if the file exists in dist
    const filePath = path.join(distPath, 'index.html');
    res.sendFile(filePath);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`[SERVER] AI Private Tutor running at http://0.0.0.0:${port}`);
    console.log(`[SERVER] Ready for Cloud Run deployment!`);
});
