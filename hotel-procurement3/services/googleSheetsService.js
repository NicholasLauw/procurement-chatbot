const { google } = require('googleapis');

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key:   (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  });
}

// ─── Find or create the sheet ─────────────────────────────────
async function getOrCreateSheet() {
  const auth      = getAuth();
  const drive     = google.drive({ version: 'v3', auth });
  const sheets    = google.sheets({ version: 'v4', auth });
  const folderId  = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Hotel Procurement';

  const search = await drive.files.list({
    q: `'${folderId}' in parents and name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id,name)'
  });

  let spreadsheetId;

  if (search.data.files.length > 0) {
    spreadsheetId = search.data.files[0].id;
  } else {
    // Create new sheet
    const created = await drive.files.create({
      requestBody: { name: sheetName, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folderId] },
      fields: 'id'
    });
    spreadsheetId = created.data.id;

    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [getHeaders()] }
    });

    // Format header
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: {
                backgroundColor: { red: 0.102, green: 0.169, blue: 0.290 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE'
              }},
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: getHeaders().length } } }
        ]
      }
    });
  }

  return { spreadsheetId, sheets, drive };
}

function getHeaders() {
  return [
    'ID', 'Tanggal Input', 'No. Tiket', 'Judul Tiket', 'Cabang',
    'Dept', 'Deskripsi', 'Estimasi Harga', 'Harga Fix (IDR)',
    'Lunas', 'Status', 'Hari', 'Diminta Oleh', 'Tanggal Permintaan',
    'Urgensi', 'Catatan', 'Diinput Oleh'
  ];
}

// ─── Get the next ID by counting existing rows ────────────────
async function getNextId(sheets, spreadsheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A:A' });
    const rows = res.data.values || [];
    return Math.max(rows.length, 1); // subtract 1 for header, +1 for next
  } catch { return 1; }
}

// ─── Append extracted items to the sheet ─────────────────────
async function appendItemsToSheet(items, submittedBy) {
  const { spreadsheetId, sheets } = await getOrCreateSheet();
  const today = new Date().toLocaleDateString('id-ID');
  const nextId = await getNextId(sheets, spreadsheetId);

  const rows = items.map((item, i) => {
    const priceRange = item.estimatedPriceMin && item.estimatedPriceMax
      ? `Rp ${Number(item.estimatedPriceMin).toLocaleString('id-ID')} - Rp ${Number(item.estimatedPriceMax).toLocaleString('id-ID')}`
      : 'Tidak ditemukan';

    const combinedNotes = [item.notes, item.priceSource ? `[Sumber harga: ${item.priceSource}]` : '']
      .filter(Boolean)
      .join(' | ');

    return [
      nextId + i,                      // ID
      today,                           // Tanggal Input
      item.ticketNumber || '-',        // No. Tiket
      item.ticketTitle || '-',         // Judul Tiket
      item.branch || '-',              // Cabang
      item.department || 'Other',      // Dept
      item.description,                // Deskripsi
      priceRange,                      // Estimasi Harga
      '',                              // Harga Fix — filled by purchasing team
      'Belum Lunas',                   // Lunas
      'Pending',                       // Status
      '=TODAY()-B' + (nextId + i + 1), // Hari — formula: days since input
      item.requestedBy || '-',         // Diminta Oleh
      item.requestDate || today,       // Tanggal Permintaan
      item.urgency || 'normal',        // Urgensi
      combinedNotes,                   // Catatan (termasuk sumber harga)
      submittedBy                      // Diinput Oleh
    ];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:A',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });

  // Get sheet URL
  const auth  = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const file  = await drive.files.get({ fileId: spreadsheetId, fields: 'webViewLink' });

  return {
    success: true,
    rowsAdded: rows.length,
    spreadsheetUrl: file.data.webViewLink
  };
}

module.exports = { appendItemsToSheet };
