// /api/claude-v2.js - Secure API with Clerk Authentication

import { createClerkClient } from '@clerk/backend';

// Initialize Clerk client with secret key
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// CORS function
function applyCors(req, res) {
  const origin = req.headers.origin;
  
  if (origin === 'https://atticuschat.space' || origin === 'https://www.atticuschat.space') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-tier');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return true;
  }
  return false;
}

// Simple API route to test
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Test if environment variables are available
    if (!process.env.CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    if (!process.env.CLERK_SECRET_KEY) {
      return res.status(500).json({ error: 'Clerk secret key not configured' });
    }

    // Simple test response first
    return res.status(200).json({
      status: 'API working',
      message: 'Environment variables configured correctly',
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('Error in /api/claude-v2:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
