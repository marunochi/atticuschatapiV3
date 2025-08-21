// /api/claude.js - Secure API with Clerk Authentication

import { clerkClient } from '@clerk/backend';

// --------- CORS CONFIG ----------
function applyCors(req, res) {
    // Set CORS headers FIRST
    res.setHeader('Access-Control-Allow-Origin', 'https://atticuschat.space');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-tier');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');

    // Handle preflight OPTIONS request immediately
    if (req.method === 'OPTIONS') {
      res.statusCode = 200;  // Changed from 204 to 200
      res.end();
      return true;
    }
    return false;
  }

// --------- USER TIER CONFIG ----------
const TIER_CONFIG = {
  free: { dailyLimit: 12, name: 'Gratuit' },
  beta: { dailyLimit: 25, name: 'Beta' },
  premium: { dailyLimit: 25, name: 'Premium' } // Could be unlimited later
};

// --------- ENVIRONMENT VARIABLES ----------
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY; // Server-side Claude API key
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

function originIsAllowed(origin = '') {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOW_VERCEL_PREVIEWS && /^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

// FIXED CORS FUNCTION
function applyCors(req, res) {
  // Always allow all origins for now
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-tier');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

// --------- AUTHENTICATION FUNCTIONS ----------
async function authenticateUser(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { error: 'Missing or invalid authorization header', status: 401 };
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    
    let user, session;
    
    try {
      // Try 1: Direct session ID verification
      session = await clerkClient.sessions.getSession(token);
      if (session) {
        user = await clerkClient.users.getUser(session.userId);
      }
    } catch (sessionError) {
      console.log('Session verification failed, trying JWT verification:', sessionError.message);
      
      try {
        // Try 2: JWT token verification
        const verifiedToken = await clerkClient.verifyToken(token);
        if (verifiedToken && verifiedToken.sub) {
          user = await clerkClient.users.getUser(verifiedToken.sub);
        }
      } catch (jwtError) {
        console.log('JWT verification failed, trying fallback:', jwtError.message);
        
        // Try 3: Base64 encoded fallback (email:userID)
        try {
          // Check if token looks like base64 (no colons in raw token)
          if (!token.includes(':') && token.length > 20) {
            try {
              const decoded = Buffer.from(token, 'base64').toString('utf-8');
              if (decoded.includes(':')) {
                const [email, userId] = decoded.split(':');
                if (email && userId) {
                  user = await clerkClient.users.getUser(userId);
                  // Verify email matches
                  if (user.primaryEmailAddress?.emailAddress !== email) {
                    throw new Error('Email mismatch');
                  }
                }
              }
            } catch (base64Error) {
              // Not valid base64, try direct user ID
              user = await clerkClient.users.getUser(token);
            }
          } else {
            // Try 4: Direct user ID lookup
            user = await clerkClient.users.getUser(token);
          }
        } catch (fallbackError) {
          console.log('Fallback authentication failed:', fallbackError.message);
        }
      }
    }
    
    if (!user) {
      return { error: 'Invalid authentication token', status: 401 };
    }

    // Determine user tier
    const userTier = getUserTier(user);
    
    console.log(`User authenticated: ${user.firstName} (${user.id}) - Tier: ${userTier}`);
    
    return { 
      user, 
      userTier,
      userId: user.id,
      success: true 
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return { error: 'Authentication failed', status: 401 };
  }
}

function getUserTier(user) {
  // Check user metadata for tier information
  const publicMetadata = user.publicMetadata || {};
  const privateMetadata = user.privateMetadata || {};
  
  // Priority: privateMetadata > publicMetadata > email domain check > default
  if (privateMetadata.tier) return privateMetadata.tier;
  if (publicMetadata.tier) return publicMetadata.tier;
  
  // Check for beta access by email domain or specific emails
  const email = user.primaryEmailAddress?.emailAddress || '';
  if (email.endsWith('@atticusconseil.com') || 
      email.endsWith('@atticus.com') ||
      publicMetadata.betaAccess) {
    return 'beta';
  }
  
  return 'free';
}

// --------- USAGE TRACKING FUNCTIONS ----------
async function checkUsageLimit(userId, userTier) {
  try {
    const tierConfig = TIER_CONFIG[userTier];
    if (!tierConfig) {
      return { allowed: false, reason: 'Invalid user tier' };
    }
    
    // In a production app, you'd store this in a database
    // For now, we'll use a simple in-memory cache or external storage
    // This is a simplified implementation
    
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `usage_${userId}_${today}`;
    
    // In production, replace with Redis or database query
    // For now, we'll allow the request and implement client-side limiting
    const currentUsage = 0; // TODO: Implement proper usage tracking
    
    if (currentUsage >= tierConfig.dailyLimit) {
      return { 
        allowed: false, 
        reason: `Daily limit of ${tierConfig.dailyLimit} messages exceeded`,
        usage: { used: currentUsage, limit: tierConfig.dailyLimit }
      };
    }
    
    return { 
      allowed: true, 
      usage: { used: currentUsage, limit: tierConfig.dailyLimit }
    };
  } catch (error) {
    console.error('Usage check error:', error);
    return { allowed: false, reason: 'Usage check failed' };
  }
}

async function incrementUsage(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `usage_${userId}_${today}`;
    
    // In production, implement proper usage tracking with Redis/Database
    // For now, this is a placeholder
    console.log(`Usage incremented for user ${userId} on ${today}`);
    
    return true;
  } catch (error) {
    console.error('Usage increment error:', error);
    return false;
  }
}

// ---------- HELPERS ----------
function safeJSONString(obj, maxLen = 4000) {
  try {
    const s = JSON.stringify(obj);
    if (s.length <= maxLen) return s;
    const keys = Object.keys(obj).slice(0, 20);
    let out = JSON.stringify(keys.reduce((a, k) => ((a[k] = obj[k]), a), {}));
    if (out.length > maxLen) out = out.slice(0, maxLen - 3) + '...';
    return out;
  } catch {
    return '{}';
  }
}

function appendProfileToSystem(baseSystem, profile) {
  if (!profile || typeof profile !== 'object') return baseSystem;
  const json = safeJSONString(profile, 4000);
  const block = `
---
PROFIL UTILISATEUR (résumé JSON à utiliser pour personnaliser sans le répéter mot à mot) :
${json}

Consignes de personnalisation :
- Adapter systématiquement recommandations au profil (objectifs, tolérance au risque, horizon, capacité d'épargne).
- Ne pas réimprimer le JSON brut ; intégrer l'info naturellement dans la réponse.
- Privilégier le droit/fiscalité FR et rappeler limites si info manquante/incertaine.
---`;
  return `${baseSystem}\n${block}`;
}

// ---------- API ROUTE ----------
export default async function handler(req, res) {
  if (applyCors(req, res)) return; // preflight handled

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Authenticate user with Clerk
    const authResult = await authenticateUser(req);
    if (!authResult.success) {
      return res.status(authResult.status || 401).json({ 
        error: authResult.error || 'Authentication failed' 
      });
    }

    const { user, userTier, userId } = authResult;

    // Check usage limits
    const usageCheck = await checkUsageLimit(userId, userTier);
    if (!usageCheck.allowed) {
      return res.status(429).json({ 
        error: 'Usage limit exceeded',
        reason: usageCheck.reason,
        usage: usageCheck.usage,
        userTier,
        resetTime: new Date().setHours(24, 0, 0, 0) // Next midnight
      });
    }

    // Validate required server-side API key
    if (!CLAUDE_API_KEY) {
      console.error('CLAUDE_API_KEY not configured on server');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const {
      messages = [],
      model = 'claude-sonnet-4-20250514',
      max_tokens = 3000,
      profile,
      system: incomingSystem,
      userTier: clientUserTier, // Ignore client-provided tier, use server-validated one
    } = req.body || {};

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Request from user ${userId} (${userTier}):`, {
        messagesCount: messages.length,
        hasProfile: !!profile
      });
    }

    // *** YOUR EXACT SYSTEM PROMPT (unchanged) ***
    const BASE_SYSTEM =
      incomingSystem ||
      `Vous êtes Atticus Chat, un assistant IA expert en gestion de patrimoine et investissement en France.
Toujours donner des réponses claires, argumentées et adaptées au droit/fiscalité française.

IMPORTANT : Pour créer des graphiques, utilisez cette syntaxe spéciale avec unités et explications: 
[CHART:type|data|options] 

Types disponibles: line, bar, doughnut, pie
(ATTENTION: N'utilisez PAS "polarArea" - non supporté par le système)

RÈGLES CRITIQUES pour éviter les erreurs:
1. Pour graphiques en secteurs (pie/doughnut): backgroundColor doit être un ARRAY de couleurs
2. Pour graphiques en barres/lignes: backgroundColor doit être une STRING (couleur unique) par dataset
3. TOUJOURS vérifier que data.length = labels.length
4. TOUJOURS fermer correctement le JSON avec toutes les accolades
5. Pour graphiques empilés: ajouter "stacked":true sur BOTH x et y dans scales

Exemple CORRECT pour graphique en secteurs:
[CHART:doughnut|{"labels":["PEA Actions","Assurance-vie","SCPI","Liquidités","Autres"],"datasets":[{"data":[35,25,20,15,5],"backgroundColor":["#3b82f6","#10b981","#f59e0b","#6366f1","#ef4444"],"borderColor":"#1f2937","borderWidth":2,"unit":"%","label":"Répartition patrimoine"}],"explanation":"Cette répartition équilibrée pour un profil modéré privilégie la croissance via le PEA (35%) tout en conservant la sécurité avec l'assurance-vie (25%) et la diversification immobilière SCPI (20%). Les liquidités (15%) assurent la flexibilité."}|{"responsive":true,"plugins":{"legend":{"position":"bottom","labels":{"color":"#f3f4f6"}}}}]

Exemple CORRECT pour graphique en barres simple:
[CHART:bar|{"labels":["Fonds euros","SCPI","Actions PEA","UC Assurance-vie"],"datasets":[{"label":"Rendement estimé","data":[2.5,4.5,6.8,5.2],"backgroundColor":"#3b82f6","borderColor":"#1d4ed8","borderWidth":1,"unit":"%"}],"explanation":"Les actions PEA offrent le meilleur potentiel de rendement (6,8%) mais avec plus de volatilité. Les SCPI (4,5%) offrent un bon compromis rendement/risque avec des revenus réguliers."}|{"responsive":true,"plugins":{"legend":{"labels":{"color":"#f3f4f6"}}},"scales":{"x":{"ticks":{"color":"#f3f4f6"},"grid":{"color":"rgba(255,255,255,0.1)"}},"y":{"ticks":{"color":"#f3f4f6"},"grid":{"color":"rgba(255,255,255,0.1)"}}}}]

Exemple CORRECT pour graphique empilé (stacked bar):
[CHART:bar|{"labels":["20-30 ans","30-40 ans","40-50 ans","50-60 ans","60+ ans"],"datasets":[{"label":"Actions","data":[60,50,40,25,15],"backgroundColor":"#3b82f6","unit":"%"},{"label":"Obligations","data":[20,25,30,35,40],"backgroundColor":"#10b981","unit":"%"},{"label":"Immobilier","data":[15,20,25,30,35],"backgroundColor":"#f59e0b","unit":"%"},{"label":"Liquidités","data":[5,5,5,10,10],"backgroundColor":"#6366f1","unit":"%"}],"explanation":"Allocation patrimoniale recommandée par tranche d'âge. Plus on avance en âge, plus la part d'actions diminue au profit des obligations et de l'immobilier pour réduire le risque."}|{"responsive":true,"plugins":{"legend":{"labels":{"color":"#f3f4f6"}}},"scales":{"x":{"stacked":true,"ticks":{"color":"#f3f4f6"},"grid":{"color":"rgba(255,255,255,0.1)"}},"y":{"stacked":true,"ticks":{"color":"#f3f4f6"},"grid":{"color":"rgba(255,255,255,0.1)"}}}}]

Exemple CORRECT pour graphique temporel:
[CHART:line|{"labels":["2020","2021","2022","2023","2024"],"datasets":[{"label":"Évolution rendement","data":[1.2,1.8,2.1,2.8,3.1],"backgroundColor":"#60a5fa","borderColor":"#3b82f6","borderWidth":2,"unit":"%"}],"explanation":"L'évolution positive des rendements des fonds euros reflète la remontée progressive des taux d'intérêt depuis 2022, bénéficiant aux nouveaux investissements."}|{"responsive":true,"plugins":{"legend":{"labels":{"color":"#f3f4f6"}}},"scales":{"x":{"ticks":{"color":"#f3f4f6"},"grid":{"color":"rgba(255,255,255,0.1)"}},"y":{"ticks":{"color":"#f3f4f6"},"grid":{"color":"rgba(255,255,255,0.1)"}}}}]

TOUJOURS inclure:
- "unit" dans chaque dataset (%, €, k€, etc.)
- "label" descriptif pour chaque dataset  
- "explanation" pour expliquer le graphique et ses implications
- Des couleurs cohérentes: #3b82f6 (bleu), #10b981 (vert), #f59e0b (orange), #6366f1 (indigo), #ef4444 (rouge)
- Des valeurs réalistes et cohérentes
- JSON parfaitement fermé avec toutes les accolades

Palette de couleurs recommandée:
- Bleu principal: #3b82f6
- Vert: #10b981  
- Orange: #f59e0b
- Indigo: #6366f1
- Rouge: #ef4444
- Gris: #6b7280

Structurez vos réponses avec des sections HTML claires: 
- <div class="content-section"> pour les sections principales 
- <div class="content-grid"> pour organiser les cartes 
- <div class="content-card"> pour afficher des métriques 
- <table class="data-table"> pour les tableaux de données 

Utilisez des graphiques pour illustrer les allocations, comparaisons, et évolutions quand ils apportent de la valeur ajoutée. 
Rédigez en français de manière claire et professionnelle avec des conseils pratiques.
`;

    const system = appendProfileToSystem(BASE_SYSTEM, profile);

    // Call Claude API with server-side API key
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': CLAUDE_API_KEY, // Use server-side API key
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Claude API error for user ${userId}:`, {
        status: resp.status,
        response: text
      });
      
      // Don't expose internal API errors to client
      return res.status(resp.status >= 500 ? 500 : resp.status).json({ 
        error: resp.status >= 500 ? 'Internal server error' : 'API request failed'
      });
    }

    const data = await resp.json();
    
    // Increment usage count after successful response
    await incrementUsage(userId);
    
    // Add usage info to response
    const updatedUsage = await checkUsageLimit(userId, userTier);
    
    return res.status(200).json({
      ...data,
      usage: updatedUsage.usage,
      userTier
    });
    
  } catch (err) {
    console.error('Error in /api/claude:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
