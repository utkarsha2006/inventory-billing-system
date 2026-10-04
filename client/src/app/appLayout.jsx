import { useDispatch, useSelector } from 'react-redux';
import { NavLink, Outlet } from 'react-router-dom';
import { logout } from '../features/auth/authSlice.js';
import { Badge, Button, cx } from '../components/ui.jsx';
import { isStaff } from '../utils/roles.js';

const NAV = [
  { to: '/pos', label: 'POS', staffOnly: false },
  { to: '/dashboard', label: 'Dashboard', staffOnly: true },
  { to: '/products', label: 'Products', staffOnly: false },
  { to: '/invoices', label: 'Invoices', staffOnly: false },
  { to: '/reports', label: 'Reports', staffOnly: true },
];

export default function AppLayout() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const shop = useSelector((s) => s.auth.shop);
  const staff = isStaff(user.role);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          <div className="font-semibold text-indigo-700">{shop?.name ?? 'Shop'}</div>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {NAV.filter((n) => staff || !n.staffOnly).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx('rounded-md px-3 py-1.5 text-sm font-medium', isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{user.name}</span>
            <Badge color="blue">{user.role}</Badge>
            <Button variant="secondary" size="sm" onClick={() => dispatch(logout())}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] p-4">
        <Outlet />
      </main>
    </div>
  );
}