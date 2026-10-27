import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import "./ProfileSectionNav.css";

// O mesmo componente atende páginas longas e perfis com painéis alternáveis.
export default function ProfileSectionNav({ items, label, mode = "sections", activeKey, onSelect }) {
  const [visibleSection, setVisibleSection] = useState(items[0]?.key);
  useEffect(() => {
    if (mode !== "sections") return undefined;
    const onScroll = () => {
      const navHeight = document.querySelector(".cut-profile-section-nav")?.getBoundingClientRect().height || 60;
      const appNavHeight = document.querySelector(".cut-navbar")?.getBoundingClientRect().height
        || parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cut-nav-height")) || 64;
      const threshold = appNavHeight + navHeight + 24;
      let current = items[0]?.key;
      for (const item of items) {
        const section = document.getElementById(item.targetId);
        if (section && section.getBoundingClientRect().top <= threshold) current = item.key;
      }
      setVisibleSection((previous) => previous === current ? previous : current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items, mode]);

  const select = (item) => {
    if (mode === "tabs") {
      onSelect?.(item.key);
      return;
    }
    const target = document.getElementById(item.targetId);
    if (!target) return;
    setVisibleSection(item.key);
    const navHeight = document.querySelector(".cut-profile-section-nav")?.getBoundingClientRect().height || 60;
    const appNavHeight = document.querySelector(".cut-navbar")?.getBoundingClientRect().height
      || parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cut-nav-height")) || 64;
    const top = target.getBoundingClientRect().top + window.scrollY - navHeight - appNavHeight - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <nav className="cut-profile-section-nav" aria-label={label}>
      <div className="cut-profile-section-nav__list" role={mode === "tabs" ? "tablist" : undefined}>
        {items.map((item) => {
          const selected = (mode === "tabs" ? activeKey : visibleSection) === item.key;
          return <button key={item.key} type="button" role={mode === "tabs" ? "tab" : undefined}
            aria-selected={mode === "tabs" ? selected : undefined}
            aria-current={mode === "sections" && selected ? "location" : undefined}
            className={selected ? "is-active" : ""} onClick={() => select(item)}>{item.label}</button>;
        })}
      </div>
    </nav>
  );
}
ProfileSectionNav.propTypes = {
  label: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired, label: PropTypes.string.isRequired, targetId: PropTypes.string,
  })).isRequired,
  mode: PropTypes.oneOf(["sections", "tabs"]),
  activeKey: PropTypes.string,
  onSelect: PropTypes.func,
};
