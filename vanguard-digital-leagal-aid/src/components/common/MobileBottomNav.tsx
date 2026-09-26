import React from 'react';
import { UserRole } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { 
  Building2, 
  Smartphone, 
  UserCheck, 
  Scale, 
  Briefcase,
  AlertCircle
} from 'lucide-react';
import { getStoredCases, getOfflineQueue } from '../../utils/storage';

interface MobileBottomNavProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRole,
  onRoleChange,
}) => {
  const { language } = useLanguage();
  const cases = getStoredCases();
  const urgentCount = cases.filter(c => c.priority === 'urgent').length;
  const offlineQueueCount = getOfflineQueue().length;

  const navItems: {
    role: UserRole;
    label: string;
    sublabel: string;
    icon: React.FC<{ className?: string }>;
    badge?: number | string | null;
    badgeColor?: string;
  }[] = [
    {
      role: 'dlao',
      label: 'DLAO',
      sublabel: language === 'bn' ? 'ট্রায়াজ' : 'Triage',
      icon: Building2,
      badge: urgentCount > 0 ? `${urgentCount}` : null,
      badgeColor: 'bg-red-500 text-white',
    },
    {
      role: 'udc',
      label: 'UDC',
      sublabel: language === 'bn' ? 'ইনটেক' : 'Intake',
      icon: Smartphone,
      badge: offlineQueueCount > 0 ? `${offlineQueueCount}` : null,
      badgeColor: 'bg-amber-500 text-slate-950 font-bold',
    },
    {
      role: 'citizen',
      label: language === 'bn' ? 'নাগরিক' : 'Citizen',
      sublabel: language === 'bn' ? 'ট্র্যাকিং' : 'Track',
      icon: UserCheck,
      badge: null,
    },
    {
      role: 'mediator',
      label: 'ADR',
      sublabel: language === 'bn' ? 'মধ্যস্থতা' : 'Mediation',
      icon: Scale,
      badge: null,
    },
    {
      role: 'lawyer',
      label: language === 'bn' ? 'আইনজীবী' : 'Lawyer',
      sublabel: language === 'bn' ? 'প্যানেল' : 'Panel',
      icon: Briefcase,
      badge: null,
    },
  ];

  return (
    <nav
      role="navigation"
      aria-label="মোবাইল প্রধান নেভিগেশন বার"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 shadow-2xl transition-all select-none"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)',
      }}
    >
      <div className="grid grid-cols-5 h-[58px] items-center px-1">
        {navItems.map((item) => {
          const isActive = currentRole === item.role;
          const Icon = item.icon;

          return (
            <button
              key={item.role}
              type="button"
              onClick={() => onRoleChange(item.role)}
              className={`relative flex flex-col items-center justify-center h-full py-1 transition-all duration-150 active:scale-95 touch-manipulation cursor-pointer ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active pill background highlight */}
              {isActive && (
                <span className="absolute top-1.5 w-10 h-7 rounded-xl bg-emerald-500/15 -z-0 transition-all duration-200" />
              )}

              {/* Icon container + badge */}
              <div className="relative z-10">
                <Icon className={`w-5 h-5 transition-transform duration-150 ${isActive ? 'scale-110 text-emerald-400' : ''}`} />
                {item.badge && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ring-2 ring-slate-950 animate-pulse ${
                      item.badgeColor || 'bg-red-500 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className={`text-[11px] leading-tight mt-1 transition-colors z-10 ${isActive ? 'text-emerald-300 font-extrabold' : 'text-slate-400'}`}>
                {item.label}
              </span>

              {/* Active dot */}
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-0.5 shadow-sm shadow-emerald-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
