import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Columns2,
  Home,
  Info,
  Menu,
  MessageSquare,
  Shield,
  User,
  X,
} from 'lucide-react';
import { useInsureMate } from '../context/InsureMateContext';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/find', label: 'Find Insurance', icon: MessageSquare },
  { to: '/saved', label: 'Saved Plans', icon: Bookmark },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/about', label: 'About', icon: Info },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { comparePolicyIds, clearCompare, recommendations } = useInsureMate();
  const location = useLocation();
  const navigate = useNavigate();

  const showCompareBar =
    comparePolicyIds.length > 0 && !location.pathname.startsWith('/compare');

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FFFFFF] text-[#171717]">
      {/* Mobile Header (<= 15% mobile height) */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-[#F7F7F7] border-b border-[#E5E5E5]">
        <Link
          to="/"
          className="flex items-center gap-2 text-[#171717] font-semibold text-base tracking-tight whitespace-nowrap shrink-0"
        >
          <Shield className="w-5 h-5 stroke-[2]" aria-hidden="true" />
          <span>InsureMate</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="p-2 rounded-md text-[#171717] hover:bg-[#EAEAEA] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (#F7F7F7) */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 bg-[#F7F7F7] border-r border-[#E5E5E5] flex flex-col transition-transform duration-150 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="px-5 h-16 flex items-center justify-between border-b border-[#E5E5E5]">
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 text-[#171717] font-semibold text-[17px] tracking-tight whitespace-nowrap shrink-0"
          >
            <Shield className="w-5 h-5 stroke-[2]" aria-hidden="true" />
            <span>InsureMate</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            className="md:hidden p-1.5 rounded-md text-[#737373] hover:text-[#171717]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#EAEAEA] text-[#171717] font-medium'
                      : 'text-[#525252] hover:bg-[#EFEFEF] hover:text-[#171717]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0 stroke-[1.9]" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {recommendations && (
            <div className="pt-4 mt-4 border-t border-[#E5E5E5] space-y-1">
              <NavLink
                to="/recommendations"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#EAEAEA] text-[#171717] font-medium'
                      : 'text-[#525252] hover:bg-[#EFEFEF] hover:text-[#171717]'
                  }`
                }
              >
                <span>Recommendations</span>
                <span className="text-xs text-[#737373] tabular-nums">
                  {recommendations.recommendations.length}
                </span>
              </NavLink>
            </div>
          )}

          {comparePolicyIds.length > 0 && (
            <NavLink
              to="/compare"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#EAEAEA] text-[#171717] font-medium'
                    : 'text-[#525252] hover:bg-[#EFEFEF] hover:text-[#171717]'
                }`
              }
            >
              <span className="flex items-center gap-3">
                <Columns2 className="w-4 h-4 shrink-0 stroke-[1.9]" aria-hidden="true" />
                <span>Compare Plans</span>
              </span>
              <span className="text-xs text-[#737373] tabular-nums">
                {comparePolicyIds.length}
              </span>
            </NavLink>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <main className={`flex-1 ${showCompareBar ? 'pb-20' : ''}`}>{children}</main>

        {showCompareBar && (
          <div className="sticky bottom-0 z-20 bg-[#FFFFFF] border-t border-[#E5E5E5] px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
            <div className="text-sm text-[#171717] truncate">
              <span className="font-medium tabular-nums">{comparePolicyIds.length}</span>{' '}
              {comparePolicyIds.length === 1 ? 'plan' : 'plans'} selected for comparison
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={clearCompare}
                className="px-3 py-1.5 text-xs font-medium text-[#737373] hover:text-[#171717] transition-colors whitespace-nowrap"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => navigate('/compare')}
                className="px-4 py-2 text-xs font-medium bg-[#171717] text-[#FFFFFF] rounded-lg hover:bg-[#2E2E2E] transition-colors whitespace-nowrap shrink-0"
              >
                Compare Selected
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
