require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cheerio = require('cheerio');

const app = express();
// Accept large webhook payload (screenshots, data) but email only minimal info
app.use(express.json({ limit: '50mb' }));

// Log startup
console.log('=== Webhook Mailer Starting ===');
console.log('SMTP Host:', process.env.SMTP_HOST);
console.log('SMTP Port:', process.env.SMTP_PORT);
console.log('SMTP User:', process.env.SMTP_USER);
console.log('To Email:', process.env.TO_EMAIL);
console.log('Maxun API Key:', process.env.MAXUN_API_KEY ? 'configured' : 'NOT SET');
console.log('Maxun Backend:', process.env.MAXUN_BACKEND_URL);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: parseInt(process.env.SMTP_PORT) === 465, // true for 465 (SSL), false for 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('=== SMTP Authentication FAILED ===');
    console.error('Error:', error.message);
  } else {
    console.log('=== SMTP Authentication SUCCESS ===');
    console.log('Ready to send emails');
  }
});

// Track processed run IDs to prevent duplicates
const processedRuns = new Set();

// Helper to generate HTML email with better formatting
function generateHtmlEmail(robotName, status, capturedTexts, capturedLists, markdownOutput, textContent, cleanedItems) {
  let html = `
    <h2>Maxun Scrape Results</h2>
    <p><strong>Robot:</strong> ${robotName || 'Unknown'}</p>
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
  `;

  if (capturedTexts.length > 0) {
    html += `<h3>Captured Data</h3>`;
    capturedTexts.forEach(text => {
      html += `<pre style="background:#f5f5f5;padding:10px;border-radius:4px;overflow-x:auto;">${JSON.stringify(text, null, 2)}</pre>`;
    });
  }

  if (Object.keys(capturedLists).length > 0) {
    html += `<h3>Captured Lists</h3>`;
    for (const [listName, items] of Object.entries(capturedLists)) {
      html += `<h4>${listName}</h4>`;
      if (Array.isArray(items) && items.length > 0) {
        html += `<table style="border-collapse:collapse;width:100%;max-width:800px;">`;
        const headers = Object.keys(items[0]);
        html += `<tr style="background:#007bff;color:white;">`;
        headers.forEach(h => {
          html += `<th style="padding:8px;border:1px solid #ddd;">${h}</th>`;
        });
        html += `</tr>`;
        items.forEach((item, idx) => {
          html += `<tr style="${idx % 2 === 0 ? 'background:#f9f9f9' : ''}">`;
          headers.forEach(h => {
            html += `<td style="padding:8px;border:1px solid #ddd;">${item[h] || ''}</td>`;
          });
          html += `</tr>`;
        });
        html += `</table>`;
      }
    }
  }

  // Add cleaned items if available
  if (cleanedItems && cleanedItems.length > 0) {
    html += formatCleanedItemsHtml(cleanedItems);
  }

  if (textContent) {
    html += `<h3>Scraped Text Content</h3><pre style="background:#f5f5f5;padding:10px;border-radius:4px;overflow-x:auto;max-height:400px;overflow-y:auto;">${textContent}</pre>`;
  }

  if (markdownOutput) {
    html += `<h3>Markdown</h3><pre style="background:#f5f5f5;padding:10px;border-radius:4px;overflow-x:auto;">${markdownOutput}</pre>`;
  }

  html += `<hr><small>Sent by Maxun Webhook Mailer</small>`;
  return html;
}

// Clean HTML and extract items (titles, text, links)
function cleanHtmlContent(html) {
  if (!html) return '';

  const $ = cheerio.load(html);
  const items = [];

  // Common selectors for listing items (OLX, Amazon, eBay, etc.)
  const itemSelectors = [
    'article',           // Generic article tag
    '.item',             // Common class for items
    '.listing',          // Common class for listings
    '.product',          // Common class for products
    '[data-testid="listing-card"]',  // Test ID based
    '.ad-item',          // OLX specific
    '.ad-list-item',     // OLX specific
  ];

  // Try each selector
  for (const selector of itemSelectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      elements.each((i, elem) => {
        const $elem = $(elem);

        // Extract title (try multiple selectors)
        const title = $elem.find('h2, h3, h4, .title, [data-testid="ad-title"], .ad-title').first().text().trim() ||
                     $elem.find('a').first().text().trim();

        // Extract price
        const price = $elem.find('.price, [data-testid="ad-price"], .ad-price').first().text().trim();

        // Extract location
        const location = $elem.find('.location, [data-testid="ad-location"], .ad-location').first().text().trim();

        // Extract link
        const link = $elem.find('a').first().attr('href') || '';

        // Extract description/text
        const text = $elem.text().trim().substring(0, 200); // Limit to 200 chars

        if (title || text) {
          items.push({
            title: title || 'No title',
            price: price || '',
            location: location || '',
            link: link ? (link.startsWith('http') ? link : `https://www.olx.com.pk${link}`) : '',
            text: text
          });
        }
      });

      // If we found items with this selector, break
      if (items.length > 0) {
        console.log(`Found ${items.length} items using selector: ${selector}`);
        break;
      }
    }
  }

  return items;
}

// Format cleaned items for email
function formatCleanedItems(items) {
  if (!items || items.length === 0) return '';

  let formatted = '\n=== Extracted Items ===\n\n';
  items.forEach((item, index) => {
    formatted += `${index + 1}. ${item.title}\n`;
    if (item.price) formatted += `   Price: ${item.price}\n`;
    if (item.location) formatted += `   Location: ${item.location}\n`;
    if (item.link) formatted += `   Link: ${item.link}\n`;
    formatted += '\n';
  });

  return formatted;
}

// Format cleaned items for HTML email
function formatCleanedItemsHtml(items) {
  if (!items || items.length === 0) return '';

  let html = '<h3>Extracted Items</h3>';
  html += '<table style="border-collapse:collapse;width:100%;max-width:800px;">';
  html += '<tr style="background:#007bff;color:white;">';
  html += '<th style="padding:8px;border:1px solid #ddd;">#</th>';
  html += '<th style="padding:8px;border:1px solid #ddd;">Title</th>';
  html += '<th style="padding:8px;border:1px solid #ddd;">Price</th>';
  html += '<th style="padding:8px;border:1px solid #ddd;">Location</th>';
  html += '<th style="padding:8px;border:1px solid #ddd;">Link</th>';
  html += '</tr>';

  items.forEach((item, index) => {
    html += `<tr style="${index % 2 === 0 ? 'background:#f9f9f9' : ''}">`;
    html += `<td style="padding:8px;border:1px solid #ddd;">${index + 1}</td>`;
    html += `<td style="padding:8px;border:1px solid #ddd;">${item.title}</td>`;
    html += `<td style="padding:8px;border:1px solid #ddd;">${item.price || '-'}</td>`;
    html += `<td style="padding:8px;border:1px solid #ddd;">${item.location || '-'}</td>`;
    html += `<td style="padding:8px;border:1px solid #ddd;"><a href="${item.link || '#'}">${item.link ? 'View' : '-'}</a></td>`;
    html += '</tr>';
  });

  html += '</table>';
  return html;
}


app.post('/webhook', async (req, res) => {
  try {
    const { data } = req.body;
    console.log("data =", JSON.stringify(data, null, 2));
    console.log('\n=== Webhook Received ===12');
    console.log('Event:', req.body.event_type);
    console.log('Full data keys:', Object.keys(data || {}));
    console.log('Full payload:', JSON.stringify(req.body, null, 2));

    // Handle both camelCase (runId) and snake_case (run_id)
    const runId = data?.runId || data?.run_id;
    const robotName = data?.robotName || data?.robot_name;
    const status = data?.status;
    const textValue = data.extracted_data['text'];

    console.log('Robot:', robotName);
    console.log('Run ID:', runId);
    console.log('Status:', status);
    console.log("Text:",textValue);

    if (!data || !runId) {
      console.error('Invalid webhook payload - missing run_id');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Idempotency: skip if already processed
    // if (processedRuns.has(runId)) {
    //   console.log('Run already processed, skipping:', runId);
    //   return res.json({ skipped: true, run_id: runId, reason: 'already processed' });
    // }
    processedRuns.add(runId);

    // Cleanup old entries (keep last 1000)
    if (processedRuns.size > 1000) {
      const first = processedRuns.values().next().value;
      processedRuns.delete(first);
    }

    console.log('Extracted data keys:', Object.keys(data.extracted_data || {}));

    // Build email body with scraped data
    let emailBody = `Robot: ${robotName || 'Unknown'}
Status: ${status}
Time: ${new Date().toISOString()}
Text:${textValue}
`;

    // Add captured texts from webhook data
    const capturedTexts = data.extracted_data?.captured_texts || data.captured_texts || [];
    if (capturedTexts.length > 0) {
      emailBody += `\n=== Captured Data ===\n`;
      capturedTexts.forEach(text => {
        emailBody += `\n${JSON.stringify(text, null, 2)}\n`;
      });
    }

    // Add captured lists (tabular data) from webhook data
    const capturedLists = data.extracted_data?.captured_lists || data.captured_lists || {};
    if (Object.keys(capturedLists).length > 0) {
      emailBody += `\n=== Captured Lists ===\n`;
      for (const [listName, items] of Object.entries(capturedLists)) {
        emailBody += `\n${listName}:\n`;
        if (Array.isArray(items) && items.length > 0) {
          const headers = Object.keys(items[0]).join(' | ');
          emailBody += `${headers}\n`;
          emailBody += `${'-'.repeat(headers.length)}\n`;
          items.forEach(item => {
            emailBody += `${Object.values(item).join(' | ')}\n`;
          });
        }
      }
    }

    // Clean HTML and extract items if HTML content is available
    let cleanedItems = [];
    if (data.extracted_data?.html) {
      console.log('Cleaning HTML content...');
      cleanedItems = cleanHtmlContent(data.extracted_data.html);
      if (cleanedItems.length > 0) {
        console.log(`Extracted ${cleanedItems.length} items from HTML`);
        emailBody += formatCleanedItems(cleanedItems);
      } else {
        console.log('No items extracted from HTML, falling back to text');
      }
    }

    // Add text content from extracted_data (scraped page text)
    // Only add text if no HTML items were extracted
    if (cleanedItems.length === 0 && req.body?.data?.extracted_data?.text) {
      emailBody += `\n=== Scraped Text ===\n${req.body?.data?.extracted_data?.text}\n`;
    }

    // Add markdown from extracted_data
    if (data.extracted_data?.markdown) {
      emailBody += `\n=== Markdown ===\n${data.extracted_data.markdown}\n`;
    }

    // Add raw output if available (legacy support)
    if (data.markdown && !data.extracted_data?.markdown) {
      emailBody += `\n=== Markdown ===\n${data.markdown}\n`;
    }
    if(data.text)
      {
      emailBody += `\n=== Markdown ===\n${data.text}\n`;
    }
    console.log('Sending email to:', process.env.TO_EMAIL);

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.TO_EMAIL,
      subject: `[Maxun] Scrape: ${robotName || 'Robot'} - ${status}`,
      text: emailBody,
      // Optional: add HTML version for better formatting
      html: generateHtmlEmail(robotName, status, capturedTexts, capturedLists, data.extracted_data?.markdown || data.markdown, data.extracted_data?.text, cleanedItems)
    });

    console.log('=== Email Sent Successfully ===');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log(`[${new Date().toISOString()}] Email sent for run ${runId} (${robotName})`);

    res.json({ sent: true, run_id: runId, messageId: info.messageId });

  } catch (err) {
    console.error('=== Email Send FAILED ===');
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'webhook-mailer',
    smtp: 'configured',
    to: process.env.TO_EMAIL
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n=================================');
  console.log('Webhook Mailer running on port', PORT);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`Webhook endpoint: http://0.0.0.0:${PORT}/webhook`);
  console.log('=================================\n');
});
