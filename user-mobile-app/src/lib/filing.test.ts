import {
  asciiDigits,
  emptyDraft,
  firstInvalidStep,
  isIsoDate,
  normalizeBdMobile,
  normalizeNid,
  toIntake,
  validateStep,
  type Draft,
} from '@/lib/filing';

function filled(overrides: Partial<Draft> = {}): Draft {
  const d = emptyDraft('bn', 1_700_000_000_000);
  return {
    ...d,
    applicant: { ...d.applicant, name: 'Rahima Begum', phone: '01712345678' },
    narrative: 'My husband beats me and took my dowry money.',
    ...overrides,
  };
}

describe('phone numbers', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['1712345678', '01712345678'],
    ['017-1234 5678', '01712345678'],
    ['০১৭১২৩৪৫৬৭৮', '01712345678'],
  ])('accepts %s as %s', (input, expected) => {
    expect(normalizeBdMobile(input)).toBe(expected);
  });

  it.each(['01212345678', '0171234567', '+19788458907', 'abc', ''])('rejects %s', (input) => {
    expect(normalizeBdMobile(input)).toBeNull();
  });
});

describe('NID numbers', () => {
  it('accepts 10, 13 and 17 digits, in either script', () => {
    expect(normalizeNid('1234567890')).toBe('1234567890');
    expect(normalizeNid('123 456 789 0123')).toBe('1234567890123');
    expect(normalizeNid('১২৩৪৫৬৭৮৯০১২৩৪৫৬৭')).toBe('12345678901234567');
  });

  it('rejects other lengths', () => {
    expect(normalizeNid('12345')).toBeNull();
    expect(normalizeNid('12345678901')).toBeNull();
  });
});

it('turns Bangla digits into ASCII', () => {
  expect(asciiDigits('বয়স ৪২')).toBe('বয়স 42');
});

it('checks ISO dates', () => {
  expect(isIsoDate('2026-10-12')).toBe(true);
  expect(isIsoDate('2026-02-30')).toBe(false);
  expect(isIsoDate('12/10/2026')).toBe(false);
});

describe('validateStep', () => {
  it('asks who filed for someone else, and how to reach them', () => {
    const d = filled({ forSelf: false });
    expect(validateStep('who', d)).toEqual({
      'proxy.name': 'required',
      'proxy.relation': 'required',
      'proxy.phone': 'required',
    });
    expect(validateStep('who', { ...d, proxy: { name: 'Karim', phone: '01812345678', relation: 'son' } })).toEqual(
      {}
    );
  });

  it('needs a name, and a phone when applying for yourself', () => {
    const d = emptyDraft();
    expect(validateStep('applicant', d)).toEqual({
      'applicant.name': 'required',
      'applicant.phone': 'required',
    });
  });

  it('does not need a phone for someone with no phone of their own', () => {
    const d = filled();
    const noPhone = { ...d, applicant: { ...d.applicant, phone: '', flags: ['no_own_phone' as const] } };
    expect(validateStep('applicant', noPhone)).toEqual({});
  });

  it('does not need the applicant phone when someone else files', () => {
    const d = filled({ forSelf: false });
    expect(validateStep('applicant', { ...d, applicant: { ...d.applicant, phone: '' } })).toEqual({});
  });

  it('checks the optional fields only when they are filled in', () => {
    const d = filled();
    const bad = { ...d, applicant: { ...d.applicant, phone: '12345', nid: '99', age: '130' } };
    expect(validateStep('applicant', bad)).toEqual({
      'applicant.phone': 'phone',
      'applicant.nid': 'nid',
      'applicant.age': 'age',
    });
    const bnAge = { ...d, applicant: { ...d.applicant, age: '৬৪' } };
    expect(validateStep('applicant', bnAge)).toEqual({});
  });

  it('needs at least ten characters about what happened (as the server does)', () => {
    expect(validateStep('problem', filled({ narrative: '' }))).toEqual({ narrative: 'required' });
    expect(validateStep('problem', filled({ narrative: 'help me' }))).toEqual({ narrative: 'tooShort' });
    expect(validateStep('problem', filled({ nextHearingDate: '2026-13-01' }))).toEqual({
      nextHearingDate: 'date',
    });
  });

  it('checks every step on review, and points at the first bad one', () => {
    const d = filled({ narrative: 'short' });
    expect(validateStep('review', d)).toEqual({ narrative: 'tooShort' });
    expect(firstInvalidStep(d)).toBe('problem');
    expect(firstInvalidStep(filled())).toBeNull();
  });
});

describe('toIntake', () => {
  it('builds the /intake/web body for someone applying for themselves', () => {
    const d = filled({
      applicant: {
        ...filled().applicant,
        phone: '+880 1712-345678',
        nid: '১২৩৪৫৬৭৮৯০',
        age: '৩৫',
        district: 'Rangpur',
        village: '  ',
        flags: ['low_literacy'],
      },
      respondent: { name: 'Jamal', relation: '' },
      safeWindow: { day: 2, start: 9, end: 12 },
      nextHearingDate: '2026-10-12',
    });
    expect(toIntake(d)).toEqual({
      applicant: {
        name: 'Rahima Begum',
        name_bn: undefined,
        phone: '01712345678',
        nid: '1234567890',
        guardian_name: undefined,
        village: undefined,
        upazila: undefined,
        district: 'Rangpur',
        age: 35,
        preferred_language: 'bn',
        accessibility_flags: ['low_literacy'],
      },
      narrative: 'My husband beats me and took my dowry money.',
      respondent: { name: 'Jamal', relation: undefined },
      safe_contact_windows: [{ day: 2, start_hour: 9, end_hour: 12 }],
      phone_monitored: false,
      next_hearing_date: '2026-10-12',
      client_ref: d.clientRef,
    });
  });

  it('includes the proxy only when filing for someone else', () => {
    expect(toIntake(filled()).proxy).toBeUndefined();
    const d = filled({ forSelf: false, proxy: { name: ' Karim ', phone: '8801812345678', relation: 'son' } });
    expect(toIntake(d).proxy).toEqual({ name: 'Karim', phone: '01812345678', relation: 'son' });
  });

  it('keeps the same client_ref, so sending twice files one case', () => {
    const d = filled();
    expect(toIntake(d).client_ref).toBe(toIntake(d).client_ref);
    expect(d.clientRef).toMatch(/^app:/);
  });
});
