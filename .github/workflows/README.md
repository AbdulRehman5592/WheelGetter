# GitHub Actions Scraper Workflow

This workflow automates the Maxun scraper and email notifications.

## Setup Required Secrets

Add these secrets to your GitHub repository settings:

1. `MAXUN_API_KEY` - Your Maxun API key
2. `MAXUN_BACKEND_URL` - Your Maxun backend URL  
3. `ROBOT_ID` - The robot ID to run
4. `WEBHOOK_URL` - Your webhook mailer URL (for email notifications)
5. `SMTP_HOST` - SMTP server host (optional, webhook-mailer uses defaults)
6. `SMTP_PORT` - SMTP port (optional, webhook-mailer uses defaults)
7. `SMTP_USER` - SMTP username
8. `SMTP_PASS` - SMTP password
9. `TO_EMAIL` - Destination email address

## Usage

The workflow runs daily at 9 AM. You can also trigger it manually from GitHub Actions tab.

## Testing

Test locally first:
```bash
MAXUN_API_KEY=your_key MAXUN_BACKEND_URL=your_url node server/dist/server/src/scripts/run-scraper.js
```