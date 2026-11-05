/**
 * Vision AI service for receipt scanning and structured extraction.
 *
 * Supports:
 * 1. Google Gemini Vision API (GEMINI_API_KEY, e.g. gemini-1.5-flash / gemini-2.0-flash)
 * 2. OpenAI-compatible Vision API (OPENAI_API_KEY / VISION_API_KEY, e.g. gpt-4o-mini / gpt-4o)
 *
 * If no key is set, returns a clear, actionable configuration error.
 */

const RECEIPT_EXTRACTION_PROMPT = `
You are an expert financial document and receipt parsing engine for a student expense tracking app.
Analyze the provided receipt, invoice, bill, or payment slip image and extract the following structured data as pure JSON:

{
  "isReceipt": true/false (set to false if the image is not a receipt, bill, slip, or invoice),
  "merchant": "Exact business or store name (e.g. Imtiaz Super Market, Campus Cafe, Student Book Center)",
  "date": "YYYY-MM-DD date of receipt (if missing, ambiguous or illegible, use today's date: ${new Date().toISOString().slice(0, 10)})",
  "total": 123.45 (total paid amount as a positive number, exclude currency symbols),
  "currency": "PKR / Rs / USD / INR / etc.",
  "lineItems": [
    { "name": "Item description", "qty": 1, "price": 50.00 }
  ],
  "suggestedCategory": "The most appropriate category among: Food, Transport, Hostel/Rent, Academics, Subscriptions, Entertainment, Miscellaneous, Groceries, Books",
  "confidence": {
    "amount": 0.0 to 1.0 (confidence that the total amount is accurately extracted),
    "date": 0.0 to 1.0 (confidence that the date is accurately extracted),
    "category": 0.0 to 1.0 (confidence in the suggested category)
  }
}

Guidelines:
1. Find the final total/grand total paid (often labeled "Total", "Net Amount", "Amount Paid", "Total Due", "Grand Total"). Ignore sub-totals or cash tendered unless that represents the final amount.
2. If the date is missing, illegible, or in the future, set date to "${new Date().toISOString().slice(0, 10)}" and set confidence.date to 0.5.
3. If the image is blurry, cut off, or cannot be read, set isReceipt to false or total to null, with confidence.amount <= 0.3.
4. Return ONLY valid JSON with no markdown formatting or extra text.
`.trim();

/**
 * Checks which vision provider is available.
 */
function getProvider() {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return 'gemini';
  }
  if (process.env.OPENAI_API_KEY || process.env.VISION_API_KEY) {
    return 'openai';
  }
  if (process.env.RECEIPT_MOCK === 'true' || process.env.NODE_ENV === 'test') {
    return 'mock';
  }
  return null;
}

/**
 * Extracts receipt information from an image buffer using Google Gemini.
 */
async function extractWithGemini(buffer, mimeType) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const base64Data = buffer.toString('base64');

  const controller = new AbortController();
  const timeoutMs = Number(process.env.VISION_TIMEOUT_MS) || 25000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: RECEIPT_EXTRACTION_PROMPT },
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 1024
        }
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw.slice(0, 200);
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) detail = parsed.error.message;
      } catch {
        /* fallback */
      }
      throw new Error(`Gemini Vision API error (${response.status}): ${detail}`);
    }

    const data = JSON.parse(raw);
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response content from Gemini Vision API.');

    return parseVisionResponse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts receipt information using an OpenAI-compatible Vision model.
 */
async function extractWithOpenAI(buffer, mimeType) {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.VISION_API_KEY || '').trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

  const base64Data = buffer.toString('base64');
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Data}`;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.VISION_TIMEOUT_MS) || 25000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: RECEIPT_EXTRACTION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw.slice(0, 200);
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) detail = parsed.error.message;
      } catch {
        /* fallback */
      }
      throw new Error(`OpenAI Vision API error (${response.status}): ${detail}`);
    }

    const data = JSON.parse(raw);
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No response content from OpenAI Vision API.');

    return parseVisionResponse(text);
  } finally {
    clearTimeout(timer);
  }
}

let mockExtractorOverride = null;

function setMockExtractor(fn) {
  mockExtractorOverride = fn;
}

/**
 * Mock extractor for test / offline development mode.
 */
function extractWithMock(buffer) {
  if (typeof mockExtractorOverride === 'function') {
    return mockExtractorOverride(buffer);
  }
  if (buffer) {
    const str = buffer.toString('utf8');
    if (str.startsWith('TEST_MOCK:')) {
      return parseVisionResponse(str.slice('TEST_MOCK:'.length));
    }
  }
  return {
    isReceipt: true,
    merchant: 'Imtiaz Super Market',
    date: new Date().toISOString().slice(0, 10),
    total: 1240.0,
    currency: 'PKR',
    lineItems: [
      { name: 'Milk Pack 1L', qty: 2, price: 540.0 },
      { name: 'Whole Wheat Bread', qty: 1, price: 210.0 },
      { name: 'Eggs 1 Dozen', qty: 1, price: 490.0 }
    ],
    suggestedCategory: 'Groceries',
    confidence: {
      amount: 0.95,
      date: 0.9,
      category: 0.92
    }
  };
}

/**
 * Cleans and parses JSON extracted by the vision model.
 */
function parseVisionResponse(rawText) {
  let text = String(rawText || '').trim();
  // Strip markdown code fences if model enclosed in ```json ... ```
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Vision AI did not return a valid JSON object.');
  }

  const parsed = JSON.parse(match[0]);

  // Clean and sanitize numbers and dates
  let rawTotal = parsed.total ?? parsed.amount ?? 0;
  if (typeof rawTotal === 'string') {
    let s = rawTotal.trim().replace(/[^\d.,]/g, '');
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(/,/g, '');
    rawTotal = s;
  }
  const total = Number(rawTotal);
  const confidence = {
    amount: Math.max(0, Math.min(1, Number(parsed.confidence?.amount ?? 0.5))),
    date: Math.max(0, Math.min(1, Number(parsed.confidence?.date ?? 0.5))),
    category: Math.max(0, Math.min(1, Number(parsed.confidence?.category ?? 0.5)))
  };

  return {
    isReceipt: parsed.isReceipt !== false,
    merchant: String(parsed.merchant || 'Unknown Store').trim(),
    date: parsed.date || new Date().toISOString().slice(0, 10),
    total: Number.isFinite(total) && total > 0 ? total : null,
    currency: String(parsed.currency || 'PKR').trim(),
    lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
    suggestedCategory: String(parsed.suggestedCategory || 'Miscellaneous').trim(),
    confidence
  };
}

/**
 * Main entry point: extracts receipt fields from an image buffer.
 */
async function extractReceipt(buffer, mimeType = 'image/jpeg') {
  const provider = getProvider();

  if (!provider) {
    throw new Error(
      'Vision AI service is not configured: please set GEMINI_API_KEY (free from https://aistudio.google.com) or OPENAI_API_KEY in server/.env.'
    );
  }

  if (provider === 'gemini') {
    return extractWithGemini(buffer, mimeType);
  }
  if (provider === 'openai') {
    return extractWithOpenAI(buffer, mimeType);
  }
  if (provider === 'mock') {
    return extractWithMock(buffer);
  }

  throw new Error('Unsupported vision provider.');
}

module.exports = {
  extractReceipt,
  getProvider,
  setMockExtractor
};
