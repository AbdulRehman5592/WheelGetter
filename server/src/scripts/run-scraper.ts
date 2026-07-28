#!/usr/bin/env node
/**
 * Simple scraper runner for GitHub Actions
 * Triggers Maxun scraper and sends results to webhook
 */

const http = require('http');
const https = require('https');

const MAXUN_API_KEY = process.env.MAXUN_API_KEY;
const MAXUN_BACKEND_URL = process.env.MAXUN_BACKEND_URL || 'http://localhost:3000';
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const ROBOT_ID = process.env.ROBOT_ID;

function httpRequest(options: any, postData?: any) {
  const client = options.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: any) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function triggerScraper() {
  console.log('Triggering scraper...');

  const url = new URL(MAXUN_BACKEND_URL);
  const options = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: '/api/robots/run',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MAXUN_API_KEY}`
    }
  };

  return httpRequest(options, { robot_id: ROBOT_ID });
}

async function sendWebhook(results: any) {
  if (!WEBHOOK_URL) {
    console.log('No webhook URL configured, skipping email');
    return;
  }

  console.log('Sending results to webhook...');

  const url = new URL(WEBHOOK_URL);
  const options = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: '/webhook',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };

  return httpRequest(options, results);
}

async function main() {
  try {
    const results = await triggerScraper();
    console.log('Scraper completed:', results);
    await sendWebhook(results);
    console.log('Workflow completed successfully');
  } catch (error) {
    console.error('Workflow failed:', error);
    process.exit(1);
  }
}

main();