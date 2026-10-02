import { asyncHandler } from '../utils/asyncHandler.js';
import * as returnService from '../services/return.service.js';
import * as pdfService from '../services/invoicePdf.service.js';
import { presentCreditNote } from '../services/presenters.js';

const BARRED_WARNING =
  'This credit note was issued after 30 November following the financial year of the original invoice. ' +
  'It is valid for the customer, but its GST can no longer be reduced from your output tax (CGST Act, Section 34).';

export const create = asyncHandler(async (req, res) => {
  const { creditNote, replay } = await returnService.createReturn(req.user, req.params.id, req.body);
  const meta = {
    ...(replay && { idempotentReplay: true }),
    ...(creditNote.taxReductionBarred && { warning: BARRED_WARNING }),
  };
  res.status(replay ? 200 : 201).json({
    success: true,
    data: presentCreditNote(creditNote),
    ...(Object.keys(meta).length && { meta }),
  });
});

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await returnService.listCreditNotes(req.user.shopId, req.query);
  res.json({ success: true, data: items, meta });
});

export const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: presentCreditNote(await returnService.getCreditNote(req.user.shopId, req.params.id)) });
});

export const pdf = asyncHandler(async (req, res) => {
  const { format, widthMm, download } = req.query;
  const { buffer, filename } = await pdfService.getCreditNotePdf(req.user.shopId, req.params.id, { format, widthMm });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': buffer.length,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    'Cache-Control': 'private, no-cache',
  });
  res.send(buffer);
});