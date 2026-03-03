import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const config = {
        apiKey: process.env.PAYMOB_API_KEY,
        integrationId: process.env.PAYMOB_INTEGRATION_ID
    };

    if (!config.apiKey) {
        return res.status(500).json({ status: 'MISSING_PAYMOB_KEY' });
    }

    try {
        const authResponse = await fetch('https://accept.paymob.com/api/auth/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: config.apiKey })
        });

        if (!authResponse.ok) throw new Error(`Auth Failed: ${authResponse.status}`);

        const authData = await authResponse.json();
        return res.status(200).json({ status: 'OK', token_valid: !!authData.token });

    } catch (error: any) {
        return res.status(500).json({ status: 'AUTH_FAILED', error: error.message });
    }
}

