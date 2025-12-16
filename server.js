require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Atlassian OAuth URLs
const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/**
 * Middleware to refresh token if expired
 */
async function refreshTokenIfNeeded(req, res, next) {
  if (!req.session.accessToken) {
    return next();
  }

  // Check if token is expired (we store expiry time during token exchange)
  if (req.session.tokenExpiry && Date.now() >= req.session.tokenExpiry) {
    try {
      console.log('Token expired, refreshing...');
      const response = await axios.post(ATLASSIAN_TOKEN_URL, {
        grant_type: 'refresh_token',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        refresh_token: req.session.refreshToken
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      // Update session with new tokens
      req.session.accessToken = response.data.access_token;
      req.session.refreshToken = response.data.refresh_token;
      req.session.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      console.log('Token refreshed successfully');
    } catch (error) {
      console.error('Token refresh failed:', error.response?.data || error.message);
      // Clear session and require re-authentication
      req.session.destroy();
      return res.status(401).json({ error: 'Token refresh failed. Please reconnect.' });
    }
  }

  next();
}

// ============================================================================
// OAUTH 2.0 ENDPOINTS
// ============================================================================

/**
 * GET /auth/jira
 * Initiates the OAuth 2.0 authorization flow
 * Redirects user to Atlassian authorization page
 */
app.get('/auth/jira', (req, res) => {
  // Generate random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  // Build authorization URL
  const authUrl = new URL(ATLASSIAN_AUTH_URL);
  authUrl.searchParams.append('audience', 'api.atlassian.com');
  authUrl.searchParams.append('client_id', process.env.JIRA_CLIENT_ID);
  authUrl.searchParams.append('scope', 'read:jira-work write:jira-work read:me offline_access');
  authUrl.searchParams.append('redirect_uri', process.env.CALLBACK_URL);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('prompt', 'consent');
  authUrl.searchParams.append('state', state);

  console.log('Redirecting to Atlassian authorization URL');
  res.redirect(authUrl.toString());
});

/**
 * GET /auth/callback
 * Handles the OAuth callback from Atlassian
 * Exchanges authorization code for access token
 */
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Validate state parameter for CSRF protection
  if (!state || state !== req.session.oauthState) {
    console.error('Invalid state parameter');
    return res.status(400).send('Invalid state parameter. Possible CSRF attack.');
  }

  // Clear the state from session
  delete req.session.oauthState;

  if (!code) {
    console.error('No authorization code received');
    return res.status(400).send('Authorization failed. No code received.');
  }

  try {
    // Exchange authorization code for access token
    console.log('Exchanging authorization code for access token...');
    const tokenResponse = await axios.post(ATLASSIAN_TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.CALLBACK_URL
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Store tokens in session
    req.session.accessToken = access_token;
    req.session.refreshToken = refresh_token;
    req.session.tokenExpiry = Date.now() + (expires_in * 1000);

    console.log('Access token obtained successfully');

    // Fetch accessible resources to get cloud ID
    console.log('Fetching accessible Jira resources...');
    const resourcesResponse = await axios.get(ATLASSIAN_RESOURCES_URL, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json'
      }
    });

    if (resourcesResponse.data.length === 0) {
      throw new Error('No accessible Jira sites found');
    }

    // Store the first accessible resource (cloud ID and site info)
    const resource = resourcesResponse.data[0];
    req.session.cloudId = resource.id;
    req.session.siteName = resource.name;
    req.session.siteUrl = resource.url;

    console.log(`Connected to Jira site: ${resource.name} (${resource.id})`);

    // Redirect to frontend with success
    res.send(`
      <html>
        <head>
          <title>Authorization Successful</title>
        </head>
        <body>
          <h2>Authorization Successful!</h2>
          <p>Connected to: ${resource.name}</p>
          <p>Redirecting back to app...</p>
          <script>
            setTimeout(() => {
              window.location.href = '/';
            }, 2000);
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).send(`
      <html>
        <body>
          <h2>Authorization Failed</h2>
          <p>${error.message}</p>
          <a href="/">Go back to app</a>
        </body>
      </html>
    `);
  }
});

/**
 * GET /auth/status
 * Returns the current authentication status
 */
app.get('/auth/status', (req, res) => {
  if (req.session.accessToken && req.session.cloudId) {
    res.json({
      connected: true,
      site: req.session.siteName,
      siteUrl: req.session.siteUrl
    });
  } else {
    res.json({ connected: false });
  }
});

/**
 * POST /auth/disconnect
 * Clears the session and logs out the user
 */
app.post('/auth/disconnect', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }
    console.log('User disconnected');
    res.json({ success: true });
  });
});

// ============================================================================
// JIRA API ENDPOINTS
// ============================================================================

/**
 * GET /api/projects
 * Fetches all accessible Jira projects
 */
app.get('/api/projects', requireAuth, refreshTokenIfNeeded, async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${req.session.cloudId}/rest/api/3/project`,
      {
        headers: {
          'Authorization': `Bearer ${req.session.accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    // Return simplified project data
    const projects = response.data.map(project => ({
      id: project.id,
      key: project.key,
      name: project.name
    }));

    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch projects',
      details: error.response?.data?.message || error.message
    });
  }
});

/**
 * GET /api/issuetypes?projectKey=XXX
 * Fetches issue types available for a specific project
 */
app.get('/api/issuetypes', requireAuth, refreshTokenIfNeeded, async (req, res) => {
  const { projectKey } = req.query;

  if (!projectKey) {
    return res.status(400).json({ error: 'projectKey is required' });
  }

  try {
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${req.session.cloudId}/rest/api/3/project/${projectKey}`,
      {
        headers: {
          'Authorization': `Bearer ${req.session.accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    // Extract issue types from project
    const issueTypes = response.data.issueTypes.map(type => ({
      id: type.id,
      name: type.name,
      description: type.description
    }));

    res.json(issueTypes);
  } catch (error) {
    console.error('Error fetching issue types:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch issue types',
      details: error.response?.data?.message || error.message
    });
  }
});

/**
 * POST /api/ticket
 * Creates a new Jira ticket
 * Body: { projectKey, issueType, summary, description }
 */
app.post('/api/ticket', requireAuth, refreshTokenIfNeeded, async (req, res) => {
  const { projectKey, issueType, summary, description } = req.body;

  // Validate required fields
  if (!projectKey || !issueType || !summary) {
    return res.status(400).json({
      error: 'Missing required fields: projectKey, issueType, and summary are required'
    });
  }

  try {
    // Build Jira issue payload with Atlassian Document Format (ADF) for description
    const issueData = {
      fields: {
        project: {
          key: projectKey
        },
        summary: summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description || 'No description provided'
                }
              ]
            }
          ]
        },
        issuetype: {
          name: issueType
        }
      }
    };

    console.log(`Creating ticket in project ${projectKey}...`);

    const response = await axios.post(
      `https://api.atlassian.com/ex/jira/${req.session.cloudId}/rest/api/3/issue`,
      issueData,
      {
        headers: {
          'Authorization': `Bearer ${req.session.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    const ticketKey = response.data.key;
    const ticketUrl = `${req.session.siteUrl}/browse/${ticketKey}`;

    console.log(`Ticket created successfully: ${ticketKey}`);

    res.json({
      success: true,
      key: ticketKey,
      url: ticketUrl,
      id: response.data.id
    });

  } catch (error) {
    console.error('Error creating ticket:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create ticket',
      details: error.response?.data?.errors || error.response?.data?.errorMessages || error.message
    });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
  ========================================
  Jira Integration POC Server
  ========================================
  Server running on: http://localhost:${PORT}

  Make sure you have:
  1. Created .env file with your credentials
  2. Configured OAuth app in Atlassian Console
  3. Added callback URL: ${process.env.CALLBACK_URL}

  Ready to connect to Jira!
  ========================================
  `);
});
