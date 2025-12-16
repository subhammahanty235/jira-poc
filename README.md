# Jira Integration POC

A complete proof-of-concept for Jira integration using OAuth 2.0 (3LO) authentication. This application allows users to connect their Jira account and create real tickets in their projects.

## Features

- OAuth 2.0 authentication with Atlassian/Jira
- Secure token management with automatic refresh
- List all accessible Jira projects
- Dynamic issue type loading per project
- Create tickets with summary and description
- Clean, responsive UI with no frameworks
- Session-based authentication
- Comprehensive error handling

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Authentication**: OAuth 2.0 (3-legged OAuth)
- **Session Management**: express-session
- **HTTP Client**: axios

## Prerequisites

- Node.js (v14 or higher)
- A Jira account with access to at least one project
- An Atlassian Developer account

## Setup Instructions

### Step 1: Create Atlassian OAuth App

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click **"Create"** and select **"OAuth 2.0 integration"**
3. Fill in the app details:
   - **App name**: Jira Integration POC (or any name you prefer)
   - **Description**: OAuth POC for Jira ticket creation
4. Click **"Create"**

### Step 2: Configure OAuth Settings

1. In your app settings, navigate to **"Permissions"**
2. Click **"Add APIs"** and select **"Jira API"**
3. Configure the following scopes:
   - `read:jira-work` - Read Jira project and issue data
   - `write:jira-work` - Create and edit issues
   - `read:me` - Read user information
   - `offline_access` - Refresh tokens
4. Click **"Save changes"**

5. Navigate to **"Authorization"** tab
6. Click **"Add"** under OAuth 2.0 (3LO)
7. Add the callback URL:
   ```
   http://localhost:3000/auth/callback
   ```
8. Click **"Save changes"**

### Step 3: Get Credentials

1. In your app settings, go to **"Settings"** tab
2. Copy the **Client ID**
3. Copy the **Secret** (you may need to generate one if not visible)
4. Keep these credentials safe - you'll need them in the next step

### Step 4: Install and Configure

1. **Clone or download this project**

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file** with your credentials:
   ```env
   JIRA_CLIENT_ID=your_actual_client_id_here
   JIRA_CLIENT_SECRET=your_actual_client_secret_here
   CALLBACK_URL=http://localhost:3000/auth/callback
   SESSION_SECRET=generate_a_random_string_here
   PORT=3000
   ```

   **Important**:
   - Replace `your_actual_client_id_here` with the Client ID from Step 3
   - Replace `your_actual_client_secret_here` with the Secret from Step 3
   - For `SESSION_SECRET`, use a random string (e.g., generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

### Step 5: Start the Server

```bash
npm start
```

You should see:
```
========================================
Jira Integration POC Server
========================================
Server running on: http://localhost:3000
...
========================================
```

### Step 6: Test the Application

1. Open your browser and go to: `http://localhost:3000`
2. Click **"Connect Jira Account"**
3. You'll be redirected to Atlassian login page
4. Log in with your Atlassian/Jira credentials
5. Grant permissions to the app
6. You'll be redirected back to the app
7. Select a project from the dropdown
8. Select an issue type
9. Fill in the summary and description
10. Click **"Create Ticket"**
11. The ticket will be created and you'll see a link to view it in Jira

## Project Structure

```
jira-poc/
├── server.js              # Express server with OAuth and API endpoints
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (create from .env.example)
├── .env.example           # Environment variables template
├── public/
│   └── index.html        # Frontend UI (single page)
└── README.md             # This file
```

## API Endpoints

### Authentication Endpoints

- **GET /auth/jira** - Initiates OAuth flow
- **GET /auth/callback** - OAuth callback handler
- **GET /auth/status** - Check connection status
- **POST /auth/disconnect** - Disconnect and clear session

### Jira API Endpoints

- **GET /api/projects** - Fetch all accessible projects
- **GET /api/issuetypes?projectKey=XXX** - Fetch issue types for a project
- **POST /api/ticket** - Create a new ticket
  ```json
  {
    "projectKey": "PROJ",
    "issueType": "Task",
    "summary": "Ticket summary",
    "description": "Optional description"
  }
  ```

## How OAuth Flow Works

1. **Authorization Request**: User clicks "Connect Jira" → redirected to Atlassian with app credentials
2. **User Consent**: User logs in and grants permissions
3. **Callback**: Atlassian redirects back with authorization code
4. **Token Exchange**: Server exchanges code for access token and refresh token
5. **Resource Discovery**: Server fetches accessible Jira sites using the token
6. **Session Storage**: Tokens and cloud ID stored in session
7. **API Calls**: All Jira API calls use the stored access token
8. **Token Refresh**: If token expires, automatically refresh using refresh token

## Security Features

- CSRF protection using state parameter
- httpOnly session cookies
- Client secret never exposed to frontend
- Token refresh mechanism for expired tokens
- Secure session management

## Troubleshooting

### "Invalid state parameter" Error
- This is a CSRF protection error
- Clear your browser cookies and try again
- Make sure you're not clicking the connect button multiple times

### "No accessible Jira sites found" Error
- Make sure your Atlassian account has access to at least one Jira site
- Verify that the app has the correct permissions/scopes

### "Failed to create ticket" Error
- Check that the selected project allows the issue type
- Verify that you have write permissions in the project
- Some issue types may require additional fields (this POC only handles basic fields)

### "Authorization failed" on Callback
- Verify your Client ID and Client Secret are correct
- Check that the callback URL in Atlassian Console matches: `http://localhost:3000/auth/callback`
- Make sure all required scopes are enabled in the Atlassian Console

### "Token refresh failed"
- This means your refresh token is invalid or expired
- Click "Disconnect" and reconnect your account

### Projects or Issue Types Not Loading
- Check server console logs for error details
- Verify your access token is valid
- Make sure you have permissions to view projects

## Common Issues During Setup

### Issue: Port 3000 already in use
**Solution**: Change the PORT in `.env` file to another port (e.g., 3001)

### Issue: Cannot find module errors
**Solution**: Run `npm install` to install all dependencies

### Issue: Callback URL mismatch
**Solution**: Make sure the callback URL in:
- Your `.env` file
- Atlassian Developer Console
- Are exactly the same (including protocol and port)

## Testing Checklist

- [ ] OAuth flow completes successfully
- [ ] Connection status shows "Connected to [site-name]"
- [ ] Projects dropdown populates with your projects
- [ ] Issue types load when project is selected
- [ ] Can create a ticket with summary only
- [ ] Can create a ticket with summary and description
- [ ] Created ticket appears in Jira project
- [ ] Ticket link opens correct issue in Jira
- [ ] Can disconnect and reconnect
- [ ] Token refresh works (wait for token to expire)

## Development Notes

### Token Expiry
- Access tokens expire after a certain time (typically 1 hour)
- The server automatically refreshes tokens before making API calls
- If refresh fails, user needs to reconnect

### Atlassian Document Format (ADF)
- Jira uses ADF for rich text descriptions
- This POC converts plain text to basic ADF format
- For more complex formatting, extend the ADF structure in server.js

### Session Storage
- Currently uses in-memory session storage
- For production, use a persistent session store (Redis, database, etc.)

## Extending This POC

Some ideas to extend this POC:

1. **Database Integration**: Store tokens in SQLite or PostgreSQL instead of sessions
2. **Multiple Sites**: Support connecting to multiple Jira sites
3. **Rich Text Editor**: Add markdown or WYSIWYG editor for descriptions
4. **File Attachments**: Support uploading attachments to tickets
5. **Custom Fields**: Handle project-specific custom fields
6. **Assignee Selection**: Add ability to assign tickets to users
7. **Sprint Selection**: Add tickets to specific sprints
8. **Bulk Operations**: Create multiple tickets at once
9. **Webhook Integration**: Listen to Jira events
10. **Issue Linking**: Link related issues together

## Resources

- [Atlassian OAuth 2.0 Documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Jira Cloud REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Atlassian Document Format](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)

## License

MIT

## Support

For issues or questions about this POC, check:
1. Server console logs for detailed error messages
2. Browser console for frontend errors
3. Atlassian Developer Console for OAuth app status

---

Built as a proof-of-concept for Jira OAuth 2.0 integration.
