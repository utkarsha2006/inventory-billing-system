const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

// Indian numbering: thousand, lakh (1e5), crore (1e7). Crores keep recursing, so 100 crore reads "One Hundred Crore".
export function integerToWords(value) {
  if (value === 0) return 'Zero';
  let n = value;
  const parts = [];

  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

export function amountInWords(paise) {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new RangeError('Amount must be a non-negative integer (paise)');
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;

  let words = rupees ? `Rupees ${integerToWords(rupees)}` : '';
  if (ps) words += `${rupees ? ' and ' : ''}${twoDigits(ps)} Paise`;
  if (!words) words = 'Rupees Zero';
  return `${words} Only`;
}