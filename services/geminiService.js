const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs   = require('fs-extra');
const path = require('path');

const genAI   = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const SOP_DIR = path.join(__dirname, '../data/sop');

async function loadSOPs() {
  try {
    await fs.ensureDir(SOP_DIR);
    const files = (await fs.readdir(SOP_DIR)).filter(f => /\.(txt|md)$/.test(f));
    if (!files.length) return 'Tidak ada dokumen SOP yang ditemukan.';
    const contents = await Promise.all(
      files.map(async f => `=== SOP: ${f} ===\n${await fs.readFile(path.join(SOP_DIR, f), 'utf-8')}`)
    );
    return contents.join('\n\n');
  } catch { return 'SOP tidak dapat dimuat.'; }
}

/**
 * Step 1: Extract procurement items from ticket text (no pricing yet).
 */
async function extractItemsOnly(ticketText) {
  const model      = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const sopContent = await loadSOPs();

  const prompt = `Kamu adalah asisten pengadaan barang untuk jaringan hotel. Tugasmu adalah membaca teks tiket support yang diberikan dan mengekstrak semua kebutuhan pembelian barang atau jasa yang telah DISETUJUI atau PERLU ditindaklanjuti.

DOKUMEN SOP PENGADAAN:
${sopContent}

INSTRUKSI:
- Baca semua tiket yang ada dalam teks
- Untuk setiap tiket, identifikasi apakah ada kebutuhan pembelian atau perbaikan
- Ekstrak informasi: nomor tiket, cabang/lokasi, departemen, deskripsi kebutuhan, tingkat urgensi
- Jika satu tiket memiliki beberapa item, buat baris terpisah untuk setiap item
- Jika tidak ada kebutuhan pembelian yang jelas dalam tiket, abaikan tiket tersebut
- Tentukan departemen berdasarkan konteks (IT, ME, Housekeeping, F&B, Operations, dll)
- Tentukan urgensi: normal, urgent, atau critical
- JANGAN cantumkan estimasi harga di tahap ini — harga akan dicari terpisah melalui pencarian web

TEKS TIKET:
${ticketText}

Respond HANYA dengan JSON valid berikut, tanpa teks lain apapun:
{
  "items": [
    {
      "ticketNumber": "nomor tiket atau kosong jika tidak ada",
      "ticketTitle": "judul tiket",
      "branch": "nama cabang/lokasi hotel",
      "department": "IT/ME/Housekeeping/F&B/Operations/Other",
      "description": "deskripsi item yang perlu dibeli atau diperbaiki",
      "searchQuery": "kata kunci pencarian produk yang singkat dan spesifik untuk mencari harga di toko online, contoh: 'sensor pintu elektronik magnetic lock' atau 'AC split 1 PK Daikin'",
      "urgency": "normal/urgent/critical",
      "notes": "catatan tambahan dari tiket jika ada",
      "requestedBy": "nama yang membuat permintaan jika disebutkan",
      "requestDate": "tanggal permintaan dalam format DD/MM/YYYY jika disebutkan"
    }
  ],
  "totalTicketsRead": 1,
  "totalItemsFound": 1,
  "skippedTickets": 0,
  "summary": "ringkasan singkat dari hasil ekstraksi"
}`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Failed to parse Gemini response:', text);
    throw new Error('AI gagal memproses tiket. Coba lagi atau periksa format tiket.');
  }
}

/**
 * Step 2: For a single item, search the web (Google Search grounding)
 * to find a real current price range, including Google Shopping results.
 */
async function searchItemPrice(item) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    tools: [{ googleSearchRetrieval: {} }]
  });

  const query = item.searchQuery || item.description;

  const prompt = `Cari harga pasar saat ini di Indonesia untuk produk/jasa berikut: "${query}"

Konteks tambahan dari tiket: "${item.description}"

Gunakan hasil pencarian web (termasuk Google Shopping, Tokopedia, Shopee, Bukalapak, dan toko online lainnya) untuk menentukan kisaran harga yang realistis dalam Rupiah (IDR) di pasar Indonesia saat ini.

Jika ini adalah jasa perbaikan/service (bukan barang fisik), cari estimasi biaya jasa servis yang umum di Indonesia untuk pekerjaan sejenis.

Respond HANYA dengan JSON berikut, tanpa teks lain apapun:
{
  "estimatedPriceMin": <angka_integer_rupiah_atau_null_jika_benar_benar_tidak_ditemukan>,
  "estimatedPriceMax": <angka_integer_rupiah_atau_null_jika_benar_benar_tidak_ditemukan>,
  "priceSource": "ringkasan singkat sumber harga, contoh: 'Berdasarkan listing Tokopedia dan Shopee untuk produk sejenis'",
  "confidence": "high/medium/low"
}`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text);
    return {
      estimatedPriceMin: parsed.estimatedPriceMin ?? null,
      estimatedPriceMax: parsed.estimatedPriceMax ?? null,
      priceSource: parsed.priceSource || '',
      confidence: parsed.confidence || 'low'
    };
  } catch (err) {
    console.error(`Price search failed for "${query}":`, err.message);
    return { estimatedPriceMin: null, estimatedPriceMax: null, priceSource: 'Pencarian harga gagal', confidence: 'low' };
  }
}

/**
 * Full pipeline: extract items from tickets, then search real prices for each.
 * Returns the same shape as before, with estimatedPriceMin/Max now populated
 * from live web search instead of AI's trained-knowledge guess.
 */
async function extractFromTickets(ticketText) {
  const extracted = await extractItemsOnly(ticketText);

  if (!extracted.items || extracted.items.length === 0) {
    return extracted;
  }

  // Search prices for all items in parallel
  const pricedItems = await Promise.all(
    extracted.items.map(async (item) => {
      const priceInfo = await searchItemPrice(item);
      return { ...item, ...priceInfo };
    })
  );

  return { ...extracted, items: pricedItems };
}

module.exports = { extractFromTickets };
