import { useCallback, useEffect, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import Icon from './Icon';
import { Button, Modal } from './ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, symbolFor, toInputDate } from '../lib/format';

// ─── Synonym map: receipt text keywords → category names ──────────────────
const CATEGORY_KEYWORDS = {
  Food:          ['food', 'canteen', 'cafe', 'restaurant', 'lunch', 'dinner', 'breakfast',
                  'snack', 'pizza', 'burger', 'biryani', 'chai', 'tea', 'coffee', 'juice',
                  'grocery', 'groceries', 'swiggy', 'zomato', 'kfc', 'mcdonald', 'bakery',
                  'samosa', 'imtiaz', 'super market', 'supermarket', 'mart', 'dhaba',
                  'karyana', 'mithai', 'nihari', 'paratha', 'roti', 'naan'],
  Shopping:      ['shopping', 'clothes', 'clothing', 'shirt', 'pants', 't-shirt', 'tshirt',
                  'shoes', 'socks', 'jeans', 'jacket', 'outfit', 'wear', 'apparel', 'fashion'],
  Transport:     ['bus', 'metro', 'train', 'rickshaw', 'auto', 'taxi', 'uber', 'careem',
                  'fuel', 'petrol', 'diesel', 'fare', 'cab', 'bike', 'parking', 'toll'],
  'Hostel/Rent': ['hostel', 'rent', 'room', 'mess', 'landlord', 'electricity', 'water',
                  'gas bill', 'maintenance', 'utility', 'wifi', 'internet'],
  Academics:     ['book', 'textbook', 'notebook', 'stationery', 'pen', 'printout', 'photocopy',
                  'tuition', 'fee', 'fees', 'course', 'exam', 'lab', 'library', 'semester',
                  'admission', 'registration', 'assignment'],
  Subscriptions: ['netflix', 'spotify', 'youtube', 'prime', 'subscription', 'plan', 'recharge'],
  Entertainment: ['entertainment', 'movie', 'cinema', 'game', 'gaming', 'outing', 'party', 'concert'],
  Miscellaneous: ['misc', 'general', 'other', 'service']
};

/**
 * Normalizes numbers from different receipt formats:
 * - European comma decimals: 371,00 → 371
 * - Thousands comma: 26,000 → 26000
 * - Comma thousand + dot decimal: 26,000.50 → 26000.5
 * - Dot thousand + comma decimal: 26.000,50 → 26000.5
 * - Trailing slash-dash: 26,000/- → 26000
 */
function normalizeAmountString(numStr) {
  if (!numStr) return null;
  let s = String(numStr).trim().replace(/\s+/g, '').replace(/[\/\-]+$/, '');

  // 1. European format with dot thousand and comma decimal: 1.234,56 or 26.000,50
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  // 2. US/UK/PK standard with comma thousand and dot decimal: 1,234.56 or 26,000.50
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})$/.test(s)) {
    s = s.replace(/,/g, '');
  }
  // 3. Comma as decimal separator: 371,00 or 19,50 or 5,99
  else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  }
  // 4. Comma as thousands separator: 26,000 or 1,500,000
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, '');
  }
  // 5. Ending with comma + 2 digits: e.g. 5199,00
  else if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
  }
  // 6. Ending with comma + 3 digits: e.g. 5,199
  else if (/,\d{3}$/.test(s)) {
    s = s.replace(/,/g, '');
  }
  // 7. Remove any remaining commas
  else {
    s = s.replace(/,/g, '');
  }

  const val = parseFloat(s);
  return Number.isFinite(val) && val > 0 ? val : null;
}

// ─── Extract total amount from OCR text ──────────────────────────────────────
function extractAmount(text) {
  const candidates = [];

  // Step 1: labelled totals (highest priority)
  // Handles: TOTAL $371,00 | TOTAL: $371,00 | GRAND TOTAL: Rs. 26,000 | NET AMOUNT = 500.00 | Total 371.00
  const labelledPat = /(?:grand\s*total|total\s*amount|net\s*amount|total\s*due|total\s*payable|bill\s*amount|payable\s*amount|invoice\s*total|final\s*total|\btotal\b)\s*[:\-=]?\s*(?:[\$€£¥₹§]|rs\.?|pkr|inr|usd|eur)?\s*[:\-=]?\s*([\d.,]+)/gi;
  let m;
  while ((m = labelledPat.exec(text)) !== null) {
    const val = normalizeAmountString(m[1]);
    if (val && val > 0) candidates.push({ val, priority: 10, raw: m[0] });
  }

  // Step 2: Line containing 'TOTAL' but NOT 'subtotal', 'cash', 'change', 'discount'
  const lines = text.split('\n');
  for (const line of lines) {
    if (/\btotal\b/i.test(line) && !/sub\s*total|cash|change|discount/i.test(line)) {
      const nums = line.match(/(?:[\$€£¥₹§]|rs\.?|pkr|inr|usd|eur)?\s*([\d]+(?:[.,]\d+)?)/gi);
      if (nums) {
        for (const rawNum of nums) {
          const cleanNum = rawNum.replace(/[^\d.,]/g, '');
          const val = normalizeAmountString(cleanNum);
          if (val && val > 0) candidates.push({ val, priority: 9, raw: line });
        }
      }
    }
  }

  // Step 3: Currency prefix — $371,00 / Rs 26,000 / PKR 26000 / USD 50 / € 45,50
  const currencyPat = /(?:[\$€£¥₹]|rs\.?|pkr|inr|usd|eur)\s*[:\-=]?\s*([\d.,]+)/gi;
  while ((m = currencyPat.exec(text)) !== null) {
    const val = normalizeAmountString(m[1]);
    if (val && val > 0) candidates.push({ val, priority: 5, raw: m[0] });
  }

  // Step 4: Currency suffix — 26,000/- or 26,000 Rs or 371$
  const suffixPat = /([\d.,]+)\s*\/?-?\s*(?:[\$€£¥₹]|rs\.?|pkr|inr|usd)/gi;
  while ((m = suffixPat.exec(text)) !== null) {
    const val = normalizeAmountString(m[1]);
    if (val && val > 0) candidates.push({ val, priority: 5, raw: m[0] });
  }

  // Step 5: Large comma-formatted numbers (e.g. 26,000) — fallback
  const bigNumPat = /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\b/g;
  while ((m = bigNumPat.exec(text)) !== null) {
    const val = normalizeAmountString(m[1]);
    if (val && val > 100) candidates.push({ val, priority: 3, raw: m[0] });
  }

  // Step 6: Decimal numbers (e.g. 371.00 or 19,00)
  const decimalPat = /\b(\d+[.,]\d{2})\b/g;
  while ((m = decimalPat.exec(text)) !== null) {
    const val = normalizeAmountString(m[1]);
    if (val && val > 0) candidates.push({ val, priority: 2, raw: m[0] });
  }

  // Step 7: Any 4+ digit unformatted number — last resort
  const rawNumPat = /\b(\d{4,9}(?:\.\d{1,2})?)\b/g;
  while ((m = rawNumPat.exec(text)) !== null) {
    const val = normalizeAmountString(m[1]);
    if (val && val > 100 && !(val >= 1900 && val <= 2099)) {
      candidates.push({ val, priority: 1, raw: m[0] });
    }
  }

  if (!candidates.length) return null;

  // Pick highest priority first, then largest amount
  candidates.sort((a, b) => b.priority - a.priority || b.val - a.val);
  return candidates[0].val;
}

// ─── Extract date from OCR text ───────────────────────────────────────────
function extractDate(text) {
  const today = new Date().toISOString().slice(0, 10);
  const pats = [
    /(\d{4}-\d{2}-\d{2})/,                                        // ISO
    /(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/,                        // DD/MM/YYYY
    /(\d{2})[\/\-.](\d{2})[\/\-.](\d{2})\b/,                      // DD/MM/YY
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+(\d{2,4})/i,
  ];
  const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

  for (const pat of pats) {
    const m = text.match(pat);
    if (!m) continue;
    try {
      let d;
      if (m[0].includes('-') && m[1].length === 4) {
        d = new Date(m[0]);
      } else if (months[m[2]?.toLowerCase()]) {
        const yr = parseInt(m[3]) + (m[3].length === 2 ? 2000 : 0);
        d = new Date(yr, months[m[2].toLowerCase()] - 1, parseInt(m[1]));
      } else {
        const yr = parseInt(m[3]) + (m[3].length === 2 ? 2000 : 0);
        d = new Date(yr, parseInt(m[2]) - 1, parseInt(m[1]));
      }
      if (!isNaN(d.getTime()) && d <= new Date()) {
        return d.toISOString().slice(0, 10);
      }
    } catch { /**/ }
  }
  return today;
}

// ─── Extract merchant name from OCR text ──────────────────────────────────
// Pakistani receipts usually have store name at the very top in large text.
// We skip lines that look like garbage (too short, mostly symbols, mostly digits).
function extractMerchant(text) {
  const lines = text.split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (l.length < 4 || l.length > 80) return false;         // too short or too long
      if (/^\d/.test(l)) return false;                          // starts with number
      if (/^[\W_]+$/.test(l)) return false;                     // only symbols
      const letters = (l.match(/[a-zA-Z]/g) || []).length;
      if (letters < 3) return false;                            // barely any letters (OCR garbage)
      if (/^(date|time|phone|tel|fax|vat|ntn|str|total|invoice|receipt|bill|www\.|http|thank\s*you|designed\s*by)/i.test(l)) return false;
      return true;
    });

  // Prefer lines that contain known store keywords
  const storeKeywords = ['market', 'mart', 'store', 'shop', 'super', 'imtiaz', 'agha', 'metro',
    'naheed', 'chase', 'hyperstar', 'carrefour', 'daraz', 'pharmacy', 'medical',
    'cafe', 'restaurant', 'bakery', 'university', 'college', 'institute', 'company', 'boutique', 'mall'];
  for (const line of lines.slice(0, 6)) {
    if (storeKeywords.some((kw) => line.toLowerCase().includes(kw))) {
      return line;
    }
  }

  // Fallback: first clean line
  return lines[0] || 'Unknown Store';
}

// ─── Suggest category from OCR text ──────────────────────────────────────
function suggestCategory(text, categories = []) {
  const lower = text.toLowerCase();
  // First try against the user's actual category names
  for (const cat of categories) {
    if (cat.type !== 'expense' || cat.isArchived) continue;
    if (lower.includes(cat.name.toLowerCase())) {
      return { name: cat.name, id: cat._id, confidence: 0.9 };
    }
  }
  // Then try keyword map
  for (const [catName, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) {
      const match = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase() && c.type === 'expense');
      if (match) return { name: match.name, id: match._id, confidence: 0.82 };
      return { name: catName, id: null, confidence: 0.75 };
    }
  }
  const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous' && c.type === 'expense');
  return { name: 'Miscellaneous', id: misc?._id || null, confidence: 0.3 };
}

function extractCurrency(text, defaultCurrency = 'PKR') {
  if (/\$|usd/i.test(text)) return 'USD';
  if (/€|eur/i.test(text)) return 'EUR';
  if (/£|gbp/i.test(text)) return 'GBP';
  if (/₹|inr/i.test(text)) return 'INR';
  if (/rs\.?|pkr/i.test(text)) return 'PKR';
  return defaultCurrency;
}

// ─── Parse all receipt fields from raw OCR text ───────────────────────────
function parseReceiptText(rawText, categories = [], userCurrency = 'PKR') {
  const amount   = extractAmount(rawText);
  const date     = extractDate(rawText);
  const merchant = extractMerchant(rawText);
  const category = suggestCategory(rawText, categories);
  const currency = extractCurrency(rawText, userCurrency);

  const amountConf   = amount ? (amount > 0 ? 0.88 : 0.2) : 0.1;
  const dateConf     = rawText.match(/\d{4}-\d{2}-\d{2}|\d{2}[\/.-]\d{2}[\/.-]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+\d{2,4}/i) ? 0.88 : 0.5;
  const categoryConf = category.confidence;

  return {
    merchant,
    date,
    total: amount,
    currency,
    suggestedCategory: category.name,
    suggestedCategoryId: category.id,
    confidence: { amount: amountConf, date: dateConf, category: categoryConf },
    isReceipt: Boolean(amount && amount > 0),
  };
}

/**
 * Compresses and resizes an image file/blob to a maximum dimension of 1600px
 * and JPEG quality ~0.8 using an offscreen canvas.
 */
function compressImage(file, maxDimension = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Please select an image file (JPEG, PNG, or WebP).'));
    }
    if (file.size > 8 * 1024 * 1024) {
      return reject(new Error('Image is larger than 8 MB. Please choose a smaller photo.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Canvas image conversion failed.'));
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ReceiptScanner({ open, onClose, onSaved, onEdit, onManualPrefill, categories = [] }) {
  const { currency } = useAuth();
  const toast = useToast();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // rear camera preferred

  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [lastBlob, setLastBlob] = useState(null); // preserved in memory for offline retry

  // Result views: null | 'unreadable' | 'duplicate' | 'review' | 'auto_added'
  const [resultState, setResultState] = useState(null);
  const [scanResult, setScanResult] = useState(null);

  // Review form states
  const [reviewMerchant, setReviewMerchant] = useState('');
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [reviewCategoryId, setReviewCategoryId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState(false);

  /**
   * Start live camera stream
   */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera is not supported in this browser. Please upload a photo instead.');
      return;
    }

    try {
      // Stop any existing tracks first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. You can still pick or upload a receipt photo below.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera was found on your device. Please upload a photo instead.');
      } else {
        setCameraError('Could not start the camera. Please upload an image file instead.');
      }
    }
  }, [facingMode]);

  /**
   * Stop camera tracks
   */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Handle open/close camera lifecycle
  useEffect(() => {
    if (open && !resultState) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, resultState, startCamera, stopCamera]);

  /**
   * Captures snapshot from live video stream and compresses it
   */
  const captureFromVideo = async () => {
    if (!videoRef.current || !cameraActive) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        async (blob) => {
          if (!blob) return;
          const compressed = await compressImage(blob);
          handleUploadAndScan(compressed);
        },
        'image/jpeg',
        0.85
      );
    } catch (err) {
      toast.error(err.message);
    }
  };

  /**
   * Handles photo picked via file input
   */
  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setProcessing(true);
      setStatusMessage('Optimizing image...');
      const compressed = await compressImage(file);
      handleUploadAndScan(compressed);
    } catch (err) {
      setProcessing(false);
      toast.error(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const tryVisionScan = async (blob) => {
    const formData = new FormData();
    formData.append('image', blob, 'receipt.jpg');

    try {
      const result = await api.post('/receipts/scan', formData);
      const extracted = result.extracted;

      if (result.status === 'auto_added') {
        setScanResult(result);
        setResultState('auto_added');
        onSaved?.(result.transaction);
        if (result.warnings?.length) {
          result.warnings.forEach((warning) => toast.warn(warning.message));
        } else if (result.alerts) {
          toast.warn('A budget alert was triggered for this category.');
        }
        return true;
      }

      if (result.status === 'duplicate_detected' || result.status === 'review_required') {
        // The server may mark an existing transaction as a duplicate during
        // scanning, so refresh the anomaly summary even before the user saves.
        if (result.status === 'duplicate_detected') onSaved?.(result.transaction || null);
        setReviewMerchant(extracted?.merchant || '');
        setReviewAmount(String(extracted?.amount ?? ''));
        setReviewDate(extracted?.date || toInputDate(new Date()));
        setReviewCategoryId(result.category?._id || '');
        setScanResult(result);
        setResultState(result.status === 'duplicate_detected' ? 'duplicate' : 'review');
        return true;
      }

      return false;
    } catch (err) {
      toast.warn(`Automatic receipt extraction could not complete: ${err.message}`);
      return false;
    }
  };

  /**
   * Runs Tesseract.js OCR locally in the browser — no backend, no API key needed.
   * Uses the server's vision service when local OCR cannot confidently read the receipt.
   */
  const handleUploadAndScan = async (blob) => {
    stopCamera();
    setLastBlob(blob);
    setProcessing(true);
    setStatusMessage('Reading your receipt…');
    setResultState(null);

    let extracted = null;

    try {
      // ── Step 1: OCR with Tesseract.js (runs entirely in the browser) ──
      setStatusMessage('Running OCR on receipt image…');
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setStatusMessage(`Reading text… ${Math.round((m.progress || 0) * 100)}%`);
          }
        },
      });

      const imageUrl = URL.createObjectURL(blob);
      const { data: { text } } = await worker.recognize(imageUrl);
      URL.revokeObjectURL(imageUrl);
      await worker.terminate();

      if (!text || text.trim().length < 5) {
        if (await tryVisionScan(blob)) return;
        setResultState('unreadable');
        setScanResult({ message: "Couldn't read this receipt. Please try a clearer, well-lit photo or enter the details manually.", partial: {} });
        return;
      }

      // ── Step 2: Parse extracted text client-side ──
      setStatusMessage('Extracting details…');
      extracted = parseReceiptText(text, categories, currency);

      if (!extracted.isReceipt || !extracted.total) {
        if (await tryVisionScan(blob)) return;
        setResultState('unreadable');
        setScanResult({
          message: "Couldn't find the total amount on this receipt. Try a clearer photo or enter manually.",
          partial: { merchant: extracted.merchant, date: extracted.date, suggestedCategory: extracted.suggestedCategory }
        });
        return;
      }

      // ── Step 3: Duplicate check (via backend) ──
      setStatusMessage('Checking for duplicates…');
      let duplicateResult = null;
      try {
        const dupCheck = await api.post('/receipts/check-duplicate', {
          merchant: extracted.merchant,
          amount: extracted.total,
          date: extracted.date,
        });
        if (dupCheck?.isDuplicate) duplicateResult = dupCheck.existing;
      } catch (err) {
        toast.error(`Could not check for duplicate receipts: ${err.message}`);
        setScanResult({ message: err.message });
        setResultState('retry');
        return;
      }

      // ── Step 4: Resolve category ──
      let resolvedCategoryId = extracted.suggestedCategoryId;
      let resolvedCategoryName = extracted.suggestedCategory;
      if (!resolvedCategoryId) {
        const found = categories.find(
          (c) => c.name.toLowerCase() === extracted.suggestedCategory.toLowerCase() && c.type === 'expense' && !c.isArchived
        );
        if (found) {
          resolvedCategoryId = found._id;
          resolvedCategoryName = found.name;
        } else {
          const fallback = categories.find((c) => c.name.toLowerCase() === 'miscellaneous' && c.type === 'expense' && !c.isArchived)
            || categories.find((c) => c.type === 'expense' && !c.isArchived);
          if (fallback) {
            resolvedCategoryId = fallback._id;
            resolvedCategoryName = fallback.name;
          }
        }
      }
      const resolvedCategory = resolvedCategoryId
        ? { _id: resolvedCategoryId, name: resolvedCategoryName }
        : null;

      const mockResponse = {
        extracted: {
          merchant: extracted.merchant,
          date: extracted.date,
          amount: extracted.total,
          currency: extracted.currency,
          suggestedCategory: resolvedCategoryName,
          confidence: extracted.confidence,
        },
        category: resolvedCategory,
      };

      // ── Step 5: Duplicate warning ──
      if (duplicateResult) {
        setScanResult({ ...mockResponse, message: 'This looks like a receipt you already added. Add anyway?', duplicate: duplicateResult });
        setReviewMerchant(extracted.merchant);
        setReviewAmount(String(extracted.total));
        setReviewDate(extracted.date);
        setReviewCategoryId(resolvedCategoryId || '');
        setResultState('duplicate');
        return;
      }

      // ── Step 6: High / low confidence ──
      const isHighConf = extracted.confidence.amount >= 0.8 && extracted.confidence.date >= 0.8;

      setReviewMerchant(extracted.merchant);
      setReviewAmount(String(extracted.total));
      setReviewDate(extracted.date);
      setReviewCategoryId(resolvedCategoryId || '');

      if (isHighConf && resolvedCategoryId) {
        // Auto-save directly via confirm endpoint
        setStatusMessage('Saving expense…');
        const saved = await api.post('/receipts/confirm', {
          amount: extracted.total,
          date: extracted.date,
          merchant: extracted.merchant,
          category: resolvedCategoryId,
          confidence: extracted.confidence,
        });
        setScanResult(saved);
        setResultState('auto_added');
        onSaved?.(saved.transaction);
        if (saved.warnings?.length) {
          saved.warnings.forEach((warning) => toast.warn(warning.message));
        } else if (saved.alerts) {
          toast.warn('A budget alert was triggered for this category.');
        }
      } else {
        if (await tryVisionScan(blob)) return;
        // Show review card so user can adjust
        setScanResult(mockResponse);
        setResultState('review');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to scan receipt. You can retry or enter it manually.');
      setResultState('retry');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Retry scanning the image stored in memory
   */
  const handleRetry = () => {
    if (lastBlob) {
      handleUploadAndScan(lastBlob);
    } else {
      resetScan();
    }
  };

  /**
   * Resets scanner back to camera
   */
  const resetScan = () => {
    setResultState(null);
    setScanResult(null);
    setLastBlob(null);
    setCameraError(null);
    startCamera();
  };

  /**
   * Confirms low confidence review or duplicate override
   */
  const handleConfirmSave = async () => {
    if (!reviewAmount || Number(reviewAmount) <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (!reviewCategoryId) {
      toast.error('Please select a category.');
      return;
    }

    setConfirming(true);
    try {
      const payload = {
        merchant: reviewMerchant,
        amount: Number(reviewAmount),
        date: reviewDate || toInputDate(new Date()),
        category: reviewCategoryId,
        lineItems: scanResult?.extracted?.lineItems || [],
        confidence: scanResult?.extracted?.confidence || {}
      };

      const res = await api.post('/receipts/confirm', payload);
      toast.success(res.message || 'Receipt expense saved.');
      res.warnings?.forEach((warning) => toast.warn(warning.message));
      onSaved?.(res.transaction);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Undoes auto-added transaction and removes any empty auto-created category
   */
  const handleUndo = async () => {
    if (!scanResult?.transaction?._id) return;
    setUndoing(true);
    try {
      const res = await api.post('/receipts/undo', {
        transactionId: scanResult.transaction._id,
        createdCategoryId: scanResult.createdCategoryId
      });
      toast.success(res.message || 'Expense undone.');
      onSaved?.(null); // trigger refresh
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUndoing(false);
    }
  };

  /**
   * Switches to manual form prefilled with whatever was found
   */
  const handleOpenManual = () => {
    const partial = scanResult?.partial || scanResult?.extracted || {};
    onClose();
    onManualPrefill?.({
      type: 'expense',
      description: partial.merchant || '',
      amount: partial.amount || partial.total || '',
      date: partial.date || toInputDate(new Date()),
      category: scanResult?.category?._id || ''
    });
  };

  const expenseCategories = categories.filter((c) => c.type === 'expense' && !c.isArchived);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan Receipt"
      subtitle="Take a photo or upload a receipt to automatically log the expense."
    >
      <div className="receipt-scanner-container">
        {/* Live region for accessibility */}
        <div className="sr-only" role="status" aria-live="polite">
          {processing ? statusMessage : resultState ? `Receipt status: ${resultState}` : 'Camera ready'}
        </div>

        {/* ── Processing Overlay ── */}
        {processing && (
          <div className="receipt-processing-overlay" role="dialog" aria-modal="true" aria-label="Processing receipt">
            <span className="spinner" style={{ width: 36, height: 36 }} />
            <h4 className="receipt-processing-title">{statusMessage || 'Reading your receipt...'}</h4>
            <p className="tiny muted">Detecting store, total amount, date, and category</p>
          </div>
        )}

        {/* ── 1. CAMERA VIEWPORT & CAPTURE CONTROLS ── */}
        {!resultState && !processing && (
          <div className="stack gap-3">
            {cameraActive ? (
              <div className="receipt-camera-viewport">
                <video ref={videoRef} autoPlay playsInline muted className="receipt-camera-video" />
                {/* Frame guide overlay */}
                <div className="receipt-frame-guide">
                  <div className="receipt-frame-corners" />
                  <span className="receipt-frame-label">Align receipt within frame</span>
                </div>
              </div>
            ) : (
              <div className="receipt-fallback-box">
                <Icon name="camera" size={36} className="receipt-fallback-icon" />
                {cameraError ? (
                  <div className="receipt-error-text small">{cameraError}</div>
                ) : (
                  <p className="small muted">Initializing camera or upload receipt photo...</p>
                )}
                <div className="row gap-2 mt-2">
                  <Button
                    variant="primary"
                    icon="upload"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select Photo from Device
                  </Button>
                </div>
              </div>
            )}

            {/* Hidden file input fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFilePicked}
            />

            {/* Capture action bar */}
            <div className="receipt-actions-bar">
              {cameraActive && (
                <>
                  <button
                    type="button"
                    className="receipt-flip-btn"
                    onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                    title="Flip camera"
                    aria-label="Flip camera front/back"
                  >
                    <Icon name="refresh" size={18} />
                  </button>

                  <button
                    type="button"
                    className="receipt-shutter-btn"
                    onClick={captureFromVideo}
                    aria-label="Capture Receipt Photo"
                    title="Capture Photo"
                  >
                    <div className="receipt-shutter-inner" />
                  </button>
                </>
              )}

              <Button
                variant={cameraActive ? 'quiet' : 'outline'}
                icon="upload"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload from Files
              </Button>
            </div>
          </div>
        )}

        {/* ── 2. AUTO-ADDED SUCCESS STATE (HIGH CONFIDENCE) ── */}
        {resultState === 'auto_added' && scanResult?.transaction && (
          <div className="receipt-card-result success-card">
            <div className="row gap-3">
              <span className="receipt-success-badge">
                <Icon name="check" size={24} />
              </span>
              <div className="grow">
                <div className="strong" style={{ fontSize: '1.05rem', color: 'var(--text)' }}>
                  Added {money(scanResult.transaction.amount, currency)} to {scanResult.transaction.category?.name}
                </div>
                <div className="small muted mt-1">
                  {scanResult.transaction.description} · {toInputDate(scanResult.transaction.date)}
                </div>
              </div>
            </div>

            {scanResult.createdCategoryId && (
              <div className="receipt-info-pill mt-2">
                ✨ Created new category <b>{scanResult.transaction.category?.name}</b> for your receipts.
              </div>
            )}

            <div className="receipt-card-footer mt-3 row-between wrap gap-2">
              <div className="row gap-2">
                <Button
                  variant="outline"
                  icon="trash"
                  onClick={handleUndo}
                  disabled={undoing}
                >
                  {undoing ? 'Undoing...' : 'Undo'}
                </Button>
                <Button
                  variant="quiet"
                  icon="edit"
                  onClick={() => {
                    onClose();
                    onEdit?.(scanResult.transaction);
                  }}
                >
                  Edit
                </Button>
              </div>

              <div className="row gap-2">
                <Button variant="primary" onClick={resetScan} icon="camera">
                  Scan Another
                </Button>
                <Button variant="quiet" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. DUPLICATE DETECTED WARNING ── */}
        {resultState === 'duplicate' && scanResult && (
          <div className="receipt-card-result warn-card">
            <div className="row gap-3">
              <span className="receipt-warn-badge">
                <Icon name="alert" size={22} />
              </span>
              <div className="grow">
                <div className="strong" style={{ fontSize: '1.02rem' }}>
                  {scanResult.message || 'This looks like a receipt you already added.'}
                </div>
                <div className="small muted mt-1">
                  Existing entry: {money(scanResult.duplicate?.amount, currency)} at{' '}
                  {scanResult.duplicate?.description} on {toInputDate(scanResult.duplicate?.date)}
                </div>
              </div>
            </div>

            <div className="receipt-review-box mt-3">
              <div className="row-between small">
                <span className="muted">Store / Merchant:</span>
                <span className="strong">{reviewMerchant}</span>
              </div>
              <div className="row-between small mt-1">
                <span className="muted">Amount:</span>
                <span className="strong money-out">{money(reviewAmount, currency)}</span>
              </div>
              <div className="row-between small mt-1">
                <span className="muted">Category:</span>
                <span className="strong">{scanResult.category?.name}</span>
              </div>
            </div>

            <div className="receipt-card-footer mt-3 row gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button variant="quiet" onClick={resetScan}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmSave} disabled={confirming}>
                {confirming ? 'Adding...' : 'Add Anyway'}
              </Button>
            </div>
          </div>
        )}

        {/* ── 4. LOW CONFIDENCE REVIEW CARD ── */}
        {resultState === 'review' && scanResult && (
          <div className="receipt-card-result review-card">
            <div className="row gap-2 mb-2">
              <Icon name="info" size={18} style={{ color: 'var(--primary)' }} />
              <div className="small strong">Please verify the extracted details before confirming:</div>
            </div>

            <div className="stack gap-2 mt-2">
              <div className="field">
                <label className="label">Merchant / Store</label>
                <input
                  type="text"
                  className="input"
                  value={reviewMerchant}
                  onChange={(e) => setReviewMerchant(e.target.value)}
                  placeholder="Store name"
                />
              </div>

              <div className="grid grid-2">
                <div className="field">
                  <label className="label">Total Amount ({symbolFor(currency)})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    value={reviewAmount}
                    onChange={(e) => setReviewAmount(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="label">Date</label>
                  <input
                    type="date"
                    className="input"
                    value={reviewDate}
                    max={toInputDate(new Date())}
                    onChange={(e) => setReviewDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label className="label">Category</label>
                <select
                  className="select"
                  value={reviewCategoryId}
                  onChange={(e) => setReviewCategoryId(e.target.value)}
                >
                  <option value="">Select Category</option>
                  {expenseCategories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="receipt-card-footer mt-3 row-between wrap gap-2">
              <Button variant="quiet" onClick={resetScan}>
                Retake Photo
              </Button>
              <Button variant="primary" icon="check" onClick={handleConfirmSave} disabled={confirming}>
                {confirming ? 'Saving...' : 'Confirm & Add'}
              </Button>
            </div>
          </div>
        )}

        {/* ── 5. UNREADABLE RECEIPT STATE ── */}
        {resultState === 'unreadable' && (
          <div className="receipt-card-result unreadable-card">
            <div className="row gap-3">
              <span className="receipt-warn-badge">
                <Icon name="alert" size={24} />
              </span>
              <div className="grow">
                <div className="strong" style={{ fontSize: '1.02rem' }}>
                  {scanResult?.message || "Couldn't read this receipt, please try a clearer photo or enter it manually."}
                </div>
                <div className="small muted mt-1">
                  Make sure the lighting is bright, text is sharp, and the total amount is clearly visible.
                </div>
              </div>
            </div>

            <div className="receipt-card-footer mt-4 row gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button variant="outline" icon="camera" onClick={resetScan}>
                Try Another Photo
              </Button>
              <Button variant="primary" icon="edit" onClick={handleOpenManual}>
                Enter Manually
              </Button>
            </div>
          </div>
        )}

        {/* ── 6. NETWORK RETRY STATE ── */}
        {resultState === 'retry' && (
          <div className="receipt-card-result warn-card">
            <div className="strong mb-1">Upload failed</div>
            <p className="small muted">Could not reach the server or verify the receipt. Your image is still saved.</p>
            <div className="row gap-2 mt-3" style={{ justifyContent: 'flex-end' }}>
              <Button variant="quiet" onClick={resetScan}>
                Cancel
              </Button>
              <Button variant="primary" icon="refresh" onClick={handleRetry}>
                Retry Upload
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
