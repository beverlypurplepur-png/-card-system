import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BaraBaraApp } from "./app";
import { baraBaraStyles } from "./styles";

const CardSystemPage = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = baraBaraStyles;
    shadow.append(style);
    setRoot(shadow);
    return () => {
      setRoot(null);
      style.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{ display: "block", height: "100%", overflow: "auto" }}
    >
      {root ? createPortal(<BaraBaraApp />, root) : null}
    </div>
  );
};

export const Component = CardSystemPage;
