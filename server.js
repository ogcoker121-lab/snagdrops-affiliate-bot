import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import crypto from 'node:crypto';
import { promises as dnsPromises } from 'dns';
import OpenAI from 'openai';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8791;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ── Persistent pipeline (survives restarts) ────────────────────────────────
const PIPELINE_FILE = join(__dirname, 'pipeline.json');
const PIPELINE_DEFAULTS = [
  { id: 1, brand: 'Wise', url: 'wise.com/affiliates', network: 'Direct', category: 'Finance', commission: '£30-50 CPA', cookie: '30 days', status: 'pending', notes: 'Email application', priority: 'high' },
  { id: 2, brand: 'Revolut', url: 'revolut.com/affiliate', network: 'Direct', category: 'Finance', commission: '£20-60 CPA', cookie: '30 days', status: 'pending', notes: 'Email application', priority: 'high' },
  { id: 3, brand: 'Coinbase', url: 'coinbase.com/affiliates', network: 'Direct', category: 'Finance', commission: '50% trading fees 3mo', cookie: '30 days', status: 'pending', notes: 'Web form', priority: 'high' },
  { id: 4, brand: 'Trading 212', url: 'trading212.com/affiliates', network: 'Direct', category: 'Finance', commission: 'CPA', cookie: '30 days', status: 'pending', notes: 'Email application', priority: 'high' },
  { id: 5, brand: 'Klarna', url: 'klarna.com/affiliates', network: 'Direct', category: 'Finance', commission: 'CPA', cookie: '30 days', status: 'pending', notes: 'Email application', priority: 'high' },
  { id: 6, brand: 'eToro', url: 'etoro.com', network: 'CJ Affiliate', category: 'Finance', commission: 'Up to $250 CPA', cookie: '45 days', status: 'pending', notes: 'Apply via CJ PID 7976183', priority: 'high' },
  { id: 7, brand: 'SoFi', url: 'sofi.com', network: 'CJ Affiliate', category: 'Finance', commission: 'CPA', cookie: '30 days', status: 'pending', notes: 'Apply via CJ PID 7976183', priority: 'medium' },
  { id: 8, brand: 'Barclays', url: 'barclays.co.uk', network: 'CJ Affiliate', category: 'Finance', commission: 'CPA', cookie: '30 days', status: 'pending', notes: 'Apply via CJ PID 7976183', priority: 'medium' },
  { id: 9, brand: 'NordVPN', url: 'nordvpn.com', network: 'CJ Affiliate', category: 'Tech', commission: 'Active', cookie: '30 days', status: 'active', notes: 'Live', priority: 'high' },
  { id: 10, brand: 'GearUP', url: 'gearup.gg', network: 'CJ Affiliate', category: 'Gaming', commission: 'Active', cookie: '30 days', status: 'active', notes: 'Live', priority: 'high' },
  { id: 11, brand: 'Huel', url: 'huel.com', network: 'Direct', category: 'Lifestyle', commission: 'Active', cookie: '30 days', status: 'active', notes: 'Live', priority: 'medium' }
];

let pipelineLoaded = false;
const pipeline = { programs: [] };

async function loadPipeline() {
  if (pipelineLoaded) return;
  pipelineLoaded = true;
  try {
    const raw = await readFile(PIPELINE_FILE, 'utf8');
    pipeline.programs = JSON.parse(raw);
    console.log(`📂 Pipeline loaded: ${pipeline.programs.length} programmes`);
  } catch {
    // First run — seed with defaults and save
    pipeline.programs = PIPELINE_DEFAULTS;
    await savePipeline();
    console.log('📂 Pipeline initialised with defaults');
  }
}

async function savePipeline() {
  await writeFile(PIPELINE_FILE, JSON.stringify(pipeline.programs, null, 2), 'utf8');
}
async function sendEmail(fromAlias, to, subject, bodyText) {
  const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
  const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
  const FROM          = fromAlias || process.env.GMAIL_USER;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) throw new Error('Gmail OAuth not configured');
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth });
  const message = [
    `From: GO-JU <${process.env.GMAIL_USER}>`,
    `Reply-To: hello@go-ju.online`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    bodyText
  ].join('\r\n');
  const encoded = Buffer.from(message).toString('base64url');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}



const GOJU_LETTER = `Subject: Drink Today. Thank Yourself Tomorrow. — GO-JU launches 17 June

Dear [Name],

The choices you make today are introducing you to the person you'll become tomorrow.

That's the idea behind GO-JU — Richmond's first 100% electric, zero-waste fresh juice brand. We blend real fruit and vegetables on the spot: no pasteurisation, no waste, nothing artificial. Every cup is a deposit into the life you're building.

We launch on Kickstarter on 17 June, and we're looking for partners who believe what we believe — that real health isn't a luxury, it's a decision made one cup at a time.

Every backer gets rewarded — from digital membership cards to exclusive Founder recognition, GO-JU T-shirts, and private event catering access.

We'd love to explore how we can work together — as a Kickstarter backer, community partner, or venue/event collaboration.

Visit go-ju.online or scan our QR code to learn more.

Drink Today. Thank Yourself Tomorrow.

G Coker
GO-JU | go-ju.online | hello@go-ju.online | @gojujuice`;

const PUBLISHER = {
  name: 'G Coker',
  title: 'Procurement Manager',
  platform: 'Snag Drops',
  url: 'snagdrops.online',
  email: 'hello@snagdrops.online',
  company: 'Kerbrise Productions',
  location: 'Richmond Upon Thames, London',
  cjPID: '7976183',
  cjPropertyID: '101767449',
  description: 'Global coupon and deals platform targeting a worldwide audience across Gaming, Fashion, Beauty, Tech, Entertainment, Lifestyle, Finance and Travel. We are an approved CJ Affiliate publisher (PID 7976183) currently promoting NordVPN and GearUP. Promotion methods: deals app, landing page, email list, TikTok, Instagram and YouTube.'
};

async function handleAPI(req, res, body) {
  await loadPipeline();
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === '/api/pipeline' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pipeline.programs));
    return;
  }

  if (path === '/api/pipeline/update' && req.method === 'POST') {
    const { id, status, notes, trackingLink } = JSON.parse(body);
    const prog = pipeline.programs.find(p => p.id === id);
    if (prog) {
      if (status) prog.status = status;
      if (notes) prog.notes = notes;
      if (trackingLink) prog.trackingLink = trackingLink;
      await savePipeline();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (path === '/api/pipeline/add' && req.method === 'POST') {
    const data = JSON.parse(body);
    // Deduplicate — match by brand name (case-insensitive) or URL
    const already = pipeline.programs.find(p =>
      p.brand?.toLowerCase() === data.brand?.toLowerCase() ||
      (data.url && p.url && p.url.toLowerCase() === data.url.toLowerCase())
    );
    if (already) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, duplicate: true, program: already }));
      return;
    }
    const newProg = { id: Date.now(), ...data, status: data.status || 'pending' };
    pipeline.programs.push(newProg);
    await savePipeline();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, duplicate: false, program: newProg }));
    return;
  }

  if (path === '/api/draft-email' && req.method === 'POST') {
    const { brand, programUrl, network, commission } = JSON.parse(body);
    const prompt = `Write a professional affiliate program application email on behalf of Snag Drops.

Publisher details:
- Name: ${PUBLISHER.name}, ${PUBLISHER.title}
- Platform: ${PUBLISHER.platform} (${PUBLISHER.url})
- Email: ${PUBLISHER.email}
- Company: ${PUBLISHER.company}, ${PUBLISHER.location}
- CJ Affiliate PID: ${PUBLISHER.cjPID}
- Platform description: ${PUBLISHER.description}

Apply to: ${brand} affiliate program (${programUrl})
Network: ${network}
Commission: ${commission}

Instructions:
- Subject line: "Affiliate Partner Application — Snag Drops"
- Professional but direct tone
- Highlight global reach and deal-hunter audience
- Mention existing CJ publisher status as credibility
- Request any available exclusive promo codes for our audience
- Keep it under 200 words
- Sign off: "G Coker\nProcurement Manager\nSnag Drops | snagdrops.online | hello@snagdrops.online"
- Return JSON: { "subject": "...", "body": "..." }`;

    try {
      const resp = await openai.responses.create({
        model: MODEL,
        input: prompt,
        text: { format: { type: 'json_object' } }
      });
      const email = JSON.parse(resp.output_text);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(email));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── AI-only discover (fast, no web search) ──
  if (path === '/api/discover' && req.method === 'POST') {
    const { category, query } = JSON.parse(body);
    const prompt = `You are an affiliate marketing researcher for Snag Drops (${PUBLISHER.url}), a global coupon and deals platform.

Find the top 8 affiliate programs for the "${category}" category matching this query: "${query}"

For each program return:
- brand: company name
- url: affiliate signup page
- network: CJ / Impact / AWIN / ShareASale / Direct / Rakuten
- category: ${category}
- commission: estimated CPA or revenue share %
- cookie: cookie duration in days
- why: one sentence on why it suits Snag Drops
- priority: high / medium / low

Return JSON: { "results": [...] }

Focus on: high CPA (£30+ or 10%+ rev share), global availability, 30+ day cookies, brands recognisable to UK/US audiences.`;

    try {
      const resp = await openai.responses.create({
        model: MODEL,
        input: prompt,
        text: { format: { type: 'json_object' } }
      });
      const raw = JSON.parse(resp.output_text);
      const results = Array.isArray(raw) ? raw : raw.results || raw.programs || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── LIVE web search discover ──
  if (path === '/api/discover-live' && req.method === 'POST') {
    const { category, query, independentOnly } = JSON.parse(body);

    const searchFocus = independentOnly
      ? `Focus ONLY on brands that run their OWN in-house affiliate program (no CJ, ShareASale, AWIN, Impact, Rakuten, or other networks). The affiliate page must be on the brand's own domain.`
      : `Include both direct/in-house programs AND well-known network programs (CJ, Impact, AWIN etc).`;

    const prompt = `You are a live affiliate program researcher for Snag Drops (snagdrops.online), a global coupon and deals platform.

Use web search to find REAL, CURRENTLY ACTIVE affiliate programs in the "${category}" category.
Search query focus: "${query || category + ' affiliate program'}"

${searchFocus}

For each program you find:
1. Search for "[brand] affiliate program" 
2. Verify the affiliate page actually exists
3. Extract the real commission rate, cookie duration, and signup URL

Return exactly 8 results as JSON: { "results": [
  {
    "brand": "Company Name",
    "url": "exact affiliate signup URL",
    "network": "Direct / CJ / Impact / AWIN / ShareASale / Rakuten",
    "category": "${category}",
    "commission": "real commission e.g. 10% or $50 CPA",
    "cookie": "e.g. 30 days",
    "why": "one sentence on fit for SnagDrops deal-hunter audience",
    "priority": "high / medium / low",
    "verified": true
  }
]}

Prioritise: high commissions (10%+ or £30+ CPA), 30+ day cookies, global programs, brands UK/US audiences recognise.
Only include programs you have actually verified exist right now via search.`;

    try {
      // Step 1: web search (no json_object — incompatible with tools)
      const searchResp = await openai.responses.create({
        model: MODEL,
        tools: [{ type: 'web_search_preview' }],
        input: prompt
      });
      const searchText = searchResp.output_text || '';

      // Step 2: structure results as JSON
      const structureResp = await openai.responses.create({
        model: MODEL,
        input: `Convert this affiliate program research into a JSON object with a "results" array.
Each item must have: brand, url, network, category, commission, cookie, why, priority, verified.
Research:\n${searchText}\n\nReturn only valid JSON: { "results": [...] }`,
        text: { format: { type: 'json_object' } }
      });
      const raw = JSON.parse(structureResp.output_text);
      const results = Array.isArray(raw) ? raw : raw.results || raw.programs || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
    } catch (err) {
      // Fallback: web_search_preview not available, use regular discover
      console.error('Live search error, falling back:', err.message);
      try {
        const fallbackPrompt = `Find 8 real affiliate programs for "${category}" (query: "${query}"). ${searchFocus}
Return JSON: { "results": [{ brand, url, network, category: "${category}", commission, cookie, why, priority, verified: false }] }`;
        const fb = await openai.responses.create({
          model: MODEL,
          input: fallbackPrompt,
          text: { format: { type: 'json_object' } }
        });
        const raw = JSON.parse(fb.output_text);
        const results = Array.isArray(raw) ? raw : raw.results || raw.programs || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      } catch (fb_err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: fb_err.message }));
      }
    }
    return;
  }

  // ── Gmail inbox watcher ──
  if (path === '/api/check-inbox' && req.method === 'POST') {
    const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
    const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
    const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Run node setup-gmail-auth.js first to set up Gmail API access.' }));
      return;
    }

    const APPROVAL_WORDS = ['approved', 'welcome', 'congratulations', 'accepted', 'activated', 'access granted', 'publisher approved', 'application approved'];
    const REJECTION_WORDS = ['declined', 'rejected', 'unfortunately', 'not approved', 'does not meet', 'unable to approve', 'not accepted'];
    const PENDING_WORDS = ['received', 'under review', 'reviewing', 'pending', 'processing', 'looking into'];

    const affiliateDomains = pipeline.programs
      .filter(p => p.url)
      .map(p => p.url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, ''));

    try {
      const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
      auth.setCredentials({ refresh_token: REFRESH_TOKEN });
      const gmail = google.gmail({ version: 'v1', auth });

      // Search for affiliate-related emails in last 30 days
      const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      const q = `after:${since} (affiliate OR partner OR commission OR publisher OR "application approved" OR "application received")`;

      const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 50 });
      const messages = listRes.data.messages || [];

      const updates = [];

      for (const msg of messages) {
        const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
        const headers = detail.data.payload?.headers || [];
        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        const fromDomain = from.match(/@([\w.-]+)/)?.[1]?.toLowerCase() || '';

        const isAffiliate = affiliateDomains.some(d => fromDomain.includes(d)) ||
          ['affiliate', 'partner', 'commission', 'publisher', 'cj.com', 'impact.com', 'awin'].some(k =>
            from.toLowerCase().includes(k) || subject.toLowerCase().includes(k));

        if (!isAffiliate) continue;

        const fullText = (subject + ' ' + (detail.data.snippet || '')).toLowerCase();

        let detectedStatus = null;
        if (APPROVAL_WORDS.some(w => fullText.includes(w))) detectedStatus = 'approved';
        else if (REJECTION_WORDS.some(w => fullText.includes(w))) detectedStatus = 'rejected';
        else if (PENDING_WORDS.some(w => fullText.includes(w))) detectedStatus = 'applied';

        if (detectedStatus) {
          const matched = pipeline.programs.find(p => {
            const bl = p.brand.toLowerCase();
            return fromDomain.includes(bl) || fullText.includes(bl) || subject.toLowerCase().includes(bl);
          });
          updates.push({ from, subject, detectedStatus, matchedBrand: matched?.brand || null, matchedId: matched?.id || null, date });
          if (matched && matched.status !== 'active') {
            matched.status = detectedStatus;
            matched.notes = `Auto-updated from email: "${subject}"`;
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, updates, scanned: true, total: messages.length, timestamp: new Date().toISOString() }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Delete a single program ──
  if (path === '/api/pipeline/delete' && req.method === 'POST') {
    const { id } = JSON.parse(body);
    pipeline.programs = pipeline.programs.filter(p => p.id !== id);
    await savePipeline();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Clean up duplicates and inactive/expired ──
  if (path === '/api/pipeline/cleanup' && req.method === 'POST') {
    const before = pipeline.programs.length;
    // Remove duplicates — keep first occurrence by brand name (case-insensitive)
    const seen = new Set();
    pipeline.programs = pipeline.programs.filter(p => {
      const key = p.brand.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Remove inactive/expired
    pipeline.programs = pipeline.programs.filter(p => p.status !== 'inactive' && p.status !== 'expired');
    const removed = before - pipeline.programs.length;
    await savePipeline();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, removed, remaining: pipeline.programs.length }));
    return;
  }

  // ── Bulk apply all pending email programs ──
  if (path === '/api/apply-all-pending' && req.method === 'POST') {
    const emailPrograms = pipeline.programs.filter(p => p.status === 'pending' && p.notes?.toLowerCase().includes('email'));
    const results = [];
    for (const prog of emailPrograms) {
      try {
        const prompt = `Write a professional affiliate program application email on behalf of Snag Drops.

Publisher details:
- Name: ${PUBLISHER.name}, ${PUBLISHER.title}
- Platform: ${PUBLISHER.platform} (${PUBLISHER.url})
- Email: ${PUBLISHER.email}
- Company: ${PUBLISHER.company}, ${PUBLISHER.location}
- CJ Affiliate PID: ${PUBLISHER.cjPID}
- Platform description: ${PUBLISHER.description}

Apply to: ${prog.brand} affiliate program (${prog.url})
Network: ${prog.network}
Commission: ${prog.commission}

Instructions:
- Subject line: "Affiliate Partner Application — Snag Drops"
- Professional but direct tone
- Highlight global reach and deal-hunter audience
- Mention existing CJ publisher status as credibility
- Request affiliate tracking link and any promo codes
- Keep it under 200 words
- Sign off: "G Coker\\nProcurement Manager\\nSnag Drops | snagdrops.online | hello@snagdrops.online"
- Return JSON: { "subject": "...", "body": "..." }`;

        const resp = await openai.responses.create({
          model: MODEL,
          input: prompt,
          text: { format: { type: 'json_object' } }
        });
        const email = JSON.parse(resp.output_text);
        // Mark as applied
        prog.status = 'applied';
        prog.notes = `Auto-applied ${new Date().toLocaleDateString()}`;
        results.push({ id: prog.id, brand: prog.brand, subject: email.subject, body: email.body, status: 'drafted' });
      } catch (err) {
        results.push({ id: prog.id, brand: prog.brand, status: 'error', error: err.message });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, results, total: results.length }));
    return;
  }

  if (path === '/api/publisher' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(PUBLISHER));
    return;
  }

  if (path === '/api/goju-letter' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ letter: GOJU_LETTER }));
    return;
  }

  // ── CJ Catalogue — REST API (joined) ──────────────────────────────────────
  if (path === '/api/cj-catalogue' && req.method === 'GET') {
    const CJ_TOKEN = process.env.CJ_API_TOKEN;
    const CJ_CID   = process.env.CJ_COMPANY_ID;
    if (!CJ_TOKEN || !CJ_CID) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CJ_API_TOKEN or CJ_COMPANY_ID not set in .env' }));
      return;
    }
    const urlParams   = new URL('http://x' + req.url).searchParams;
    const keyword     = (urlParams.get('keyword') || '').trim();
    const page        = parseInt(urlParams.get('page') || '1', 10);
    const perPage     = 20;
    const params      = new URLSearchParams({
      'requestor-cid':   CJ_CID,
      'advertiser-ids':  'joined',
      'page-number':     page,
      'records-per-page': perPage
    });
    if (keyword) params.set('keywords', keyword);
    try {
      const fetchFn = (await import('node-fetch')).default;
      const cjRes   = await fetchFn(`https://advertiser-lookup.api.cj.com/v2/advertiser-lookup?${params}`, {
        headers: { 'Authorization': `Bearer ${CJ_TOKEN}` }
      });
      const rawText = await cjRes.text();
      if (!cjRes.ok && rawText.length < 50) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `CJ API HTTP ${cjRes.status}: ${rawText}` }));
        return;
      }
      // CJ returns XML — parse with regex (no external parser needed)
      if (rawText.includes('<error>') || rawText.includes('<message>')) {
        const msg = (rawText.match(/<message>(.*?)<\/message>/) || [])[1] || rawText.substring(0,200);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
        return;
      }
      const totalMatch  = rawText.match(/total-matched="(\d+)"/);
      const total       = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      // Extract each <advertiser> block
      const advBlocks   = [...rawText.matchAll(/<advertiser([^>]*)>(.*?)<\/advertiser>/gs)];
      const list        = advBlocks.map(m => {
        const attrs = m[1] + m[2]; // attributes + inner XML
        const get   = (tag) => { const r = attrs.match(new RegExp(`${tag}="([^"]*)"`) ); return r ? r[1] : null; };
        const getEl = (tag) => { const r = attrs.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's')); return r ? r[1].trim() : null; };
        return {
          id:          get('id')              || getEl('advertiser-id') || '—',
          brand:       getEl('advertiser-name')|| get('advertiser-name')|| '—',
          url:         getEl('advertiser-url') || get('advertiser-url') || '',
          category:    getEl('primary-category')|| get('primary-category')|| '—',
          commission:  getEl('network-rank')   ? `Rank ${getEl('network-rank')}` : 'See program',
          cookie:      getEl('cookie-days')    ? `${getEl('cookie-days')} days` : '—',
          status:      'joined',
          epc7day:     getEl('seven-day-epc')  ? `$${Number(getEl('seven-day-epc')).toFixed(2)}`   : '—',
          epc3mo:      getEl('three-month-epc')? `$${Number(getEl('three-month-epc')).toFixed(2)}` : '—',
          networkRank: getEl('network-rank')   || '—',
          network:     'CJ Affiliate'
        };
      });
      const results = list.filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, results, total, page, perPage }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── CJ Available — REST API (not joined) ────────────────────────────────────
  if (path === '/api/cj-available' && req.method === 'GET') {
    const CJ_TOKEN = process.env.CJ_API_TOKEN;
    const CJ_CID   = process.env.CJ_COMPANY_ID;
    if (!CJ_TOKEN || !CJ_CID) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CJ credentials not set' }));
      return;
    }
    const urlParams   = new URL('http://x' + req.url).searchParams;
    const keyword     = (urlParams.get('keyword') || '').trim();
    const page        = parseInt(urlParams.get('page') || '1', 10);
    const perPage     = 20;
    const params      = new URLSearchParams({
      'requestor-cid':   CJ_CID,
      'advertiser-ids':  'notjoined',
      'page-number':     page,
      'records-per-page': perPage
    });
    if (keyword) params.set('keywords', keyword);
    try {
      const fetchFn = (await import('node-fetch')).default;
      const cjRes   = await fetchFn(`https://advertiser-lookup.api.cj.com/v2/advertiser-lookup?${params}`, {
        headers: { 'Authorization': `Bearer ${CJ_TOKEN}` }
      });
      const rawText = await cjRes.text();
      if (!cjRes.ok && rawText.length < 50) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `CJ API HTTP ${cjRes.status}: ${rawText}` }));
        return;
      }
      if (rawText.includes('<error>') || rawText.includes('<message>')) {
        const msg = (rawText.match(/<message>(.*?)<\/message>/) || [])[1] || rawText.substring(0,200);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
        return;
      }
      const totalMatch  = rawText.match(/total-matched="(\d+)"/);
      const total       = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      const advBlocks   = [...rawText.matchAll(/<advertiser([^>]*)>(.*?)<\/advertiser>/gs)];
      const list        = advBlocks.map(m => {
        const attrs = m[1] + m[2];
        const get   = (tag) => { const r = attrs.match(new RegExp(`${tag}="([^"]*)"`) ); return r ? r[1] : null; };
        const getEl = (tag) => { const r = attrs.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's')); return r ? r[1].trim() : null; };
        return {
          id:          get('id')              || getEl('advertiser-id') || '—',
          brand:       getEl('advertiser-name')|| get('advertiser-name')|| '—',
          url:         getEl('advertiser-url') || get('advertiser-url') || '',
          category:    getEl('primary-category')|| get('primary-category')|| '—',
          commission:  getEl('network-rank')   ? `Rank ${getEl('network-rank')}` : 'See program',
          cookie:      getEl('cookie-days')    ? `${getEl('cookie-days')} days` : '—',
          status:      'not_joined',
          epc7day:     getEl('seven-day-epc')  ? `$${Number(getEl('seven-day-epc')).toFixed(2)}`   : '—',
          epc3mo:      getEl('three-month-epc')? `$${Number(getEl('three-month-epc')).toFixed(2)}` : '—',
          networkRank: getEl('network-rank')   || '—',
          network:     'CJ Affiliate'
        };
      });
      const results = list.filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, results, total, page, perPage }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }



  // ── Generate all email drafts (preview only, no send) ───────────────────────
  if (path === '/api/generate-all-drafts' && req.method === 'POST') {
    const emailPrograms = pipeline.programs.filter(p =>
      p.status === 'pending' && p.notes?.toLowerCase().includes('email')
    );
    if (!emailPrograms.length) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, results: [], total: 0 }));
      return;
    }
    const results = [];
    for (const prog of emailPrograms) {
      try {
        const prompt = `Write a professional affiliate program application email on behalf of Snag Drops.
Publisher: ${PUBLISHER.name}, ${PUBLISHER.title} | ${PUBLISHER.platform} (${PUBLISHER.url}) | ${PUBLISHER.email} | CJ PID: ${PUBLISHER.cjPID}
Apply to: ${prog.brand} (${prog.url}), Network: ${prog.network}, Commission: ${prog.commission}
Instructions: Subject "Affiliate Partner Application — Snag Drops". Professional, under 200 words. Sign off: "G Coker\nProcurement Manager\nSnag Drops | snagdrops.online | hello@snagdrops.online"
Return JSON: { "subject": "...", "body": "..." }`;
        const resp = await openai.responses.create({ model: MODEL, input: prompt, text: { format: { type: 'json_object' } } });
        const email = JSON.parse(resp.output_text);
        results.push({ id: prog.id, brand: prog.brand, url: prog.url, network: prog.network, commission: prog.commission, subject: email.subject, body: email.body, status: 'ready' });
      } catch (err) {
        results.push({ id: prog.id, brand: prog.brand, status: 'error', error: err.message });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, results, total: results.length }));
    return;
  }

  // ── Send single email via Gmail API ────────────────────────────────────────
  if (path === '/api/send-email' && req.method === 'POST') {
    const { to, subject, body, programId } = JSON.parse(body);
    const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
    const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
    const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
    const FROM          = process.env.GMAIL_USER;
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gmail OAuth not configured. Run setup-gmail-auth.js first.' }));
      return;
    }
    try {
      const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
      auth.setCredentials({ refresh_token: REFRESH_TOKEN });
      const gmail = google.gmail({ version: 'v1', auth });
      // Build RFC 2822 message
      const toAddr = to || 'affiliate@' + (programId || 'unknown') + '.com';
      const message = [
        `From: ${FROM}`,
        `To: ${toAddr}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        body
      ].join('\r\n');
      const encoded = Buffer.from(message).toString('base64url');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
      // Mark program as applied
      if (programId) {
        const prog = pipeline.programs.find(p => p.id === programId);
        if (prog) {
          prog.status = 'applied';
          prog.notes = `Sent ${new Date().toLocaleDateString()}`;
          await savePipeline();
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Send all pending email programs ─────────────────────────────────────────
  if (path === '/api/send-all-pending' && req.method === 'POST') {
    const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
    const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
    const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
    const FROM          = process.env.GMAIL_USER;
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gmail OAuth not configured.' }));
      return;
    }
    const emailPrograms = pipeline.programs.filter(p =>
      p.status === 'pending' && p.notes?.toLowerCase().includes('email')
    );
    const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    auth.setCredentials({ refresh_token: REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth });
    const results = [];
    for (const prog of emailPrograms) {
      try {
        // Generate draft via OpenAI
        const prompt = `Write a professional affiliate program application email on behalf of Snag Drops.
Publisher: ${PUBLISHER.name}, ${PUBLISHER.title} | ${PUBLISHER.platform} (${PUBLISHER.url}) | ${PUBLISHER.email}
CJ PID: ${PUBLISHER.cjPID}
Apply to: ${prog.brand} (${prog.url}), Network: ${prog.network}, Commission: ${prog.commission}
Instructions: Subject "Affiliate Partner Application — Snag Drops". Professional, under 200 words. Sign off: "G Coker\nProcurement Manager\nSnag Drops | snagdrops.online | hello@snagdrops.online"
Return JSON: { "subject": "...", "body": "...", "to": "affiliate contact email if known, else empty string" }`;
        const resp = await openai.responses.create({ model: MODEL, input: prompt, text: { format: { type: 'json_object' } } });
        const email = JSON.parse(resp.output_text);
        const toAddr = email.to || `hello@${prog.url.replace(/^https?:\/\//, '').split('/')[0]}`;
        const message = [
          `From: ${FROM}`,
          `To: ${toAddr}`,
          `Subject: ${email.subject}`,
          'Content-Type: text/plain; charset=UTF-8',
          '',
          email.body
        ].join('\r\n');
        const encoded = Buffer.from(message).toString('base64url');
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
        prog.status = 'applied';
        prog.notes = `Sent ${new Date().toLocaleDateString()}`;
        results.push({ brand: prog.brand, to: toAddr, status: 'sent' });
      } catch (err) {
        results.push({ brand: prog.brand, status: 'error', error: err.message });
      }
    }
    await savePipeline();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, results, sent: results.filter(r => r.status === 'sent').length, errors: results.filter(r => r.status === 'error').length }));
    return;
  }


  // ── CJ Debug — see raw XML from CJ ────────────────────────────────────────
  if (path === '/api/cj-debug' && req.method === 'GET') {
    const CJ_TOKEN = process.env.CJ_API_TOKEN;
    const CJ_CID   = process.env.CJ_COMPANY_ID;
    const urlParams = new URL('http://x' + req.url).searchParams;
    const mode = urlParams.get('mode') || 'joined';
    const params = new URLSearchParams({
      'requestor-cid': CJ_CID,
      'advertiser-ids': mode,
      'page-number': '1',
      'records-per-page': '5'
    });
    const fetchFn = (await import('node-fetch')).default;
    const cjRes   = await fetchFn(`https://advertiser-lookup.api.cj.com/v2/advertiser-lookup?${params}`, {
      headers: { 'Authorization': `Bearer ${CJ_TOKEN}` }
    });
    const rawText = await cjRes.text();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`HTTP ${cjRes.status}\n\n${rawText}`);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

// ── Deals Auto-Discovery Engine ───────────────────────────────────────────
const DEALS_FILE = join(__dirname, 'deals.json');

const DEALS_SEED = [
  { id:1, brand:'ASOS', category:'fashion', title:'20% OFF YOUR NEXT ORDER', code:'SNAG20', description:'20% off sitewide at ASOS. New customers.', expires: null, daysLeft:17, hot:true, region:'UK', storeUrl:'https://asos.com', affiliate:'https://www.awin1.com/cread.php?awinmid=1395' },
  { id:2, brand:'PlayStation Store', category:'gaming', title:'£10 OFF WHEN YOU SPEND £50', code:'PS10DROP', description:'£10 off your PS Store basket when you spend £50+.', expires:null, daysLeft:2, hot:true, region:'UK', storeUrl:'https://store.playstation.com', affiliate:'https://store.playstation.com' },
  { id:3, brand:'Charlotte Tilbury', category:'beauty', title:'15% OFF FIRST ORDER', code:'CTSNAG15', description:'15% off your first Charlotte Tilbury order.', expires:null, daysLeft:18, hot:false, region:'Global', storeUrl:'https://charlottetilbury.com', affiliate:'https://charlottetilbury.com' },
  { id:4, brand:'NordVPN', category:'tech', title:'UP TO 74% OFF + 3 MONTHS FREE', code:'', description:'Best VPN on the planet. Auto-applied at checkout.', expires:null, daysLeft:99, hot:true, region:'Global', storeUrl:'https://nordvpn.com', affiliate:'https://www.tkqlhce.com/click-101767449-12814518' },
  { id:5, brand:'Steam', category:'gaming', title:'SUMMER SALE UP TO 75% OFF', code:'STEAMDROP', description:'Steam Summer Sale — massive discounts across thousands of games.', expires:null, daysLeft:6, hot:true, region:'Global', storeUrl:'https://store.steampowered.com', affiliate:'https://store.steampowered.com' },
  { id:6, brand:'Cult Beauty', category:'beauty', title:'25% OFF SKINCARE', code:'CULT25', description:'25% off selected skincare brands at Cult Beauty.', expires:null, daysLeft:5, hot:false, region:'UK', storeUrl:'https://cultbeauty.co.uk', affiliate:'https://cultbeauty.co.uk' }
];

async function loadDeals() {
  try {
    const raw = await readFile(DEALS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    await writeFile(DEALS_FILE, JSON.stringify(DEALS_SEED, null, 2), 'utf8');
    return DEALS_SEED;
  }
}

async function saveDeals(deals) {
  await writeFile(DEALS_FILE, JSON.stringify(deals, null, 2), 'utf8');
}

async function refreshDeals() {
  console.log('\n🛍  DEALS REFRESH: Discovering fresh deals...');
  const categories = ['gaming', 'fashion', 'beauty', 'tech', 'entertainment', 'lifestyle', 'finance'];
  const existing = await loadDeals();
  const newDeals = [...existing];
  let nextId = Math.max(...existing.map(d => d.id), 0) + 1;

  for (const cat of categories.slice(0, 3)) { // 3 categories per refresh to save API calls
    try {
      const prompt = `Find 2 REAL active coupon codes or deals available RIGHT NOW in the "${cat}" category for UK/Global shoppers.
For each deal return: brand name, deal title (e.g. "20% OFF"), promo code (if there is one), brief description, store URL, and how many days until it expires (estimate).
Return JSON: { "deals": [ { "brand":"", "title":"", "code":"", "description":"", "storeUrl":"", "daysLeft": 14 } ] }
Focus on well-known brands with verified working codes. Search the web to confirm the deals are real.`;

      const resp = await openai.responses.create({
        model: MODEL,
        tools: [{ type: 'web_search_preview' }],
        input: prompt
      });

      const structResp = await openai.responses.create({
        model: MODEL,
        input: `Extract deals JSON from this text. Return only: { "deals": [ { "brand":"", "title":"", "code":"", "description":"", "storeUrl":"", "daysLeft": 14 } ] }\n\n${resp.output_text}`,
        text: { format: { type: 'json_object' } }
      });

      const parsed = JSON.parse(structResp.output_text);
      for (const d of (parsed.deals || [])) {
        if (!d.brand || !d.title) continue;
        // Check not duplicate
        if (newDeals.some(ex => ex.brand.toLowerCase() === d.brand.toLowerCase() && ex.title === d.title)) continue;
        newDeals.push({
          id: nextId++,
          brand: d.brand,
          category: cat,
          title: d.title.toUpperCase(),
          code: d.code || '',
          description: d.description || '',
          daysLeft: d.daysLeft || 14,
          hot: d.daysLeft <= 3,
          region: 'Global',
          storeUrl: d.storeUrl || '',
          affiliate: d.storeUrl || '',
          addedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.log(`⚠️  DEALS REFRESH: ${cat} error — ${e.message}`);
    }
  }

  // Keep max 30 deals, remove expired
  const active = newDeals.filter(d => (d.daysLeft || 1) > 0).slice(-30);
  await saveDeals(active);
  console.log(`✅ DEALS REFRESH: ${active.length} deals saved`);
  return active;
}

function scheduleDealsRefresh() {
  // Refresh at 8AM GMT daily
  const msUntil8am = (() => {
    const now = new Date();
    const t = new Date();
    t.setUTCHours(8, 0, 0, 0);
    const diff = t - now;
    return diff > 0 ? diff : diff + 86400000; // next day if passed
  })();
  const hrs = Math.round(msUntil8am / 3600000);
  console.log(`⏰ DEALS REFRESH: Next run in ~${hrs}h (8AM GMT daily)`);
  setTimeout(async () => {
    await refreshDeals();
    setInterval(refreshDeals, 24 * 60 * 60 * 1000); // then every 24h
  }, msUntil8am);
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => handleAPI(req, res, body).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }));
    return;
  }







  // ── Public Deals Feed (CORS enabled — for snagdrops.online) ──────────────
  if (path === '/api/public-deals' && req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    try {
      const deals = await loadDeals();
      const active = deals.filter(d => (d.daysLeft || 1) > 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deals: active, refreshed: new Date().toISOString() }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (path === '/api/refresh-deals' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Refresh started in background' }));
    refreshDeals().catch(console.error);
    return;
  }

  // ── GO-JU Outreach ────────────────────────────────────────────────────────
  if (path === '/api/goju-contacts' && req.method === 'GET') {
    try {
      const raw = await readFile(join(__dirname, 'goju-contacts.json'), 'utf8');
      const contacts = JSON.parse(raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, contacts }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not load contacts: ' + err.message }));
    }
    return;
  }

  if (path === '/api/goju-send' && req.method === 'POST') {
    const body = await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(JSON.parse(d||'{}')));});
    const { email, business, group } = body;
    if (!email) { res.writeHead(400); res.end(JSON.stringify({ error: 'email required' })); return; }

    const subject = 'Drink Today. Thank Yourself Tomorrow. — GO-JU launches 17 June';
    const body_text = GOJU_LETTER.replace('Dear [Name],', `Dear ${business || 'there'},`).replace(/^Subject:.*\n\n/, '');

    try {
      await sendEmail('hello@go-ju.online', email, subject, body_text);
      const raw = await readFile(join(__dirname, 'goju-contacts.json'), 'utf8');
      const contacts = JSON.parse(raw);
      const idx = contacts.findIndex(c => c.email === email);
      if (idx >= 0) {
        contacts[idx].status = 'sent';
        contacts[idx].sentAt = new Date().toISOString();
        await writeFile(join(__dirname, 'goju-contacts.json'), JSON.stringify(contacts, null, 2), 'utf8');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, email }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (path === '/api/goju-send-all' && req.method === 'POST') {
    const raw = await readFile(join(__dirname, 'goju-contacts.json'), 'utf8');
    const contacts = JSON.parse(raw);
    const pending = contacts.filter(c => c.status === 'pending');
    const results = [];
    for (const c of pending) {
      const subject = 'Drink Today. Thank Yourself Tomorrow. — GO-JU launches 17 June';
      const body_text = GOJU_LETTER.replace('Dear [Name],', `Dear ${c.business},`).replace(/^Subject:.*\n\n/, '');
      try {
        await sendEmail('hello@go-ju.online', c.email, subject, body_text);
        c.status = 'sent';
        c.sentAt = new Date().toISOString();
        results.push({ email: c.email, business: c.business, ok: true });
      } catch (err) {
        c.status = 'error';
        results.push({ email: c.email, business: c.business, ok: false, error: err.message });
      }
    }
    await writeFile(join(__dirname, 'goju-contacts.json'), JSON.stringify(contacts, null, 2), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sent: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length, results }));
    return;
  }

  if (path === '/api/goju-reset' && req.method === 'POST') {
    const raw = await readFile(join(__dirname, 'goju-contacts.json'), 'utf8');
    const contacts = JSON.parse(raw);
    contacts.forEach(c => { c.status = 'pending'; delete c.sentAt; });
    await writeFile(join(__dirname, 'goju-contacts.json'), JSON.stringify(contacts, null, 2), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }


  if (path === '/api/goju-validate' && req.method === 'POST') {
    const raw = await readFile(join(__dirname, 'goju-contacts.json'), 'utf8');
    const contacts = JSON.parse(raw);
    const domainCache = {};
    let checked = 0, good = 0, bad = 0;

    async function checkMX(domain) {
      if (domainCache[domain] !== undefined) return domainCache[domain];
      try {
        const records = await dnsPromises.resolveMx(domain);
        domainCache[domain] = records.length > 0 ? 'ok' : 'no_mx';
      } catch (e) {
        if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
          domainCache[domain] = 'dead';
        } else {
          // Try A record fallback
          try { await dnsPromises.resolve4(domain); domainCache[domain] = 'ok_a'; }
          catch { domainCache[domain] = 'dead'; }
        }
      }
      return domainCache[domain];
    }

    for (const c of contacts) {
      const domain = c.email.split('@')[1];
      const result = await checkMX(domain);
      checked++;
      if (result === 'dead') {
        c.validation = 'bad';
        c.validationNote = 'Domain has no MX record / does not exist';
        bad++;
      } else {
        c.validation = 'ok';
        c.validationNote = result === 'ok' ? 'MX verified' : 'A-record fallback';
        good++;
      }
    }
    await writeFile(join(__dirname, 'goju-contacts.json'), JSON.stringify(contacts, null, 2), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, checked, good, bad, dead: contacts.filter(c=>c.validation==='bad').map(c=>({business:c.business,email:c.email})) }));
    return;
  }

  try {
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = join(__dirname, filePath);
    const ext = filePath.split('.').pop();
    const mime = { html: 'text/html', css: 'text/css', js: 'application/javascript' }[ext] || 'text/plain';
    const data = await readFile(full);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});


// ── X OAuth Helper ────────────────────────────────────────────────────────
function xOAuthHeader(method, url, apiKey, apiSecret, accessToken, accessSecret) {
  const p = {
    oauth_consumer_key: apiKey, oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now()/1000).toString(),
    oauth_token: accessToken, oauth_version: '1.0',
  };
  const paramStr = Object.keys(p).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`).join('&');
  const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
  const sigKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
  p.oauth_signature = crypto.createHmac('sha1', sigKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(p).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(p[k])}"`).join(', ');
}

// ── Scheduled Social Media Posts ──────────────────────────────────────────
const GOJU_POSTS = [
  `🌿 GO-JU launches 17 June on Kickstarter. Richmond's first 100% electric, zero-waste fresh juice brand. Real fruit. Zero waste. One decision at a time. Drink today. Thank yourself tomorrow. 🧃⚡ go-ju.online #GOJU #FreshJuice #Richmond #Kickstarter #ZeroWaste #DrinkHealthy`,
  `⚡ Every cup is a deposit into the life you're building. GO-JU — cold-pressed, zero-waste, 100% electric. Launching 17 June on Kickstarter. Back us and get exclusive Founder rewards. 🧃 go-ju.online #GOJU #Kickstarter #Richmond #FreshJuice #HealthyLiving #FeedTomorrow`,
  `🧃 Richmond's freshest secret drops 17 June. GO-JU brings you real juice, real values, zero compromise. No pasteurisation. No waste. Nothing artificial. Support our Kickstarter. go-ju.online #GOJU #ZeroWaste #Richmond #Kickstarter #ColdPressed #DrinkToday`,
];
let goJUPostIndex = 0;

function msUntil(hour) {
  const now = new Date();
  // Use UTC (GMT) for scheduling
  const target = new Date();
  target.setUTCHours(hour, 0, 0, 0);
  const diff = target - now;
  return diff > 0 ? diff : -1;
}

async function runGoJUPost(label) {
  const text = GOJU_POSTS[goJUPostIndex % GOJU_POSTS.length];
  goJUPostIndex++;
  console.log(`\n📅 GO-JU SCHEDULER: ${label} — posting to X`);
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || X_API_KEY.includes('your_')) {
    console.log('❌ X credentials not set in .env'); return;
  }
  try {
    const url = 'https://api.x.com/2/tweets';
    const auth = xOAuthHeader('POST', url, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET);
    const r = await fetch(url, {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 280) })
    });
    const data = await r.json();
    if (r.ok) console.log(`✅ GO-JU SCHEDULER: Posted to X — ${data.data?.id}`);
    else console.log(`❌ GO-JU SCHEDULER: X error — ${JSON.stringify(data)}`);
  } catch (err) { console.log(`❌ GO-JU SCHEDULER: ${err.message}`); }
}

function setupGoJUSchedule() {
  const slots = [{ hour: 15, label: '3PM' }, { hour: 18, label: '6PM' }];
  let idx = 0;
  for (const { hour, label } of slots) {
    const ms = msUntil(hour);
    if (ms < 0) {
      console.log(`⏰ GO-JU SCHEDULER: ${label} already passed — skipping`);
    } else {
      const mins = Math.round(ms / 60000);
      console.log(`⏰ GO-JU SCHEDULER: ${label} post in ${mins} min`);
      const capturedIdx = idx;
      setTimeout(() => { goJUPostIndex = capturedIdx; runGoJUPost(label); }, ms);
      idx++;
    }
  }
}

server.listen(PORT, () => {
  console.log(`\n🎯 SnagDrops Affiliate Bot running → http://localhost:${PORT}\n`);
  setupGoJUSchedule();
  scheduleDealsRefresh();
  loadDeals().catch(console.error); // pre-warm cache
  console.log(`   AI search:   /api/discover`);
  console.log(`   Live search: /api/discover-live`);
  console.log(`   CJ Catalogue:/api/cj-catalogue`);
  console.log(`   CJ Available:/api/cj-available\n`);
});
