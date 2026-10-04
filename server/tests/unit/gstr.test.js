import { classifyB2C, computeSetOff, uqcOf, B2CL_THRESHOLD_PAISE } from '../../src/utils/gstr.js';

describe('classifyB2C', () => {
  test('only inter-state invoices ABOVE ₹1 lakh are large', () => {
    expect(B2CL_THRESHOLD_PAISE).toBe(10_000_000);
    expect(classifyB2C({ supplyType: 'INTER', grandTotalPaise: 10_000_001 })).toBe('B2CL');
    expect(classifyB2C({ supplyType: 'INTER', grandTotalPaise: 10_000_000 })).toBe('B2CS');
    expect(classifyB2C({ supplyType: 'INTRA', grandTotalPaise: 99_999_999 })).toBe('B2CS');
  });
});

test('uqcOf maps units to GST quantity codes', () => {
  expect(uqcOf('KG')).toBe('KGS');
  expect(uqcOf('PCS')).toBe('PCS');
  expect(uqcOf('L')).toBe('LTR');
  expect(uqcOf('UNKNOWN')).toBe('OTH');
});

describe('computeSetOff', () => {
  const t = (igst, cgst, sgst) => ({ igst, cgst, sgst });

  test('each credit pays its own head first', () => {
    const r = computeSetOff(t(100, 50, 50), t(30, 20, 10));
    expect(r.cashPayable).toEqual(t(70, 30, 40));
    expect(r.creditCarriedForward).toEqual(t(0, 0, 0));
  });

  test('surplus IGST credit flows to CGST then SGST', () => {
    const r = computeSetOff(t(100, 50, 20), t(200, 0, 0));
    expect(r.cashPayable).toEqual(t(0, 0, 0));
    expect(r.creditCarriedForward).toEqual(t(30, 0, 0));
  });

  test('surplus CGST credit can pay IGST', () => {
    const r = computeSetOff(t(40, 10, 0), t(0, 30, 0));
    expect(r.cashPayable).toEqual(t(20, 0, 0));
    expect(r.creditCarriedForward).toEqual(t(0, 0, 0));
  });

  test('CGST credit can never pay SGST, and SGST credit can never pay CGST', () => {
    expect(computeSetOff(t(0, 0, 50), t(0, 100, 0))).toMatchObject({ cashPayable: t(0, 0, 50), creditCarriedForward: t(0, 100, 0) });
    expect(computeSetOff(t(0, 50, 0), t(0, 0, 100))).toMatchObject({ cashPayable: t(0, 50, 0), creditCarriedForward: t(0, 0, 100) });
  });

  test('IGST credit is used before CGST/SGST credit against IGST', () => {
    const r = computeSetOff(t(50, 50, 0), t(30, 40, 0));
    expect(r.cashPayable).toEqual(t(20, 10, 0));
  });

  test('money is conserved on random inputs', () => {
    let seed = 424242;
    const rnd = (n) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    for (let i = 0; i < 300; i += 1) {
      const liability = t(rnd(5000), rnd(5000), rnd(5000));
      const itc = t(rnd(5000), rnd(5000), rnd(5000));
      const { cashPayable, creditCarriedForward, utilised } = computeSetOff(liability, itc);

      const used = Object.values(utilised).reduce((a, u) => a + u.igst + u.cgst + u.sgst, 0);
      const sum = (v) => v.igst + v.cgst + v.sgst;
      expect(sum(liability) - used).toBe(sum(cashPayable));
      expect(sum(itc) - used).toBe(sum(creditCarriedForward));
      for (const head of ['igst', 'cgst', 'sgst']) {
        expect(cashPayable[head]).toBeGreaterThanOrEqual(0);
        expect(creditCarriedForward[head]).toBeGreaterThanOrEqual(0);
      }
      expect(utilised.cgst.sgst + utilised.sgst.cgst).toBe(0); // CGST and SGST credit never cross
    }
  });
});