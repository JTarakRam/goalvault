import { NavLink, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";

export function BottomNav() {
  const nav = useNavigate();
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");
  return (
    <nav className="nav" aria-label="Main">
      <NavLink to="/" end className={cls}>
        <Icon name="home" /> Home
      </NavLink>
      <NavLink to="/goals" className={cls}>
        <Icon name="goals" /> Goals
      </NavLink>
      <button className="fab" aria-label="New goal" onClick={() => nav("/new")}>
        <Icon name="plus" size={26} stroke={2.4} />
      </button>
      <NavLink to="/activity" className={cls}>
        <Icon name="activity" /> Activity
      </NavLink>
      <NavLink to="/trust" className={cls}>
        <Icon name="shield" /> Safety
      </NavLink>
    </nav>
  );
}

export function BackButton({ to }: { to?: string }) {
  const nav = useNavigate();
  return (
    <button className="back" onClick={() => (to ? nav(to) : nav(-1))}>
      <Icon name="back" size={18} /> Back
    </button>
  );
}
