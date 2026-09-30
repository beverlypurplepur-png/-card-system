import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useState } from "react";

type RouterValue = {
  path: string;
  navigate: (path: string) => void;
};

const RouterContext = createContext<RouterValue | null>(null);

export const BaraBaraRouter = ({ children }: PropsWithChildren) => {
  const [path, setPath] = useState("/");
  const value = useMemo(
    () => ({
      path,
      navigate: (nextPath: string) => setPath(nextPath),
    }),
    [path],
  );

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
};

const useRouter = () => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error("BaraBara router is unavailable");
  }
  return router;
};

export const useNavigate = () => useRouter().navigate;

export const useParams = () => {
  const { path } = useRouter();
  const match = /^\/decks\/([^/]+)/.exec(path);
  return { deckId: match?.[1] };
};

export const useBaraBaraPath = () => useRouter().path;

export const Link = ({
  to,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => {
  const navigate = useNavigate();
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          navigate(to);
        }
      }}
    />
  );
};
