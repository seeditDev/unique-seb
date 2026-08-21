/**
 * Compatibility layer that maps the small slice of the react-router-dom API this
 * app used onto TanStack Router. Keeps the legacy screens untouched while the
 * routing itself is owned by TanStack Start's file-based router.
 */
import React from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

function toHref(to) {
  if (typeof to === "string") return to;
  if (!to) return "/";
  const { pathname = "/", search = "", hash = "" } = to;
  return `${pathname}${search}${hash}`;
}

export function useNavigate() {
  const router = useRouter();
  return React.useCallback(
    (to, options = {}) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }
      const href = toHref(to);
      const state = options.state ?? (typeof to === "object" ? to.state : undefined);
      if (options.replace) router.history.replace(href, state);
      else router.history.push(href, state);
    },
    [router],
  );
}

export function useLocation() {
  const location = useRouterState({ select: (s) => s.location });
  return React.useMemo(
    () => ({
      pathname: location.pathname,
      search: location.searchStr ?? "",
      hash: location.hash ?? "",
      state: location.state || {},
      key: location.key,
    }),
    [location],
  );
}

export function useParams() {
  return useRouterState({ select: (s) => s.matches.at(-1)?.params ?? {} });
}

export function useSearchParams() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const setParams = React.useCallback(
    (next) => {
      const value = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      const qs = value.toString();
      navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
    },
    [location.pathname, navigate],
  );
  return [params, setParams];
}

export const Link = React.forwardRef(function Link(
  { to, replace, state, onClick, children, ...rest },
  ref,
) {
  const navigate = useNavigate();
  const href = toHref(to);
  return (
    <a
      ref={ref}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          rest.target === "_blank"
        ) {
          return;
        }
        event.preventDefault();
        navigate(href, { replace, state });
      }}
      {...rest}
    >
      {children}
    </a>
  );
});

export function Navigate({ to, replace = false, state }) {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(toHref(to), { replace, state });
  }, [navigate, to, replace, state]);
  return null;
}

export default { useNavigate, useLocation, useParams, useSearchParams, Link, Navigate };
