import { Language, PriorityLevel, CaseStatus } from '../types';

// Category mapping between Bangla and English
export const CATEGORY_MAP: Record<string, { bn: string; en: string }> = {
  'পারিবারিক সহিংসতা ও শিশু সুরক্ষা': {
    bn: 'পারিবারিক সহিংসতা ও শিশু সুরক্ষা',
    en: 'Domestic Violence & Child Protection',
  },
  'বাল্যবিয়ে প্রতিরোধ ও জোরপূর্বক আটক': {
    bn: 'বাল্যবিয়ে প্রতিরোধ ও জোরপূর্বক আটক',
    en: 'Child Marriage Prevention & Detention',
  },
  'জমি জবরদখল ও এতিমের সম্পত্তি বেদখল': {
    bn: 'জমি জবরদখল ও এতিমের সম্পত্তি বেদখল',
    en: 'Land Encroachment & Property Grabbing',
  },
  'দেনমোহর ও সন্তানের খোরপোশ': {
    bn: 'দেনমোহর ও সন্তানের খোরপোশ',
    en: 'Dower & Child Maintenance',
  },
  'প্রবাসী শ্রমিকের ক্ষতিপূরণ ও প্রতারণা': {
    bn: 'প্রবাসী শ্রমিকের ক্ষতিপূরণ ও প্রতারণা',
    en: 'Migrant Worker Compensation & Fraud',
  },
  'শারীরিক নির্যাতন ও অ্যাসিড সন্ত্রাসের হুমকি': {
    bn: 'শারীরিক নির্যাতন ও অ্যাসিড সন্ত্রাসের হুমকি',
    en: 'Physical Abuse & Acid Violence Threat',
  },
  'পৈতৃক ভিটা সুরক্ষা ও বেদখল প্রতিরোধ': {
    bn: 'পৈতৃক ভিটা সুরক্ষা ও বেদখল প্রতিরোধ',
    en: 'Ancestral Land Protection',
  },
  'নারী ও শিশু নির্যাতন দমন আইন ট্রাইব্যুনাল': {
    bn: 'নারী ও শিশু নির্যাতন দমন আইন ট্রাইব্যুনাল',
    en: 'Women & Child Repression Prevention Tribunal',
  },
  'পারিবারিক খোরপোশ ও নাবালকের দেনমোহর': {
    bn: 'পারিবারিক খোরপোশ ও নাবালকের দেনমোহর',
    en: 'Family Maintenance & Minor Dower',
  },
  'দেওয়ানি বণ্টন মোকদ্দমা': {
    bn: 'দেওয়ানি বণ্টন মোকদ্দমা',
    en: 'Civil Partition Suit',
  },
  'Sensitive/Image Harassment': {
    bn: 'সংবেদনশীল / ছবি হয়রানি',
    en: 'Sensitive / Image Harassment',
  },
  'সংবেদনশীল / ছবি হয়রানি': {
    bn: 'সংবেদনশীল / ছবি হয়রানি',
    en: 'Sensitive / Image Harassment',
  },
  'পারিবারিক সহিংসতা ও যৌতুক': {
    bn: 'পারিবারিক সহিংসতা ও যৌতুক',
    en: 'Domestic Violence & Dowry',
  },
  'পারিবারিক সহিংসতা ও শারীরিক নির্যাতন': {
    bn: 'পারিবারিক সহিংসতা ও শারীরিক নির্যাতন',
    en: 'Domestic Violence & Physical Abuse',
  },
  'যৌতুক নির্যাতন ও শারীরিক ক্ষতিপূরণ': {
    bn: 'যৌতুক নির্যাতন ও শারীরিক ক্ষতিপূরণ',
    en: 'Dowry Torture & Physical Compensation',
  },
  'দেনমোহর ও সন্তানের ভরণপোষণ দাবি': {
    bn: 'দেনমোহর ও সন্তানের ভরণপোষণ দাবি',
    en: 'Dower & Child Maintenance Claim',
  },
  'দেনমোহর ও সন্তানের ভরণপোষণ': {
    bn: 'দেনমোহর ও সন্তানের ভরণপোষণ',
    en: 'Dower & Child Maintenance',
  },
  'প্রবাসী শ্রমিকের ক্ষতিপূরণ ও মজুরি': {
    bn: 'প্রবাসী শ্রমিকের ক্ষতিপূরণ ও মজুরি',
    en: 'Migrant Worker Compensation & Wages',
  },
  'সাইবার বুলিং ও ব্ল্যাকমেইল': {
    bn: 'সাইবার বুলিং ও ব্ল্যাকমেইল',
    en: 'Cyberbullying & Blackmail',
  },
  'Land Encroachment Protection': {
    bn: 'পৈতৃক ভিটা সুরক্ষা ও বেদখল প্রতিরোধ',
    en: 'Ancestral Land Protection',
  },
};

export const translateCategory = (cat: string, lang: Language): string => {
  if (!cat) return '';
  const cleanCat = cat.replace(/\s*\([^)]*\)/g, '').trim();
  const entry = CATEGORY_MAP[cleanCat] || CATEGORY_MAP[cat];
  if (entry) {
    return lang === 'bn' ? entry.bn : entry.en;
  }
  // If no entry found but string has parentheses, strip them according to language
  if (cat.includes('(')) {
    const match = cat.match(/([^(]+)\(([^)]+)\)/);
    if (match) {
      const part1 = match[1].trim();
      const part2 = match[2].trim();
      const isPart2English = /[A-Za-z]/.test(part2);
      if (lang === 'en') return isPart2English ? part2 : part1;
      return isPart2English ? part1 : part2;
    }
  }
  return cleanCat;
};

export const translateStatus = (status: CaseStatus | string, lang: Language): string => {
  switch (status) {
    case 'new':
      return lang === 'bn' ? 'নতুন' : 'New';
    case 'assigned':
    case 'lawyer_assigned':
      return lang === 'bn' ? 'আইনজীবী নিযুক্ত' : 'Lawyer Assigned';
    case 'adr_scheduled':
      return lang === 'bn' ? 'এডিআর নির্ধারিত' : 'ADR Scheduled';
    case 'investigation':
      return lang === 'bn' ? 'তদন্তাধীন' : 'Under Investigation';
    case 'hearing_pending':
      return lang === 'bn' ? 'শুনানি অপেক্ষমাণ' : 'Hearing Pending';
    case 'closed':
      return lang === 'bn' ? 'নিষ্পত্তিকৃত' : 'Resolved';
    case 'under_review':
      return lang === 'bn' ? 'পর্যালোচনাধীন' : 'Under Review';
    default:
      return status;
  }
};

export const translatePriority = (priority: PriorityLevel | string, lang: Language): string => {
  switch (priority) {
    case 'urgent':
      return lang === 'bn' ? 'জরুরি' : 'Urgent';
    case 'medium':
      return lang === 'bn' ? 'মাঝারি' : 'Medium';
    case 'routine':
      return lang === 'bn' ? 'সাধারণ' : 'Routine';
    default:
      return priority;
  }
};

export const translateAISummary = (summary: string, lang: Language): string => {
  if (!summary) return '';
  // Check if summary matches "English (Bangla)"
  if (summary.includes('(')) {
    const bnMatch = summary.match(/\(([^)]+)\)/);
    const enMatch = summary.split('(')[0]?.trim();
    if (lang === 'bn' && bnMatch && bnMatch[1]) {
      return bnMatch[1].trim();
    }
    if (lang === 'en' && enMatch) {
      return enMatch;
    }
  }

  // Known special summaries:
  if (summary.includes('Elderly Farmer Land Dispute') || summary.includes('বৃদ্ধ কৃষকের জমি সংক্রান্ত বিরোধ')) {
    return lang === 'bn' ? 'বৃদ্ধ কৃষকের জমি সংক্রান্ত বিরোধ' : 'Elderly Farmer Land Dispute';
  }
  if (summary.includes('Ongoing violence') || summary.includes('শারীরিক নির্যাতন চলমান')) {
    return lang === 'bn' ? 'শারীরিক নির্যাতন চলমান ও ৪ বছরের শিশু ঝুঁকিতে' : 'Ongoing violence + Child present';
  }
  if (summary.includes('Child Marriage') || summary.includes('বাল্যবিয়ে')) {
    return lang === 'bn' ? 'অপ্রাপ্তবয়স্ক কন্যার জোরপূর্বক বিবাহ আয়োজন' : 'Child Marriage threat + Detention reported';
  }
  if (summary.includes('Cyber Blackmail') || summary.includes('নাবিলার ছবি বিকৃত')) {
    return lang === 'bn' ? 'নাবিলার ছবি বিকৃত করে ব্ল্যাকমেইল ও এখতিয়ার বিরোধ' : 'Cyber Blackmail + Morphing';
  }

  return summary;
};

export const translateSuggestedAction = (action: string, lang: Language): string => {
  if (!action) return '';
  const cleanAction = action.replace(/\s*\([^)]*\)/g, '').trim();
  if (lang === 'bn') return cleanAction;

  if (action.includes('ভিকটিম সাপোর্ট সেল')) {
    return 'Immediate dispatch of protection notice to Victim Support Cell & local police';
  }
  if (action.includes('মোবাইল কোর্ট') || action.includes('UNO')) {
    return 'Immediate Mobile Court request to UNO & Women Affairs Officer';
  }
  if (action.includes('ADR') || action.includes('এডিআর') || action.includes('বিকল্প বিরোধ')) {
    return 'Issue ADR notice from Legal Aid Office and advise Section 144 injunction';
  }
  if (action.includes('পারিবারিক আদালত')) {
    return 'Convene mediation meeting and issue notice under Family Courts Act';
  }
  if (action.includes('ওয়েজ আর্নার্স') || action.includes('বায়রা')) {
    return 'Legal notice in coordination with Wage Earners Board & BAIRA';
  }
  if (action.includes('পুলিশ প্রটেকশন') || action.includes('৯৯৯')) {
    return 'Immediate police protection order and 999 SOS response activation';
  }
  if (action.includes('দেওয়ানি') || action.includes('সহকারী জজ')) {
    return 'Submit injunction petition in Assistant Judge Civil Court';
  }
  if (action.includes('জরুরি শুনানি') || action.includes('জবাবদিহিতা')) {
    return 'Summon emergency hearing report and ensure accountability';
  }
  if (action.includes('প্রতিস্থাপন') || action.includes('ব্যাখ্যা তলব')) {
    return 'Request lawyer replacement or formal explanation';
  }
  if (action.includes('অগ্রগতি রিভিউ')) {
    return 'Review case progress';
  }
  if (action.includes('চিফ অফিসার') || action.includes('সাইবার ট্রাইব্যুনাল')) {
    return 'Chief Officer intervention and Cyber Tribunal protection notice';
  }

  return cleanAction;
};

export const cleanPersonName = (name: string, lang: Language): string => {
  if (!name) return '';
  if (name.includes('(')) {
    const match = name.match(/([^(]+)\(([^)]+)\)/);
    if (match) {
      const part1 = match[1].trim();
      const part2 = match[2].trim();
      const isPart2English = /[A-Za-z]/.test(part2);
      if (lang === 'en') {
        return isPart2English ? part2 : part1;
      } else {
        return isPart2English ? part1 : part2;
      }
    }
  }
  return name;
};

export const translateChannel = (channel: string, lang: Language): string => {
  switch (channel) {
    case 'udc':
      return lang === 'bn' ? 'ইউনিয়ন ডিজিটাল সেন্টার' : 'Union Digital Center';
    case 'hotline':
      return lang === 'bn' ? 'হটলাইন ১৬৪৩০' : 'Hotline 16430';
    case 'web':
      return lang === 'bn' ? 'অনলাইন পোর্টাল' : 'Web Portal';
    case 'court_cell':
      return lang === 'bn' ? 'কোর্ট সেল' : 'Court Cell';
    case 'police_referral':
      return lang === 'bn' ? 'থানা রেফারেল' : 'Police Referral';
    default:
      return lang === 'bn' ? 'লিগ্যাল এইড অফিস' : 'Legal Aid Office';
  }
};

export const translateTimeAgo = (timeAgo: string, lang: Language): string => {
  if (!timeAgo) return '';
  const clean = timeAgo.replace(/\s*\([^)]*\)/g, '').trim();
  if (lang === 'bn') return clean;
  if (clean.includes('ঘণ্টা')) return '2 hours ago';
  if (clean.includes('মিনিট')) return '30 mins ago';
  if (clean.includes('দিন')) return clean.includes('১৪') ? '14 days ago' : clean.includes('২৮') ? '28 days ago' : clean.includes('২') ? '2 days ago' : clean.includes('৩') ? '3 days ago' : 'Few days ago';
  if (clean.includes('মাস')) return '1 month ago';
  if (clean.includes('এইমাত্র')) return 'Just now';
  return clean;
};
